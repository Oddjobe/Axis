-- Migration: commodity_prices legacy source table
-- Additive and idempotent. This is the legacy source relation that the trust
-- rollout reads for the "commodity" dataset (src/lib/intelligence/trust-rollout.ts
-- TABLES.commodity) and that the public commodities API overlays
-- (src/app/api/commodities/route.ts). It is a peer of the existing legacy tables
-- (countries, intelligence_alerts, blog_posts): anon-readable, service-role-writable.
-- No trusted publication behavior depends on this table; trusted commodities flow
-- through the trust storage tables and the trusted_published_records view.

BEGIN;

CREATE TABLE IF NOT EXISTS public.commodity_prices (
    -- Stable commodity identifier, lowercased (e.g. 'lithium','cobalt','copper',
    -- 'gold','bauxite'). The rollout keys records by id; the API lowercases it and
    -- matches against its COMMODITY_IDS allowlist.
    id TEXT PRIMARY KEY,
    name TEXT,
    price NUMERIC,
    trend NUMERIC,
    unit TEXT,
    currency TEXT,
    category TEXT,
    color TEXT,
    frequency TEXT,
    -- Original publisher and canonical source URL. The rollout requires an explicit
    -- publisher plus a canonical URL to promote a legacy record; retrieval-time is
    -- kept distinct from source publication-time.
    source TEXT,
    source_url TEXT,
    canonical_url TEXT,
    source_published_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    retrieved_at TIMESTAMPTZ,
    -- Optional captured provenance payload (excerpt, market label, fx evidence, etc.).
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT commodity_prices_price_non_negative CHECK (price IS NULL OR price >= 0)
);

-- Ordering column used by the API (order by updated_at desc).
CREATE INDEX IF NOT EXISTS commodity_prices_updated_at_idx
    ON public.commodity_prices (updated_at DESC);

-- UTC updated_at convention, matching the repository's other mutable tables.
CREATE OR REPLACE FUNCTION public.commodity_prices_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commodity_prices_set_updated_at ON public.commodity_prices;
CREATE TRIGGER commodity_prices_set_updated_at
BEFORE UPDATE ON public.commodity_prices
FOR EACH ROW EXECUTE FUNCTION public.commodity_prices_set_updated_at();

-- RLS: service role is the only writer; anon/authenticated get SELECT, matching the
-- READINESS_RELATIONS anonReadable:true contract for legacy source tables.
ALTER TABLE public.commodity_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commodity_prices_service_role_all ON public.commodity_prices;
CREATE POLICY commodity_prices_service_role_all
ON public.commodity_prices
FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS commodity_prices_public_read ON public.commodity_prices;
CREATE POLICY commodity_prices_public_read
ON public.commodity_prices
FOR SELECT TO anon, authenticated
USING (true);

REVOKE ALL ON TABLE public.commodity_prices FROM PUBLIC;
GRANT ALL ON TABLE public.commodity_prices TO service_role;
GRANT SELECT ON TABLE public.commodity_prices TO anon, authenticated;

COMMIT;
