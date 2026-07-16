# Copilot instructions for AXIS AFRICA

## Build, lint, and checks

Run from the repository root:

```bash
npm ci
npm install --legacy-peer-deps
npm run dev
npm run build
npm run lint
npm run start
```

`package-lock.json` is committed and the automation workflow uses `npm ci`. Use
`npm install --legacy-peer-deps` when local peer-dependency resolution requires it.

For a targeted lint or type check:

```bash
npm run lint -- src/app/page.tsx
npx tsc --noEmit
```

There is no dedicated unit-test runner in `package.json`. The closest targeted
integration smoke check is:

```bash
npx tsx scripts/test-supabase.ts
```

It requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local`.

Other one-off data refresh scripts:

```bash
npx tsx scripts/update-kpis.ts
npx tsx scripts/update-countries.ts
npx tsx scripts/update-mega-projects.ts
```

## High-level architecture

- **Next.js App Router dashboard:** `src/app/page.tsx` is the main shell. It composes the heat map, Friction Engine feed, AfCFTA matrix, search, tickers, and the analytics/modals that open from the dashboard.
- **Secondary app routes:** `src/app/methodology/page.tsx` explains the AXIS score, while `src/app/docs/page.tsx` documents the public endpoints. `robots.ts`, `sitemap.ts`, and `layout.tsx` handle SEO and metadata.
- **Live plus fallback data flow:** `src/lib/mock-data.ts` is the canonical static country baseline. The dashboard overlays rows from the Supabase `countries` table, caches the merged result in IndexedDB, and falls back from live to cached to static data. API routes likewise return usable fallback payloads when upstream services are unavailable.
- **Two ingestion entry points:** `.github/workflows/scrape.yml` is the scheduled production pipeline. It runs `automate-daily-metadata.ts`, `update-kpis.ts`, `update-countries.ts`, and `advanced-scrape.ts`, then commits generated metadata to `main`. `src/app/api/cron/scrape/route.ts` is a separate long-running HTTP ingestion endpoint using RSS/Jina, Foundry/OpenAI, Firecrawl, and service-role Supabase writes.
- **Generated and persisted data:** generated dashboard metadata lives in `src/lib/kpi-data.json` and `src/lib/dynamic-narratives.json`; Supabase stores country rows, intelligence alerts, blog posts, commodity prices, and snapshots. Schema and migrations are split between `supabase/schema.sql` and the root migration files.
- **Client-side persistence and realtime:** watchlist state is stored in `localStorage`, offline cache helpers are used for cached country data, and `useRealtimeAlerts` combines Supabase realtime with polling based on tab visibility.

## Key conventions

- **ISO-3 is the canonical country identifier.** Keep 3-letter country codes consistent across UI objects, Supabase rows, alerts, and route payloads.
- **Merge live data onto static records.** When live rows arrive from Supabase, preserve the static country metadata and overlay the fresh fields rather than rebuilding the object from scratch.
- **Prefer usable fallback responses.** User-facing routes should keep working with degraded data instead of failing hard when upstream data sources are missing.
- **Use `@/` imports from `src`.** The repository is configured for the `@/*` alias in `tsconfig.json`; avoid deep relative imports for shared code.
- **Keep client/server boundaries clear.** Charts, maps, and browser-state hooks stay in client components; scraping, service-role Supabase access, and AI calls stay in route handlers or server-only scripts.
- **Keep privileged Supabase access server-only.** Browser code uses the anon client from `src/lib/supabase.ts`; scripts and ingestion routes use `SUPABASE_SERVICE_ROLE_KEY`. Missing public configuration intentionally creates a placeholder client so static fallbacks can still render.
- **Preserve lazy-loaded visualization boundaries.** The map and heavyweight analytics modals are dynamically imported from the dashboard; `AfricaMap` explicitly disables SSR because it depends on browser rendering.
- **Watchlist updates are event-driven.** `use-watchlist` persists to `axisWatchlist` and dispatches `watchlistUpdated`; components that depend on watchlist changes listen for that event.
- **Version offline data shape changes.** When changing cached country-data structures, bump `CURRENT_CACHE_VERSION` in `src/lib/use-offline-cache.ts` so stale IndexedDB records are ignored.
- **Keep automation surfaces synchronized.** Changes to generated JSON shapes or ingestion fields may require coordinated updates to the generating script, consuming component/API route, Supabase schema or migration, and `.github/workflows/scrape.yml`.
- **Country lists are intentionally duplicated.** Several modules carry their own ISO sets or nation arrays for validation and UX. When country coverage changes, update all affected lists together.
