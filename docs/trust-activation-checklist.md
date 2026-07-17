# Trust production activation checklist

Enabling trusted publication (`TRUSTED_PUBLICATIONS_ENABLED=true`) is a
deliberate, reversible operator action. This checklist gates that action. It is
the human-facing companion to the machine-readable activation report emitted by
`npm run trust:activation-report`, and it references the full operational runbook
in [`trust-rollout.md`](./trust-rollout.md).

No step here is performed automatically. Repository automation only ever runs in
shadow mode and never enables the flag (see the `Trust Shadow Evidence`
workflow, `.github/workflows/trust-shadow.yml`).

## Machine-readable verdict

`npm run trust:activation-report` reads a live-shadow report and produces
`quality-reports/trust-activation-report.json` with an overall
`status` of `eligible` or `blocked` plus a per-gate breakdown. It fails closed:
`eligible` is reported only when **every** gate passes. Attested gates are
supplied as explicit operator confirmations so the verdict records exactly what
was checked.

```
npm run trust:activation-report -- \
  --report=quality-reports/trust-shadow-report.json \
  --max-report-age-hours=24 \
  --config-verified \
  --migrations-verified \
  --snapshots-verified \
  --rollback-target=<pre-activation-commit-or-deployment>
```

The command exits non-zero and writes `status: "blocked"` when any gate fails.

## Gates

### 1. Shadow promotion (authoritative, evaluated from evidence)

- Provide the latest `live-shadow` report from three consecutive successful
  shadow runs (see `trust-rollout.md`, shadow section).
- The report must be `mode: live-shadow`, version 3, within
  `--max-report-age-hours`, with `promotionEligible: true` and
  `consecutiveSuccessfulRuns >= requiredRuns`.
- Every required dataset must pass independently: intelligence, blogs,
  exactly 54/54 country-score ISO-3 identities, and exactly 5/5 commodity
  identities, each meeting coverage, freshness, and rejection thresholds.
- This gate is derived from the report itself, not attested. A fixtures-mode,
  stale, or incomplete report fails closed.

### 2. Configuration presence (operator-attested)

- Confirm the redacted workflow preflight (`npm run workflow:preflight`) reports
  all **required** configuration present: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `FIRECRAWL_API_KEY`.
- Optional Foundry enrichment may be reported as degraded/skipped without
  blocking activation.
- Pass `--config-verified` only after reviewing that preflight output. Secret
  values are never printed.

### 3. Migration proof (operator-attested)

- Confirm the three additive migrations are applied in production, in order:
  `supabase_trust_storage_migration.sql`,
  `supabase_score_continuity_migration.sql`,
  `supabase_ingestion_atomic_migration.sql`.
- Verify tables, the `trusted_published_records` view, indexes, RLS, grants, and
  functions with the read-only readiness probe (`npm run trust:readiness`).
- Pass `--migrations-verified` only after the readiness probe confirms schema
  presence.

### 4. Current trusted snapshots (operator-attested)

- Confirm every required identity has a current trusted snapshot: 54/54 country
  scores at the unchanged 0.80 coverage and 0.80 confidence thresholds, five
  commodities, and governed intelligence/blog records with explicit source
  publication times, excerpts, canonical URLs, provenance, and confidence.
- Pass `--snapshots-verified` only after reviewing the trusted inventory.

### 5. Recorded rollback target (operator-attested)

- Record the pre-activation deployment or commit that activation will roll back
  to. Immediate rollback is flag-off plus redeploy; application rollback is the
  recorded pre-activation Vercel deployment.
- Pass `--rollback-target=<value>` with a non-empty identifier. An empty or
  whitespace-only value fails closed.

## After an `eligible` verdict

Activation still requires the explicit operator steps in `trust-rollout.md`:

1. Set Vercel Production `TRUSTED_PUBLICATIONS_ENABLED=true`.
2. Redeploy the reviewed `main` commit.
3. Verify health `200` and complete trusted/current responses before accepting
   the UI source indicator.
4. Keep every legacy and trusted row intact; never delete rows during rollback.

Activation is reversible at any time by setting
`TRUSTED_PUBLICATIONS_ENABLED=false` and redeploying. No repository default,
workflow fallback, or deployment enables trusted publication on its own.
