BEGIN;

CREATE OR REPLACE FUNCTION public.persist_publication_batch_atomic(
    p_dataset TEXT,
    p_items JSONB,
    p_deadline_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    evidence JSONB;
    legacy JSONB;
    reason JSONB;
    v_evidence_id UUID;
    v_observation_id UUID;
    v_candidate_id UUID;
    published_count INTEGER := 0;
    quarantined_count INTEGER := 0;
    audit_count INTEGER := 0;
    remaining_ms INTEGER;
    warnings JSONB := '[]'::jsonb;
BEGIN
    IF p_dataset NOT IN ('intelligence', 'blog') THEN
        RAISE EXCEPTION 'Unsupported publication dataset: %', p_dataset;
    END IF;
    IF jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Publication batch must be a JSON array';
    END IF;
    IF p_deadline_at IS NOT NULL THEN
        remaining_ms := floor(
            extract(epoch FROM (p_deadline_at - clock_timestamp())) * 1000
        )::INTEGER;
        IF remaining_ms <= 0 THEN
            RAISE EXCEPTION 'Ingestion run deadline exhausted'
                USING ERRCODE = '57014';
        END IF;
        PERFORM set_config('statement_timeout', remaining_ms::TEXT, true);
    END IF;

    FOR item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF coalesce((item->>'duplicate')::BOOLEAN, false) THEN
            warnings := warnings || jsonb_build_array(
                format(
                    'Duplicate %s was rejected without changing the original record''s publication state.',
                    coalesce(item->>'idempotencyKey', p_dataset)
                )
            );
            CONTINUE;
        END IF;

        evidence := item->'evidence';
        SELECT e.id INTO v_evidence_id
        FROM public.intelligence_source_evidence AS e
        WHERE e.content_sha256 = evidence->>'contentHash'
          AND e.canonical_url IS NOT DISTINCT FROM nullif(evidence->>'canonicalUrl', '')
        ORDER BY created_at
        LIMIT 1;

        IF v_evidence_id IS NULL THEN
            INSERT INTO public.intelligence_source_evidence (
                source_url,
                canonical_url,
                source_name,
                source_type,
                source_published_at,
                retrieved_at,
                media_type,
                content_sha256,
                raw_payload,
                capture_metadata
            )
            VALUES (
                evidence->>'sourceUrl',
                nullif(evidence->>'canonicalUrl', ''),
                evidence->>'sourceName',
                CASE WHEN p_dataset = 'blog' THEN 'other' ELSE 'news' END,
                nullif(evidence->>'sourcePublishedAt', '')::TIMESTAMPTZ,
                (evidence->>'retrievedAt')::TIMESTAMPTZ,
                'application/json',
                evidence->>'contentHash',
                evidence->'rawPayload',
                jsonb_build_object(
                    'publication_gate', 'v1',
                    'idempotency_key', evidence->>'sourceRecordId',
                    'schema_valid', (item->>'schemaValid')::BOOLEAN
                )
            )
            RETURNING id INTO v_evidence_id;
        END IF;

        SELECT o.id INTO v_observation_id
        FROM public.intelligence_raw_observations AS o
        WHERE o.evidence_id = v_evidence_id
          AND o.source_record_id = evidence->>'sourceRecordId'
        LIMIT 1;

        IF v_observation_id IS NULL THEN
            INSERT INTO public.intelligence_raw_observations (
                evidence_id,
                source_record_id,
                country_code,
                observed_at,
                payload,
                extraction_method,
                extractor_version,
                payload_sha256
            )
            VALUES (
                v_evidence_id,
                evidence->>'sourceRecordId',
                nullif(evidence->>'countryCode', ''),
                (evidence->>'observedAt')::TIMESTAMPTZ,
                evidence->'rawPayload',
                'publication-gate',
                '1',
                evidence->>'contentHash'
            )
            RETURNING id INTO v_observation_id;
        END IF;

        SELECT c.id INTO v_candidate_id
        FROM public.intelligence_candidates AS c
        WHERE c.raw_observation_id = v_observation_id
        ORDER BY created_at
        LIMIT 1;

        IF v_candidate_id IS NULL THEN
            INSERT INTO public.intelligence_candidates (
                raw_observation_id,
                candidate_type,
                country_code,
                normalized_value,
                confidence,
                validation_state,
                validation_errors,
                validated_by,
                validated_at
            )
            VALUES (
                v_observation_id,
                CASE WHEN p_dataset = 'intelligence' THEN 'alert' ELSE 'other' END,
                nullif(evidence->>'countryCode', ''),
                evidence->'normalizedValue',
                (item->>'confidence')::NUMERIC,
                CASE WHEN item->>'decision' = 'publish'
                    THEN 'accepted' ELSE 'quarantined' END,
                item->'reasons',
                'publication-gate/v1',
                timezone('utc'::TEXT, now())
            )
            RETURNING id INTO v_candidate_id;
        ELSE
            UPDATE public.intelligence_candidates
            SET confidence = (item->>'confidence')::NUMERIC,
                validation_state = CASE WHEN item->>'decision' = 'publish'
                    THEN 'accepted' ELSE 'quarantined' END,
                validation_errors = item->'reasons',
                validated_by = 'publication-gate/v1',
                validated_at = timezone('utc'::TEXT, now())
            WHERE id = v_candidate_id;
        END IF;

        INSERT INTO public.intelligence_evidence_publications (
            evidence_id,
            publication_state,
            published_at
        )
        VALUES (
            v_evidence_id,
            CASE WHEN item->>'decision' = 'publish' THEN 'published' ELSE 'draft' END,
            CASE WHEN item->>'decision' = 'publish'
                THEN timezone('utc'::TEXT, now()) ELSE NULL END
        )
        ON CONFLICT (evidence_id) DO UPDATE
        SET publication_state = EXCLUDED.publication_state,
            published_at = EXCLUDED.published_at;

        IF item->>'decision' = 'quarantine' THEN
            FOR reason IN SELECT value FROM jsonb_array_elements(item->'reasons')
            LOOP
                INSERT INTO public.intelligence_quarantine_items (
                    candidate_id,
                    reason_code,
                    reason_detail,
                    review_state,
                    max_retries
                )
                VALUES (
                    v_candidate_id,
                    reason->>'code',
                    reason->>'detail',
                    'pending',
                    CASE WHEN (reason->>'retryable')::BOOLEAN THEN 3 ELSE 0 END
                )
                ON CONFLICT (candidate_id, reason_code)
                    WHERE candidate_id IS NOT NULL
                      AND review_state IN ('pending', 'in_review', 'retry_scheduled')
                DO NOTHING;
            END LOOP;
            quarantined_count := quarantined_count + 1;
        ELSE
            legacy := item->'legacyRecord';
            IF p_dataset = 'intelligence' THEN
                INSERT INTO public.intelligence_alerts (
                    title, summary, severity, category, "isoCode", "timeAgo",
                    source, actor, url, "imageUrl", created_at
                )
                VALUES (
                    legacy->>'title',
                    legacy->>'summary',
                    legacy->>'severity',
                    legacy->>'category',
                    legacy->>'isoCode',
                    legacy->>'timeAgo',
                    legacy->>'source',
                    nullif(legacy->>'actor', ''),
                    nullif(legacy->>'url', ''),
                    nullif(legacy->>'imageUrl', ''),
                    (legacy->>'created_at')::TIMESTAMPTZ
                )
                ON CONFLICT (title) DO NOTHING;
            ELSE
                INSERT INTO public.blog_posts (
                    title, summary, author, tag, url, created_at
                )
                VALUES (
                    legacy->>'title',
                    legacy->>'summary',
                    legacy->>'author',
                    legacy->>'tag',
                    legacy->>'url',
                    (legacy->>'created_at')::TIMESTAMPTZ
                )
                ON CONFLICT (url) DO NOTHING;
            END IF;
            published_count := published_count + 1;
        END IF;
        audit_count := audit_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'published', published_count,
        'quarantined', quarantined_count,
        'auditRecorded', audit_count,
        'trustStorageAvailable', true,
        'warnings', warnings,
        'errors', '[]'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_publication_batch_atomic(TEXT, JSONB, TIMESTAMPTZ)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_publication_batch_atomic(TEXT, JSONB, TIMESTAMPTZ)
TO service_role;

COMMIT;
