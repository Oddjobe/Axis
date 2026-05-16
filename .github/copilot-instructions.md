# Copilot instructions for AXIS AFRICA

## Build, lint, and checks

Run from the repository root:

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
npm run lint
npm run start
```

There is no dedicated test runner in `package.json`. The main targeted check script is:

```bash
npx tsx scripts/test-supabase.ts
```

Other one-off data refresh scripts:

```bash
npx tsx scripts/update-kpis.ts
npx tsx scripts/update-mega-projects.ts
```

## High-level architecture

- **Next.js App Router dashboard:** `src/app/page.tsx` is the main shell. It composes the heat map, Friction Engine feed, AfCFTA matrix, search, tickers, and the analytics/modals that open from the dashboard.
- **Secondary app routes:** `src/app/methodology/page.tsx` explains the AXIS score, while `src/app/docs/page.tsx` documents the public endpoints. `robots.ts`, `sitemap.ts`, and `layout.tsx` handle SEO and metadata.
- **Live plus fallback data flow:** the dashboard starts from `src/lib/mock-data.ts` and merges live Supabase rows over the static country objects when possible. API routes also return fallback payloads when Supabase or other services are unavailable.
- **Server routes and ingestion:** public API routes live under `src/app/api/` for scores, commodities, briefing, intelligence, OG image generation, cron scraping, and the Telegram webhook. `src/app/api/cron/scrape/route.ts` is the long-running ingestion path and uses Firecrawl, RSS parsing, Foundry/OpenAI, and Supabase writes.
- **Client-side persistence and realtime:** watchlist state is stored in `localStorage`, offline cache helpers are used for cached country data, and `useRealtimeAlerts` combines Supabase realtime with polling based on tab visibility.

## Key conventions

- **ISO-3 is the canonical country identifier.** Keep 3-letter country codes consistent across UI objects, Supabase rows, alerts, and route payloads.
- **Merge live data onto static records.** When live rows arrive from Supabase, preserve the static country metadata and overlay the fresh fields rather than rebuilding the object from scratch.
- **Prefer usable fallback responses.** User-facing routes should keep working with degraded data instead of failing hard when upstream data sources are missing.
- **Use `@/` imports from `src`.** The repository is configured for the `@/*` alias in `tsconfig.json`; avoid deep relative imports for shared code.
- **Keep client/server boundaries clear.** Charts, maps, and browser-state hooks stay in client components; scraping, service-role Supabase access, and AI calls stay in route handlers or server-only scripts.
- **Watchlist updates are event-driven.** `use-watchlist` persists to `axisWatchlist` and dispatches `watchlistUpdated`; components that depend on watchlist changes listen for that event.
- **Country lists are intentionally duplicated.** Several modules carry their own ISO sets or nation arrays for validation and UX. When country coverage changes, update all affected lists together.
