-- Supabase Database Schema for Axis Africa

-- 1. Create the `countries` table to store static OSINT metrics
CREATE TABLE IF NOT EXISTS public.countries (
    id TEXT PRIMARY KEY, -- The 3-letter ISO code (e.g., "NGA")
    name TEXT NOT NULL,
    "axisScore" INTEGER NOT NULL,
    trend TEXT NOT NULL,
    "resourceWealth" INTEGER NOT NULL,
    population BIGINT NOT NULL,
    gdp INTEGER NOT NULL,
    "topExport" TEXT NOT NULL,
    "fdiClimate" TEXT NOT NULL,
    "strategicFocus" TEXT NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the `intelligence_alerts` table to store scraped Firecrawl articles
CREATE TABLE IF NOT EXISTS public.intelligence_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    category TEXT CHECK (category IN ('SOVEREIGNTY RISK', 'OUTSIDE INFLUENCE')) NOT NULL,
    "isoCode" TEXT REFERENCES public.countries(id) ON DELETE CASCADE,
    "timeAgo" TEXT NOT NULL,
    source TEXT NOT NULL,
    actor TEXT,  -- Primary foreign actor, e.g. 'China', 'IMF / World Bank', 'EU / CBAM', etc.
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Run this ALTER if upgrading an existing database:
-- ALTER TABLE public.intelligence_alerts ADD COLUMN IF NOT EXISTS actor TEXT;

-- 3. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_alerts ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Public Read Access (Frontend)
-- This allows anyone to READ the data, but only absolute admins (Service Role key) can INSERT/UPDATE.
CREATE POLICY "Allow public read access to countries" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Allow public read access to intelligence_alerts" ON public.intelligence_alerts FOR SELECT USING (true);
