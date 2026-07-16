-- Migration: production intelligence trust, provenance, scoring, and publication
-- Additive only. Existing dashboard and snapshot tables are intentionally unchanged.

BEGIN;

-- Source captures are immutable. Publication is kept separately so evidence can be
-- withdrawn without rewriting or deleting the captured source.
CREATE TABLE IF NOT EXISTS public.intelligence_source_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL,
    canonical_url TEXT,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (
        source_type IN ('official', 'multilateral', 'academic', 'news', 'commercial', 'ngo', 'social', 'other')
    ),
    source_published_at TIMESTAMPTZ,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    http_status SMALLINT CHECK (http_status BETWEEN 100 AND 599),
    media_type TEXT,
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    raw_text TEXT,
    raw_payload JSONB,
    response_headers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_headers) = 'object'),
    capture_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capture_metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT intelligence_source_evidence_content_present
        CHECK (raw_text IS NOT NULL OR raw_payload IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.intelligence_evidence_publications (
    evidence_id UUID PRIMARY KEY REFERENCES public.intelligence_source_evidence(id) ON DELETE RESTRICT,
    publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (
        publication_state IN ('draft', 'in_review', 'published', 'withdrawn', 'archived')
    ),
    published_at TIMESTAMPTZ,
    withdrawal_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT intelligence_evidence_publications_published_at_check
        CHECK (publication_state <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT intelligence_evidence_publications_withdrawal_check
        CHECK (publication_state <> 'withdrawn' OR withdrawal_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.intelligence_evidence_provenance (
    child_evidence_id UUID NOT NULL REFERENCES public.intelligence_source_evidence(id) ON DELETE RESTRICT,
    parent_evidence_id UUID NOT NULL REFERENCES public.intelligence_source_evidence(id) ON DELETE RESTRICT,
    relationship TEXT NOT NULL CHECK (
        relationship IN ('derived_from', 'quotes', 'mirrors', 'supersedes', 'translates', 'corroborates')
    ),
    transformation TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (child_evidence_id, parent_evidence_id, relationship),
    CONSTRAINT intelligence_evidence_provenance_no_self_reference
        CHECK (child_evidence_id <> parent_evidence_id)
);

CREATE TABLE IF NOT EXISTS public.intelligence_raw_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES public.intelligence_source_evidence(id) ON DELETE RESTRICT,
    ingestion_run_id UUID,
    source_record_id TEXT,
    country_code TEXT REFERENCES public.countries(id) ON DELETE RESTRICT,
    indicator_key TEXT,
    observed_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) IN ('object', 'array')),
    extraction_method TEXT NOT NULL,
    extractor_version TEXT,
    payload_sha256 TEXT CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT intelligence_raw_observations_country_code_check
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS public.intelligence_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_observation_id UUID NOT NULL REFERENCES public.intelligence_raw_observations(id) ON DELETE RESTRICT,
    candidate_type TEXT NOT NULL CHECK (
        candidate_type IN ('indicator', 'alert', 'country_fact', 'score_input', 'other')
    ),
    country_code TEXT REFERENCES public.countries(id) ON DELETE RESTRICT,
    indicator_key TEXT,
    normalized_value JSONB NOT NULL,
    confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    validation_state TEXT NOT NULL DEFAULT 'pending' CHECK (
        validation_state IN ('pending', 'validated', 'accepted', 'rejected', 'quarantined')
    ),
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
    validated_by TEXT,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT intelligence_candidates_country_code_check
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS public.intelligence_quarantine_reason_codes (
    code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    description TEXT NOT NULL,
    retryable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.intelligence_quarantine_reason_codes (code, description, retryable)
VALUES
    ('schema_invalid', 'Payload does not satisfy the expected schema.', false),
    ('missing_provenance', 'Required source evidence or provenance is missing.', true),
    ('country_unresolved', 'A canonical ISO-3 country could not be resolved.', true),
    ('indicator_unmapped', 'The observation could not be mapped to a methodology indicator.', true),
    ('duplicate_candidate', 'The candidate duplicates an existing observation or candidate.', false),
    ('confidence_below_threshold', 'Extraction confidence is below the acceptance threshold.', true),
    ('value_out_of_range', 'The value is outside the indicator bounds.', true),
    ('source_untrusted', 'The source does not currently meet trust requirements.', true),
    ('methodology_mismatch', 'The candidate is incompatible with the selected methodology version.', true),
    ('processing_error', 'A transient or unexpected processing error occurred.', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.intelligence_quarantine_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_observation_id UUID REFERENCES public.intelligence_raw_observations(id) ON DELETE RESTRICT,
    candidate_id UUID REFERENCES public.intelligence_candidates(id) ON DELETE RESTRICT,
    reason_code TEXT NOT NULL REFERENCES public.intelligence_quarantine_reason_codes(code) ON DELETE RESTRICT,
    reason_detail TEXT,
    review_state TEXT NOT NULL DEFAULT 'pending' CHECK (
        review_state IN ('pending', 'in_review', 'retry_scheduled', 'resolved', 'rejected')
    ),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    next_retry_at TIMESTAMPTZ,
    last_retry_at TIMESTAMPTZ,
    last_error JSONB,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT intelligence_quarantine_items_single_subject
        CHECK (num_nonnulls(raw_observation_id, candidate_id) = 1),
    CONSTRAINT intelligence_quarantine_items_retry_schedule_check
        CHECK (review_state <> 'retry_scheduled' OR next_retry_at IS NOT NULL),
    CONSTRAINT intelligence_quarantine_items_review_check
        CHECK (review_state NOT IN ('resolved', 'rejected') OR reviewed_at IS NOT NULL),
    CONSTRAINT intelligence_quarantine_items_retry_limit_check
        CHECK (retry_count <= max_retries)
);

CREATE TABLE IF NOT EXISTS public.score_methodology_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (
        publication_state IN ('draft', 'in_review', 'published', 'withdrawn', 'archived')
    ),
    effective_from DATE,
    effective_to DATE,
    methodology JSONB NOT NULL CHECK (jsonb_typeof(methodology) = 'object'),
    methodology_sha256 TEXT NOT NULL CHECK (methodology_sha256 ~ '^[0-9a-f]{64}$'),
    published_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT score_methodology_versions_dates_check
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
    CONSTRAINT score_methodology_versions_published_at_check
        CHECK (publication_state <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT score_methodology_versions_hash_key UNIQUE (methodology_sha256)
);

CREATE TABLE IF NOT EXISTS public.score_methodology_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    methodology_version_id UUID NOT NULL REFERENCES public.score_methodology_versions(id) ON DELETE RESTRICT,
    indicator_key TEXT NOT NULL CHECK (indicator_key ~ '^[a-z][a-z0-9_]*$'),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    unit TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better', 'neutral')),
    weight NUMERIC(9,8) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    minimum_value NUMERIC,
    maximum_value NUMERIC,
    normalization JSONB NOT NULL CHECK (jsonb_typeof(normalization) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT score_methodology_indicators_bounds_check
        CHECK (maximum_value IS NULL OR minimum_value IS NULL OR maximum_value > minimum_value),
    CONSTRAINT score_methodology_indicators_version_key
        UNIQUE (methodology_version_id, indicator_key),
    CONSTRAINT score_methodology_indicators_composite_key
        UNIQUE (id, methodology_version_id)
);

CREATE TABLE IF NOT EXISTS public.indicator_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    methodology_version_id UUID NOT NULL REFERENCES public.score_methodology_versions(id) ON DELETE RESTRICT,
    methodology_indicator_id UUID NOT NULL,
    country_code TEXT NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
    evidence_id UUID NOT NULL REFERENCES public.intelligence_source_evidence(id) ON DELETE RESTRICT,
    accepted_candidate_id UUID REFERENCES public.intelligence_candidates(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE,
    observed_value NUMERIC NOT NULL,
    normalized_value NUMERIC CHECK (normalized_value BETWEEN 0 AND 100),
    unit TEXT,
    confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(quality_flags) = 'array'),
    publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (
        publication_state IN ('draft', 'in_review', 'published', 'withdrawn', 'archived')
    ),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT indicator_observations_methodology_indicator_fk
        FOREIGN KEY (methodology_indicator_id, methodology_version_id)
        REFERENCES public.score_methodology_indicators(id, methodology_version_id) ON DELETE RESTRICT,
    CONSTRAINT indicator_observations_country_code_check
        CHECK (country_code ~ '^[A-Z]{3}$'),
    CONSTRAINT indicator_observations_period_check
        CHECK (period_end IS NULL OR period_end >= period_start),
    CONSTRAINT indicator_observations_published_at_check
        CHECK (publication_state <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT indicator_observations_natural_key
        UNIQUE (country_code, methodology_indicator_id, period_start, evidence_id),
    CONSTRAINT indicator_observations_composite_key
        UNIQUE (id, methodology_version_id, methodology_indicator_id)
);

CREATE TABLE IF NOT EXISTS public.country_score_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_code TEXT NOT NULL UNIQUE,
    methodology_version_id UUID NOT NULL REFERENCES public.score_methodology_versions(id) ON DELETE RESTRICT,
    as_of_date DATE NOT NULL,
    publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (
        publication_state IN ('draft', 'in_review', 'published', 'withdrawn', 'archived')
    ),
    published_at TIMESTAMPTZ,
    supersedes_release_id UUID REFERENCES public.country_score_releases(id) ON DELETE RESTRICT,
    release_notes TEXT,
    release_sha256 TEXT NOT NULL CHECK (release_sha256 ~ '^[0-9a-f]{64}$'),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT country_score_releases_no_self_supersession
        CHECK (supersedes_release_id IS NULL OR supersedes_release_id <> id),
    CONSTRAINT country_score_releases_published_at_check
        CHECK (publication_state <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT country_score_releases_hash_key UNIQUE (release_sha256),
    CONSTRAINT country_score_releases_composite_key UNIQUE (id, methodology_version_id)
);

CREATE TABLE IF NOT EXISTS public.country_score_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL,
    methodology_version_id UUID NOT NULL,
    country_code TEXT NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
    axis_score NUMERIC(6,3) NOT NULL CHECK (axis_score BETWEEN 0 AND 100),
    score_band TEXT,
    country_rank INTEGER CHECK (country_rank IS NULL OR country_rank > 0),
    component_scores JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(component_scores) = 'object'),
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT country_score_snapshots_release_fk
        FOREIGN KEY (release_id, methodology_version_id)
        REFERENCES public.country_score_releases(id, methodology_version_id) ON DELETE RESTRICT,
    CONSTRAINT country_score_snapshots_country_code_check
        CHECK (country_code ~ '^[A-Z]{3}$'),
    CONSTRAINT country_score_snapshots_release_country_key UNIQUE (release_id, country_code),
    CONSTRAINT country_score_snapshots_composite_key UNIQUE (id, methodology_version_id)
);

CREATE TABLE IF NOT EXISTS public.country_score_snapshot_indicators (
    snapshot_id UUID NOT NULL,
    methodology_version_id UUID NOT NULL,
    methodology_indicator_id UUID NOT NULL,
    indicator_observation_id UUID NOT NULL,
    raw_value NUMERIC NOT NULL,
    normalized_value NUMERIC NOT NULL CHECK (normalized_value BETWEEN 0 AND 100),
    weighted_contribution NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (snapshot_id, methodology_indicator_id),
    CONSTRAINT country_score_snapshot_indicators_snapshot_fk
        FOREIGN KEY (snapshot_id, methodology_version_id)
        REFERENCES public.country_score_snapshots(id, methodology_version_id) ON DELETE RESTRICT,
    CONSTRAINT country_score_snapshot_indicators_observation_fk
        FOREIGN KEY (indicator_observation_id, methodology_version_id, methodology_indicator_id)
        REFERENCES public.indicator_observations(id, methodology_version_id, methodology_indicator_id)
        ON DELETE RESTRICT
);

-- Mutable workflow records follow the repository's UTC updated_at convention.
CREATE OR REPLACE FUNCTION public.trust_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'intelligence_evidence_publications',
        'intelligence_candidates',
        'intelligence_quarantine_items',
        'score_methodology_versions',
        'score_methodology_indicators',
        'indicator_observations',
        'country_score_releases'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trust_set_updated_at ON public.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER trust_set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.trust_set_updated_at()',
            table_name
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trust_prevent_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION '% is immutable; create a new evidence/provenance record instead', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trust_source_evidence_immutable ON public.intelligence_source_evidence;
CREATE TRIGGER trust_source_evidence_immutable
BEFORE UPDATE OR DELETE ON public.intelligence_source_evidence
FOR EACH ROW EXECUTE FUNCTION public.trust_prevent_evidence_mutation();

DROP TRIGGER IF EXISTS trust_evidence_provenance_immutable ON public.intelligence_evidence_provenance;
CREATE TRIGGER trust_evidence_provenance_immutable
BEFORE UPDATE OR DELETE ON public.intelligence_evidence_provenance
FOR EACH ROW EXECUTE FUNCTION public.trust_prevent_evidence_mutation();

-- Lookup, workflow, publication, and time-series indexes.
CREATE INDEX IF NOT EXISTS idx_source_evidence_source_retrieved
    ON public.intelligence_source_evidence (source_name, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_evidence_content_hash
    ON public.intelligence_source_evidence (content_sha256);
CREATE INDEX IF NOT EXISTS idx_evidence_publications_state
    ON public.intelligence_evidence_publications (publication_state, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_parent
    ON public.intelligence_evidence_provenance (parent_evidence_id);
CREATE INDEX IF NOT EXISTS idx_raw_observations_country_observed
    ON public.intelligence_raw_observations (country_code, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_observations_evidence
    ON public.intelligence_raw_observations (evidence_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_observations_source_record
    ON public.intelligence_raw_observations (evidence_id, source_record_id)
    WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_validation_state
    ON public.intelligence_candidates (validation_state, created_at);
CREATE INDEX IF NOT EXISTS idx_candidates_observation
    ON public.intelligence_candidates (raw_observation_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_review_retry
    ON public.intelligence_quarantine_items (review_state, next_retry_at)
    WHERE review_state IN ('pending', 'in_review', 'retry_scheduled');
CREATE UNIQUE INDEX IF NOT EXISTS idx_quarantine_active_observation_reason
    ON public.intelligence_quarantine_items (raw_observation_id, reason_code)
    WHERE raw_observation_id IS NOT NULL
      AND review_state IN ('pending', 'in_review', 'retry_scheduled');
CREATE UNIQUE INDEX IF NOT EXISTS idx_quarantine_active_candidate_reason
    ON public.intelligence_quarantine_items (candidate_id, reason_code)
    WHERE candidate_id IS NOT NULL
      AND review_state IN ('pending', 'in_review', 'retry_scheduled');
CREATE INDEX IF NOT EXISTS idx_methodology_versions_publication
    ON public.score_methodology_versions (publication_state, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_observations_country_period
    ON public.indicator_observations (country_code, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_observations_publication
    ON public.indicator_observations (publication_state, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_observations_evidence
    ON public.indicator_observations (evidence_id);
CREATE INDEX IF NOT EXISTS idx_country_score_releases_publication
    ON public.country_score_releases (publication_state, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_country_score_snapshots_country
    ON public.country_score_snapshots (country_code, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_indicators_observation
    ON public.country_score_snapshot_indicators (indicator_observation_id);

-- RLS denies access by default. The service role is the only writer; anon and
-- authenticated clients receive SELECT only where the publication chain is public.
ALTER TABLE public.intelligence_source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_evidence_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_evidence_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_raw_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_quarantine_reason_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_quarantine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_methodology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_methodology_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicator_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_score_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_score_snapshot_indicators ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'intelligence_source_evidence',
        'intelligence_evidence_publications',
        'intelligence_evidence_provenance',
        'intelligence_raw_observations',
        'intelligence_candidates',
        'intelligence_quarantine_reason_codes',
        'intelligence_quarantine_items',
        'score_methodology_versions',
        'score_methodology_indicators',
        'indicator_observations',
        'country_score_releases',
        'country_score_snapshots',
        'country_score_snapshot_indicators'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS trust_service_role_all ON public.%I', table_name);
        EXECUTE format(
            'CREATE POLICY trust_service_role_all ON public.%I
             FOR ALL TO service_role USING (true) WITH CHECK (true)',
            table_name
        );
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS trust_public_published_evidence ON public.intelligence_source_evidence;
CREATE POLICY trust_public_published_evidence
ON public.intelligence_source_evidence
FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.intelligence_evidence_publications publication
        WHERE publication.evidence_id = intelligence_source_evidence.id
          AND publication.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_evidence_state ON public.intelligence_evidence_publications;
CREATE POLICY trust_public_published_evidence_state
ON public.intelligence_evidence_publications
FOR SELECT TO anon, authenticated
USING (publication_state = 'published');

DROP POLICY IF EXISTS trust_public_published_provenance ON public.intelligence_evidence_provenance;
CREATE POLICY trust_public_published_provenance
ON public.intelligence_evidence_provenance
FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.intelligence_evidence_publications child_publication
        WHERE child_publication.evidence_id = intelligence_evidence_provenance.child_evidence_id
          AND child_publication.publication_state = 'published'
    )
    AND EXISTS (
        SELECT 1
        FROM public.intelligence_evidence_publications parent_publication
        WHERE parent_publication.evidence_id = intelligence_evidence_provenance.parent_evidence_id
          AND parent_publication.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_methodologies ON public.score_methodology_versions;
CREATE POLICY trust_public_published_methodologies
ON public.score_methodology_versions
FOR SELECT TO anon, authenticated
USING (publication_state = 'published');

DROP POLICY IF EXISTS trust_public_published_methodology_indicators ON public.score_methodology_indicators;
CREATE POLICY trust_public_published_methodology_indicators
ON public.score_methodology_indicators
FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.score_methodology_versions methodology
        WHERE methodology.id = score_methodology_indicators.methodology_version_id
          AND methodology.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_indicator_observations ON public.indicator_observations;
CREATE POLICY trust_public_published_indicator_observations
ON public.indicator_observations
FOR SELECT TO anon, authenticated
USING (
    publication_state = 'published'
    AND EXISTS (
        SELECT 1
        FROM public.score_methodology_versions methodology
        WHERE methodology.id = indicator_observations.methodology_version_id
          AND methodology.publication_state = 'published'
    )
    AND EXISTS (
        SELECT 1
        FROM public.intelligence_evidence_publications evidence_publication
        WHERE evidence_publication.evidence_id = indicator_observations.evidence_id
          AND evidence_publication.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_score_releases ON public.country_score_releases;
CREATE POLICY trust_public_published_score_releases
ON public.country_score_releases
FOR SELECT TO anon, authenticated
USING (
    publication_state = 'published'
    AND EXISTS (
        SELECT 1
        FROM public.score_methodology_versions methodology
        WHERE methodology.id = country_score_releases.methodology_version_id
          AND methodology.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_score_snapshots ON public.country_score_snapshots;
CREATE POLICY trust_public_published_score_snapshots
ON public.country_score_snapshots
FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.country_score_releases release
        WHERE release.id = country_score_snapshots.release_id
          AND release.publication_state = 'published'
    )
);

DROP POLICY IF EXISTS trust_public_published_snapshot_indicators ON public.country_score_snapshot_indicators;
CREATE POLICY trust_public_published_snapshot_indicators
ON public.country_score_snapshot_indicators
FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.country_score_snapshots snapshot
        JOIN public.country_score_releases release ON release.id = snapshot.release_id
        WHERE snapshot.id = country_score_snapshot_indicators.snapshot_id
          AND release.publication_state = 'published'
    )
    AND EXISTS (
        SELECT 1
        FROM public.indicator_observations observation
        WHERE observation.id = country_score_snapshot_indicators.indicator_observation_id
          AND observation.publication_state = 'published'
    )
);

GRANT SELECT ON TABLE
    public.intelligence_source_evidence,
    public.intelligence_evidence_publications,
    public.intelligence_evidence_provenance,
    public.score_methodology_versions,
    public.score_methodology_indicators,
    public.indicator_observations,
    public.country_score_releases,
    public.country_score_snapshots,
    public.country_score_snapshot_indicators
TO anon, authenticated;

-- This narrow publication view is the feature-flagged API boundary. It exposes
-- accepted normalized records only after their immutable evidence is published;
-- raw observations, rejected candidates, and quarantine details remain private.
CREATE OR REPLACE VIEW public.trusted_published_records
WITH (security_barrier = true)
AS
SELECT
    candidate.normalized_value ->> 'dataset' AS dataset,
    observation.source_record_id,
    candidate.normalized_value AS record,
    candidate.confidence,
    evidence.canonical_url,
    evidence.source_published_at,
    evidence.retrieved_at,
    publication.published_at
FROM public.intelligence_candidates candidate
JOIN public.intelligence_raw_observations observation
  ON observation.id = candidate.raw_observation_id
JOIN public.intelligence_source_evidence evidence
  ON evidence.id = observation.evidence_id
JOIN public.intelligence_evidence_publications publication
  ON publication.evidence_id = evidence.id
WHERE candidate.validation_state = 'accepted'
  AND publication.publication_state = 'published'
  AND candidate.normalized_value ->> 'dataset'
      IN ('intelligence', 'blog', 'country-score', 'commodity');

REVOKE ALL ON TABLE public.trusted_published_records FROM PUBLIC;
GRANT SELECT ON TABLE public.trusted_published_records TO anon, authenticated, service_role;

COMMIT;
