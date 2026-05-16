# Copilot instructions for AXIS AFRICA

## Build, lint, and verification commands

Run from repository root:

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
npm run lint
```

There is no standard `npm test` script in `package.json`. For focused checks, run individual script-level checks directly, for example:

```bash
npx tsx scripts/test-supabase.ts
```

For targeted data pipeline runs:

```bash
npx tsx scripts/update-kpis.ts
npx tsx scripts/update-countries.ts
npx tsx scripts/advanced-scrape.ts
```

## High-level architecture

- **App shape:** Next.js App Router project with a single dashboard shell in `src/app/page.tsx` composing:
  - left matrix (`AfcftaMatrix`)
  - center map engine (`AfricaMap`, loaded with `dynamic(..., { ssr: false })`)
  - right intelligence feed (`FrictionEngine`)
- **Primary data plane:** Supabase tables (`countries`, `intelligence_alerts`, `blog_posts`; plus optional `commodity_prices`).
- **Fallback data plane:** UI and API routes intentionally fall back to local/static datasets when live fetches fail:
  - `src/lib/mock-data.ts` (`ALL_SOVEREIGN_DATA`)
  - hardcoded `FALLBACK_*` arrays in API routes (`/api/intelligence`, `/api/blogs`, `/api/commodities`, `/api/briefing`).
- **Automation pipeline:** Daily refresh is driven by GitHub Actions (`.github/workflows/scrape.yml`) running TSX scripts (`scripts/update-kpis.ts`, `scripts/update-countries.ts`, `scripts/advanced-scrape.ts`, and metadata automation).
- **Server-side ingestion endpoint:** `src/app/api/cron/scrape/route.ts` performs scraping/classification/upserts to Supabase; designed for long-running execution (`maxDuration = 300`) and guarded by `CRON_SECRET` when set.
- **Client-state utilities:** watchlist and offline behavior are local-first (`localStorage` + IndexedDB helpers in `src/lib/use-watchlist.ts` and `src/lib/use-offline-cache.ts`), plus realtime/poll hybrid alerts in `src/lib/use-realtime-alerts.ts`.

## Key conventions in this codebase

- **ISO-3 code is the canonical identity everywhere.** Country identity is keyed by 3-letter ISO (`country` in UI objects, `id` in `countries` table, `isoCode` in alerts). Preserve this when adding routes, joins, or filters.
- **Merge live DB rows onto static country objects.** Common pattern:
  - find static record from `ALL_SOVEREIGN_DATA`
  - return `{ ...staticData, ...dbCountry, country: dbCountry.id }`
  This preserves rich static fields while allowing DB freshness.
- **Prefer degraded-success behavior over empty UI.** Existing routes/components usually return usable fallback payloads instead of hard failure. Follow that pattern for user-facing endpoints.
- **`@/*` import alias is standard.** Use `@/` imports rooted at `src` (configured in `tsconfig.json`) rather than deep relative paths.
- **Client/server separation matters.** Interactive/chart/map components are client components (`"use client"`), while route handlers own scraping, synthesis, and privileged Supabase/service-key work.
- **Cross-component watchlist updates use a custom browser event.** `use-watchlist` dispatches `watchlistUpdated`; listeners (e.g., in `friction-engine.tsx`) depend on this signal.
- **Country lists are duplicated intentionally across modules.** Several files keep explicit nation arrays or ISO sets for UX, scraping validation, and matching. When adding/removing mappings, update all relevant lists (map labels, search command, scripts, and validators) to avoid drift.
