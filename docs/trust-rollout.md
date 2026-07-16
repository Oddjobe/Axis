# Trust rollout operations

The trust rollout is non-destructive and defaults to dry-run. Reports and
shadow state are written below `quality-reports/`, which is gitignored.

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
   `blog`, `country-score`, and `commodity`) independently has nonzero current,
   comparable, trusted, matched, and fresh rows and passes its coverage,
   freshness, and rejection thresholds for the configured number of
   consecutive runs. Aggregate metrics are informational and cannot compensate
   for a failing dataset. `trust:promotion-check` accepts only a report whose
   mode is exactly `live-shadow`.
5. Validate fixture behavior without touching production state:

   ```powershell
   npm run trust:rollout:fixtures
   npm run trust:shadow:fixtures
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
