-- Atomically advances the legacy country rows and the trusted score publication.
-- Requires supabase_trust_storage_migration.sql.

BEGIN;

DROP FUNCTION IF EXISTS public.publish_country_score_release(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.publish_country_score_release(
    p_release_records JSONB,
    p_country_rows JSONB,
    p_minimum_confidence NUMERIC,
    p_minimum_coverage NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_record JSONB;
    v_release_id TEXT;
    v_release_hash TEXT;
    v_country TEXT;
    v_evidence_id UUID;
    v_observation_id UUID;
    v_candidate_id UUID;
    v_candidate_state TEXT;
    v_existing_hash TEXT;
    v_published_at TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    IF p_minimum_confidence NOT BETWEEN 0 AND 1
       OR p_minimum_coverage NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'Score confidence and coverage thresholds must be between zero and one.';
    END IF;

    IF jsonb_typeof(p_release_records) <> 'array'
       OR jsonb_typeof(p_country_rows) <> 'array'
       OR jsonb_array_length(p_release_records) <> 54
       OR jsonb_array_length(p_country_rows) <> 54 THEN
        RAISE EXCEPTION 'A score release must contain exactly 54 trusted and legacy rows.';
    END IF;

    v_release_id := p_release_records -> 0 ->> 'releaseId';
    v_release_hash := p_release_records -> 0 ->> 'releaseHash';
    IF coalesce(v_release_id, '') = ''
       OR coalesce(v_release_hash, '') !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'A score release requires a release ID and SHA-256 hash.';
    END IF;

    IF (
        SELECT count(DISTINCT upper(item ->> 'country'))
        FROM jsonb_array_elements(p_release_records) item
        WHERE item ->> 'dataset' = 'country-score'
          AND item ->> 'releaseId' = v_release_id
          AND item ->> 'releaseHash' = v_release_hash
          AND (item ->> 'contentHash') ~ '^[0-9a-f]{64}$'
          AND (item ->> 'axisScore')::numeric BETWEEN 0 AND 100
          AND (item ->> 'classificationDisposition') <> 'quarantine'
          AND (item ->> 'classificationDisposition') = 'clean'
          AND (item #>> '{confidence,overall}')::numeric >= p_minimum_confidence
          AND (item ->> 'coverage')::numeric >= p_minimum_coverage
          AND upper(item ->> 'country') ~ '^[A-Z]{3}$'
    ) <> 54 THEN
        RAISE EXCEPTION 'Trusted score records are incomplete or inconsistent.';
    END IF;

    IF (
        SELECT count(DISTINCT upper(item ->> 'id'))
        FROM jsonb_array_elements(p_country_rows) item
        WHERE upper(item ->> 'id') ~ '^[A-Z]{3}$'
          AND (item ->> 'axisScore')::numeric BETWEEN 0 AND 100
    ) <> 54 THEN
        RAISE EXCEPTION 'Legacy country rows are incomplete or inconsistent.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_release_id, 0));

    INSERT INTO public.countries (
        id,
        name,
        "axisScore",
        trend,
        "resourceWealth",
        population,
        gdp,
        "topExport",
        "fdiClimate",
        "strategicFocus",
        updated_at
    )
    SELECT
        upper(item ->> 'id'),
        item ->> 'name',
        (item ->> 'axisScore')::integer,
        item ->> 'trend',
        (item ->> 'resourceWealth')::integer,
        (item ->> 'population')::bigint,
        (item ->> 'gdp')::integer,
        item ->> 'topExport',
        item ->> 'fdiClimate',
        item ->> 'strategicFocus',
        (item ->> 'updated_at')::timestamptz
    FROM jsonb_array_elements(p_country_rows) item
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        "axisScore" = EXCLUDED."axisScore",
        trend = EXCLUDED.trend,
        "resourceWealth" = EXCLUDED."resourceWealth",
        population = EXCLUDED.population,
        gdp = EXCLUDED.gdp,
        "topExport" = EXCLUDED."topExport",
        "fdiClimate" = EXCLUDED."fdiClimate",
        "strategicFocus" = EXCLUDED."strategicFocus",
        updated_at = EXCLUDED.updated_at;

    FOR v_record IN SELECT value FROM jsonb_array_elements(p_release_records)
    LOOP
        v_country := upper(v_record ->> 'country');
        v_observation_id := NULL;
        v_evidence_id := NULL;
        v_candidate_id := NULL;
        v_candidate_state := NULL;

        SELECT observation.id, observation.evidence_id,
               observation.payload ->> 'releaseHash'
        INTO v_observation_id, v_evidence_id, v_existing_hash
        FROM public.intelligence_raw_observations observation
        WHERE observation.source_record_id = v_release_id || ':' || v_country
        ORDER BY observation.created_at DESC
        LIMIT 1;

        IF v_observation_id IS NOT NULL AND v_existing_hash <> v_release_hash THEN
            RAISE EXCEPTION 'Release ID % was already used with different content.', v_release_id;
        END IF;

        IF v_observation_id IS NULL THEN
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
                v_record ->> 'sourceUrl',
                v_record ->> 'canonicalUrl',
                v_record ->> 'source',
                'multilateral',
                (v_record ->> 'sourcePublishedAt')::timestamptz,
                (v_record ->> 'retrievedAt')::timestamptz,
                'application/json',
                v_record ->> 'contentHash',
                v_record,
                jsonb_build_object(
                    'publisher', 'update-countries/v1',
                    'release_id', v_release_id,
                    'release_hash', v_release_hash
                )
            )
            RETURNING id INTO v_evidence_id;

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
                v_release_id || ':' || v_country,
                v_country,
                (v_record ->> 'sourcePublishedAt')::timestamptz,
                v_record,
                'deterministic-score-release',
                v_record ->> 'methodologyVersion',
                v_record ->> 'contentHash'
            )
            RETURNING id INTO v_observation_id;
        END IF;

        SELECT candidate.id, candidate.validation_state
        INTO v_candidate_id, v_candidate_state
        FROM public.intelligence_candidates candidate
        WHERE candidate.raw_observation_id = v_observation_id
        ORDER BY candidate.created_at DESC
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
                'score_input',
                v_country,
                v_record,
                greatest(
                    0,
                    least(1, coalesce((v_record #>> '{confidence,overall}')::numeric, 0))
                ),
                'accepted',
                '[]'::jsonb,
                'update-countries/v1',
                v_published_at
            )
            RETURNING id INTO v_candidate_id;
        ELSIF v_candidate_state <> 'accepted' THEN
            RAISE EXCEPTION
                'Existing score candidate % is %, refusing to mark it accepted.',
                v_candidate_id,
                v_candidate_state;
        END IF;

        INSERT INTO public.intelligence_evidence_publications (
            evidence_id,
            publication_state,
            published_at,
            reviewed_by,
            reviewed_at
        )
        VALUES (
            v_evidence_id,
            'published',
            v_published_at,
            'update-countries/v1',
            v_published_at
        )
        ON CONFLICT (evidence_id) DO UPDATE SET
            publication_state = 'published',
            published_at = coalesce(
                intelligence_evidence_publications.published_at,
                EXCLUDED.published_at
            ),
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_at = EXCLUDED.reviewed_at;
    END LOOP;

    RETURN jsonb_build_object(
        'releaseId', v_release_id,
        'releaseHash', v_release_hash,
        'published', 54,
        'publishedAt', v_published_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_country_score_release(JSONB, JSONB, NUMERIC, NUMERIC)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_country_score_release(JSONB, JSONB, NUMERIC, NUMERIC)
TO service_role;

COMMIT;
