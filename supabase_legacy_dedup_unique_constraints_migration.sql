-- Legacy dedup unique constraints
--
-- The persist_publication_batch_atomic RPC (supabase_ingestion_atomic_migration.sql)
-- deduplicates legacy inserts with:
--   INSERT INTO public.intelligence_alerts (...) ON CONFLICT (title) DO NOTHING
--   INSERT INTO public.blog_posts (...)        ON CONFLICT (url)   DO NOTHING
--
-- Neither ON CONFLICT target had a matching unique constraint (only the PK on id),
-- so Postgres raised 42P10 ("no unique or exclusion constraint matching the ON
-- CONFLICT specification") at plan time and EVERY intelligence/blog persistence
-- transaction aborted. Fresh ingested alerts/blogs could never reach the legacy
-- tables the public APIs read.
--
-- This additive migration creates the two unique constraints the RPC was designed
-- to use. It is idempotent and safe to re-run.
--
-- NOTE: pre-existing duplicate titles/urls must be removed before the constraints
-- can be created (newest row per key retained). Production duplicates were cleaned
-- prior to applying this migration; the DELETEs below make the migration
-- self-contained for fresh environments.

BEGIN;

-- Remove pre-existing duplicate titles, keeping the newest row per title.
DELETE FROM public.intelligence_alerts a
USING (
    SELECT id,
           row_number() OVER (
               PARTITION BY title
               ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.intelligence_alerts
) d
WHERE a.id = d.id
  AND d.rn > 1;

-- Remove pre-existing duplicate urls, keeping the newest row per url.
DELETE FROM public.blog_posts a
USING (
    SELECT id,
           row_number() OVER (
               PARTITION BY url
               ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.blog_posts
    WHERE url IS NOT NULL
) d
WHERE a.id = d.id
  AND d.rn > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_alerts_title_key'
    ) THEN
        ALTER TABLE public.intelligence_alerts
            ADD CONSTRAINT intelligence_alerts_title_key UNIQUE (title);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_url_key'
    ) THEN
        ALTER TABLE public.blog_posts
            ADD CONSTRAINT blog_posts_url_key UNIQUE (url);
    END IF;
END $$;

COMMIT;
