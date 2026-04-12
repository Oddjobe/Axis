-- Migration: Historical sovereignty score snapshots
-- Run this in Supabase SQL Editor to enable weekly score tracking

-- Table to store weekly sovereignty score snapshots
CREATE TABLE IF NOT EXISTS public.sovereignty_snapshots (
    id BIGSERIAL PRIMARY KEY,
    country_code TEXT NOT NULL,
    axis_score INTEGER NOT NULL,
    resource_wealth INTEGER NOT NULL,
    infrastructure_control INTEGER NOT NULL,
    policy_independence INTEGER NOT NULL,
    currency_stability INTEGER NOT NULL,
    status TEXT,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (country_code, snapshot_date)
);

-- Index for fast per-country time-series queries
CREATE INDEX IF NOT EXISTS idx_snapshots_country_date
ON public.sovereignty_snapshots (country_code, snapshot_date DESC);

-- Enable RLS
ALTER TABLE public.sovereignty_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access"
ON public.sovereignty_snapshots
FOR SELECT
USING (true);

-- To automate weekly snapshots, create a Supabase Edge Function or
-- a GitHub Actions cron job that calls your /api/public/scores endpoint
-- and inserts the data into this table.
--
-- Example cron approach (GitHub Actions - runs every Sunday at midnight):
--
-- name: Weekly Sovereignty Snapshot
-- on:
--   schedule:
--     - cron: '0 0 * * 0'
-- jobs:
--   snapshot:
--     runs-on: ubuntu-latest
--     steps:
--       - run: |
--           curl -s https://axis-mocha.vercel.app/api/public/scores | \
--           jq -r '.countries[] | "\(.country)\t\(.axisScore)\t\(.resourceWealth)\t\(.infrastructureControl)\t\(.policyIndependence)\t\(.currencyStability)\t\(.status)"' | \
--           while IFS=$'\t' read code score rw ic pi cs status; do
--             curl -X POST "$SUPABASE_URL/rest/v1/sovereignty_snapshots" \
--               -H "apikey: $SUPABASE_ANON_KEY" \
--               -H "Content-Type: application/json" \
--               -d "{\"country_code\":\"$code\",\"axis_score\":$score,\"resource_wealth\":$rw,\"infrastructure_control\":$ic,\"policy_independence\":$pi,\"currency_stability\":$cs,\"status\":\"$status\"}"
--           done
