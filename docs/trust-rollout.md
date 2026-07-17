# Trust rollout operations

The trust rollout is non-destructive and defaults to dry-run. Reports and
shadow state are written below `quality-reports/`, which is gitignored.

## Read-only readiness preflight

Before migration or promotion work, inspect the currently configured Supabase
project without changing it:

```powershell
npx tsx scripts/trust-readiness.ts
```

The command emits redacted JSON to stdout and returns a nonzero exit code when
readiness is blocked. It reports only whether each supported environment
variable is present (plus the variable name selected for each role), never its
value. The report includes:

- trust table, `trusted_published_records` view, and required RPC visibility in
  the role-filtered PostgREST OpenAPI document;
- separate anon and service-role read accessibility;
- legacy and trusted counts by rollout dataset, trusted freshness, count-based
  coverage, and quarantine reason counts; and
- explicit `missing_config`, `migration`, `permission`, `connectivity`,
  `empty_data`, and `stale_data` states.

The diagnostic sends only `GET` and `HEAD` requests using PostgREST `select`
and exact-count queries. It never requests an `/rpc/` path and rejects
`--apply`, write/mutation/RPC options, non-read-only modes, and methods other
than GET or HEAD. RPCs are discovered from OpenAPI only. The output uses
`mode: "read-only-readiness"` and shadow-compatible `byDataset` names such as
`currentCount`, `trustedCount`, `freshCount`, `coverageRate`, and
`freshnessRate`. It does not authorize promotion.

Run the credential-free mocked checks (no production connection) with:

```powershell
npx tsx scripts/test-trust-readiness.ts
```

1. Deploy `supabase_trust_storage_migration.sql` through the normal reviewed
   migration process. The tool never deploys schema.
2. Inventory and plan with read credentials:

   ```powershell
   npm run trust:rollout
   ```

   Without credentials this safely uses deterministic fixtures. Use
   `npm run trust:rollout:fixtures` explicitly in CI. The report classifies
   clean, defensibly backfillable, and quarantine records. A source publication
   time must come from an explicit `sourcePublishedAt`, `source_published_at`,
   `publishedAt`, or `published_at` value. Database `created_at`, `updated_at`,
   and retrieval timestamps are never publication evidence. `retrievedAt` or
   `retrieved_at` is preserved separately and is also required. Legacy rows are
   retained.
3. After reviewing the report, apply idempotently with service credentials:

   ```powershell
   npm run trust:rollout -- --apply --confirm=APPLY_TRUST_ROLLOUT
   ```

   `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or
   `NEXT_PUBLIC_SUPABASE_URL`) are mandatory. Apply fails closed when the trust
   migration is absent. It does not delete or rewrite legacy tables.
4. Run shadow comparisons on the desired schedule:

   ```powershell
   npm run trust:shadow -- --required-runs=3 --min-coverage=0.9 --min-freshness=0.9 --max-rejection=0.1
   npm run trust:promotion-check
   ```

   Promotion remains blocked until every required dataset (`intelligence`,
   `blog`, `country-score`, and `commodity`) independently has current,
   comparable, trusted, matched, and fresh identities and passes its coverage,
   freshness, and rejection thresholds for the configured number of
   consecutive runs. Freshness counts distinct fresh trusted identities that
   also match the current inventory; duplicate historical rows never increase
   it. Country scores require the exact 54 ISO-3 identities and commodities
   require the exact five configured IDs. Aggregate metrics are informational and
   cannot compensate for a failing dataset. `trust:promotion-check` accepts only
   a report whose mode is exactly `live-shadow` and whose `generatedAt` is
   current (24 hours by default). Use `--max-report-age-hours` only to set a
   stricter reviewed promotion window; missing, stale, or future timestamps
   fail closed.

   Scheduled commodity ingestion also loads the newest published trusted price
   for each of those five IDs before anomaly evaluation. An available view with
   no rows may proceed for one explicitly labeled bootstrap run; its successful
   publications supply subsequent history. Query, permission, malformed, or
   partial-history results fail the commodity lane rather than bypassing the
   previous-price check.
5. Validate fixture behavior without touching production state:

   ```powershell
   npm run trust:rollout:fixtures
   npm run trust:shadow:fixtures
   npm run test:trust-promotion
   npm run trust:promotion-check -- --report=quality-reports/fixtures/trust-shadow-report.json
   ```

   The rollout fixture approves explicitly sourced records and quarantines a
   record that has only database/retrieval times. Fixture shadow report and
   state files are restricted to `quality-reports/fixtures/`. A fixture can
   satisfy fixture thresholds, but `promotionEligible` always remains `false`;
   the final command is expected to fail because fixtures can never authorize
   production promotion.
6. Set `TRUSTED_PUBLICATIONS_ENABLED=true` only after promotion approval and
   redeploy. APIs then prefer `trusted_published_records`; missing or incomplete
   trusted data automatically falls back to outputs labeled `legacy/*`.
   Rollback is setting the flag to `false` (or removing it); no legacy data is
   removed.
