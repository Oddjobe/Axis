import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeCompositeScores,
  getBundledBaselineObservations,
  INDICATOR_DEFINITIONS,
} from "../src/lib/intelligence/score-methodology";
import {
  fetchWorldBankIndicator,
  loadWorldBankObservations,
} from "../src/lib/intelligence/score-observations";
import {
  evaluateScoreReadiness,
  serializeScoreReadinessReport,
} from "../src/lib/intelligence/score-readiness";
import {
  buildLegacyCountryRows,
  publishCountryScoreRefresh,
  reportScoreOperationalFailure,
  ScoreRefreshOperationalError,
  withScoreOperationalFailure,
} from "./update-countries";

const retrievedAt = "2026-07-17T00:00:00.000Z";
const firstIndicator = INDICATOR_DEFINITIONS[0];
let requestSignalWasBounded = false;
const successFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
  requestSignalWasBounded = init?.signal instanceof AbortSignal;
  return new Response(JSON.stringify([
    { lastupdated: "2026-06-30" },
    [
      {
        countryiso3code: "NGA",
        indicator: { id: firstIndicator.id },
        date: "2024",
        value: 60,
      },
      {
        countryiso3code: "NGA",
        indicator: { id: firstIndicator.id },
        date: "2025",
        value: 70,
      },
    ],
  ]), { status: 200 });
}) as typeof fetch;

async function main(): Promise<void> {
const live = await fetchWorldBankIndicator(firstIndicator, {
  fetchImpl: successFetch,
  startYear: 2020,
  endYear: 2026,
  retrievedAt,
  timeoutMs: 100,
});
assert.equal(live.observations.length, 1);
assert.equal(live.observations[0].year, 2025, "newest observation must win");
assert.equal(live.observations[0].observedAt, "2025-12-31T00:00:00.000Z");
assert.equal(live.observations[0].sourcePublishedAt, "2026-06-30T00:00:00.000Z");
assert.equal(live.observations[0].retrievedAt, retrievedAt);
assert.notEqual(
  live.observations[0].observedAt,
  live.observations[0].retrievedAt,
  "retrieval time must never become observation/as-of time",
);
assert.ok(requestSignalWasBounded, "World Bank requests must carry an abort signal");

const failed = await loadWorldBankObservations({
  indicators: [firstIndicator],
  fetchImpl: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
  retrievedAt,
  timeoutMs: 100,
});
assert.equal(failed.diagnostics[0].status, "failed");
assert.match(failed.diagnostics[0].error ?? "", /HTTP 503/);
assert.ok(
  failed.observations.length > 0,
  "network failure must retain explicitly provenance-marked bundled observations",
);
assert.ok(
  failed.observations.every(
    (observation) => observation.provenanceKind === "world-bank-bundled",
  ),
);

const baselineObservations = getBundledBaselineObservations();
const baselineScores = computeCompositeScores(baselineObservations);
const imputed = baselineScores
  .flatMap((score) => score.indicators)
  .find((indicator) => indicator.imputed);
assert.ok(imputed, "fixture must include a transparent imputation");
assert.equal(imputed.provenance.kind, "world-bank-indicator-median");
assert.equal(
  imputed.provenance.imputation?.method,
  "world-bank-indicator-normalized-median",
);
assert.ok((imputed.provenance.imputation?.donorCount ?? 0) > 0);
assert.equal(imputed.provenance.observedAt, null);

const baselineReadiness = evaluateScoreReadiness(baselineScores, {
  generatedAt: retrievedAt,
  sourceDiagnostics: failed.diagnostics,
});
assert.equal(baselineReadiness.summary.promotable, false);
assert.ok(baselineReadiness.summary.blockedCountries > 0);
assert.ok(
  baselineReadiness.countries.some(
    (country) =>
      country.blockers.includes("stale_score")
      && country.staleObservationIds.length > 0,
  ),
  "stale observations must be machine-readable blockers/gaps",
);
assert.ok(
  baselineReadiness.countries.some((country) => country.indicatorGaps.length > 0),
);

const boundaryScores = baselineScores.map((score) => ({
  ...score,
  asOf: "2026-06-30T00:00:00.000Z",
  indicators: score.indicators.map((indicator) => ({
    ...indicator,
    imputed: false,
    year: 2026,
    provenance: {
      ...indicator.provenance,
      observedAt: "2026-06-30T00:00:00.000Z",
      sourcePublishedAt: "2026-07-01T00:00:00.000Z",
      kind: "world-bank-api" as const,
      imputation: null,
    },
  })),
  coverage: 1,
  confidence: {
    ...score.confidence,
    overall: 0.95,
    completeness: 1,
    recency: 1,
  },
}));
const boundaryReport = evaluateScoreReadiness(boundaryScores, {
  generatedAt: retrievedAt,
});
assert.equal(boundaryReport.summary.readyCountries, 54);
assert.equal(boundaryReport.summary.promotable, true);
assert.equal(boundaryReport.gates.minimumCoverage, 0.8);
assert.equal(boundaryReport.gates.minimumConfidence, 0.8);

const belowBoundaryReport = evaluateScoreReadiness(
  boundaryScores.map((score, index) =>
    index === 0
      ? {
          ...score,
          indicators: score.indicators.map((indicator, indicatorIndex) =>
            indicatorIndex < 2
              ? {
                  ...indicator,
                  provenance: {
                    ...indicator.provenance,
                    // Staleness is driven by the institutional release date,
                    // not the observation's data period, per the trust policy.
                    sourcePublishedAt: "2024-12-31T00:00:00.000Z",
                  },
                }
              : indicator
          ),
        }
      : score,
  ),
  { generatedAt: retrievedAt },
);
assert.equal(belowBoundaryReport.summary.readyCountries, 53);
assert.deepEqual(belowBoundaryReport.countries[0].blockers, [
  "coverage_below_threshold",
  "confidence_below_threshold",
]);

const dzaMixedScore = {
  ...boundaryScores[0],
  asOf: "2026-06-30T00:00:00.000Z",
  indicators: boundaryScores[0].indicators.map((indicator, index) => ({
    ...indicator,
    provenance: {
      ...indicator.provenance,
      // observedAt (public data period) stays current for every indicator;
      // freshness is decided by the institutional release date below.
      sourcePublishedAt:
        index === 0
          ? "2026-07-01T00:00:00.000Z"
          : "2024-12-31T00:00:00.000Z",
    },
  })),
};
const dzaMixedReadiness = evaluateScoreReadiness(
  [dzaMixedScore, ...boundaryScores.slice(1)],
  { generatedAt: retrievedAt },
);
const dzaReadiness = dzaMixedReadiness.countries[0];
assert.equal(dzaReadiness.country, "DZA");
assert.equal(dzaReadiness.reportedAsOf, "2026-06-30T00:00:00.000Z");
assert.equal(dzaReadiness.asOf, "2026-06-30T00:00:00.000Z");
assert.equal(dzaReadiness.staleObservationIds.length, 7);
assert.equal(dzaReadiness.coverage, 0.13);
assert.equal(dzaReadiness.confidence, 0.12);
assert.equal(dzaReadiness.ready, false);
assert.ok(dzaReadiness.blockers.includes("coverage_below_threshold"));
assert.ok(dzaReadiness.blockers.includes("confidence_below_threshold"));

// Guard the institutional-release freshness contract explicitly:
// a recent release with an OLD data period must stay FRESH (World Bank series
// legitimately lag), while an OLD release must be STALE even with a recent data
// period (an abandoned series cannot claim currency). The public as-of always
// reflects the true data period, never the release date.
const releaseFreshScore = {
  ...boundaryScores[0],
  indicators: boundaryScores[0].indicators.map((indicator) => ({
    ...indicator,
    provenance: {
      ...indicator.provenance,
      observedAt: "2021-12-31T00:00:00.000Z",
      sourcePublishedAt: "2026-07-13T00:00:00.000Z",
    },
  })),
};
const releaseFresh = evaluateScoreReadiness(
  [releaseFreshScore, ...boundaryScores.slice(1)],
  { generatedAt: retrievedAt },
).countries[0];
assert.equal(
  releaseFresh.coverage,
  1,
  "recent institutional release keeps indicators fresh despite an older data period",
);
assert.equal(releaseFresh.staleObservationIds.length, 0);
assert.equal(releaseFresh.ready, true);
assert.equal(
  releaseFresh.asOf,
  "2021-12-31T00:00:00.000Z",
  "public as-of reflects the true data period, not the release date",
);

const releaseStaleScore = {
  ...boundaryScores[0],
  indicators: boundaryScores[0].indicators.map((indicator) => ({
    ...indicator,
    provenance: {
      ...indicator.provenance,
      observedAt: "2026-06-30T00:00:00.000Z",
      sourcePublishedAt: "2023-01-01T00:00:00.000Z",
    },
  })),
};
const releaseStale = evaluateScoreReadiness(
  [releaseStaleScore, ...boundaryScores.slice(1)],
  { generatedAt: retrievedAt },
).countries[0];
assert.equal(
  releaseStale.coverage,
  0,
  "an abandoned series (old release) is rejected even with a recent data period",
);
assert.ok(releaseStale.blockers.includes("stale_score"));

let legacyWrites = 0;
let trustedPromotions = 0;
const retainingClient = {
  from: () => ({
    upsert: async () => {
      legacyWrites += 1;
      return { error: null };
    },
  }),
  rpc: async () => {
    trustedPromotions += 1;
    return { error: null };
  },
} as unknown as SupabaseClient;
const retained = await publishCountryScoreRefresh(
  retainingClient,
  buildLegacyCountryRows(baselineScores),
  baselineScores,
  baselineReadiness,
);
assert.equal(retained.legacy, "refreshed");
assert.equal(retained.trusted, "retained");
assert.equal(retained.releaseId, null);
assert.equal(legacyWrites, 1, "legacy refresh must proceed independently");
assert.equal(
  trustedPromotions,
  0,
  "a non-promotable candidate must never touch the trusted release",
);
assert.equal(retained.readiness.promotion.previousTrustedReleaseRetained, true);
assert.equal(retained.readiness.operation.status, "success");

const legacyFailureClient = {
  from: () => ({
    upsert: async () => ({ error: { message: "legacy unavailable" } }),
  }),
  rpc: async () => ({ error: null }),
} as unknown as SupabaseClient;
let legacyFailure: ScoreRefreshOperationalError | null = null;
try {
  await publishCountryScoreRefresh(
    legacyFailureClient,
    buildLegacyCountryRows(baselineScores),
    baselineScores,
    baselineReadiness,
  );
} catch (error) {
  if (error instanceof ScoreRefreshOperationalError) legacyFailure = error;
}
assert.equal(legacyFailure?.phase, "legacy_refresh");
assert.match(legacyFailure?.message ?? "", /legacy unavailable/);
const writtenLegacyFailure = {
  value: null as typeof baselineReadiness | null,
};
await assert.rejects(
  reportScoreOperationalFailure(
    baselineReadiness,
    "legacy_refresh",
    legacyFailure,
    async (report) => {
      writtenLegacyFailure.value = report;
    },
  ),
  (error: unknown) =>
    error instanceof ScoreRefreshOperationalError
    && error.phase === "legacy_refresh",
);
assert.equal(writtenLegacyFailure.value?.operation.status, "failed");
assert.equal(writtenLegacyFailure.value?.legacyRefresh.status, "failed");

const migrationFailureClient = {
  from: () => ({
    upsert: async () => ({ error: null }),
  }),
  rpc: async () => ({
    error: {
      code: "PGRST202",
      message: "publish_country_score_release is absent from schema cache",
    },
  }),
} as unknown as SupabaseClient;
let migrationFailure: ScoreRefreshOperationalError | null = null;
try {
  await publishCountryScoreRefresh(
    migrationFailureClient,
    buildLegacyCountryRows(boundaryScores),
    boundaryScores,
    boundaryReport,
  );
} catch (error) {
  if (error instanceof ScoreRefreshOperationalError) migrationFailure = error;
}
assert.equal(migrationFailure?.phase, "trusted_promotion");
assert.match(migrationFailure?.message ?? "", /migration is unavailable/);
const migrationFailureReport = withScoreOperationalFailure(
  boundaryReport,
  "trusted_promotion",
  migrationFailure,
);
assert.equal(migrationFailureReport.operation.status, "failed");
assert.equal(migrationFailureReport.legacyRefresh.status, "refreshed");
assert.equal(
  migrationFailureReport.promotion.previousTrustedReleaseRetained,
  true,
);
const writtenMigrationFailure = {
  value: null as typeof migrationFailureReport | null,
};
await assert.rejects(
  reportScoreOperationalFailure(
    boundaryReport,
    "trusted_promotion",
    migrationFailure,
    async (report) => {
      writtenMigrationFailure.value = report;
    },
  ),
  (error: unknown) =>
    error instanceof ScoreRefreshOperationalError
    && error.phase === "trusted_promotion",
);
assert.equal(writtenMigrationFailure.value?.operation.status, "failed");
assert.equal(writtenMigrationFailure.value?.legacyRefresh.status, "refreshed");

const trustedRpcFailureClient = {
  from: () => ({
    upsert: async () => ({ error: null }),
  }),
  rpc: async () => ({
    error: { code: "XX000", message: "trusted transaction failed" },
  }),
} as unknown as SupabaseClient;
let trustedRpcFailure: ScoreRefreshOperationalError | null = null;
try {
  await publishCountryScoreRefresh(
    trustedRpcFailureClient,
    buildLegacyCountryRows(boundaryScores),
    boundaryScores,
    boundaryReport,
  );
} catch (error) {
  if (error instanceof ScoreRefreshOperationalError) trustedRpcFailure = error;
}
assert.equal(trustedRpcFailure?.phase, "trusted_promotion");
assert.match(trustedRpcFailure?.message ?? "", /trusted transaction failed/);
const writtenTrustedRpcFailure = {
  value: null as typeof boundaryReport | null,
};
await assert.rejects(
  reportScoreOperationalFailure(
    boundaryReport,
    "trusted_promotion",
    trustedRpcFailure,
    async (report) => {
      writtenTrustedRpcFailure.value = report;
    },
  ),
  /trusted transaction failed/,
);
assert.equal(writtenTrustedRpcFailure.value?.operation.status, "failed");
assert.equal(
  writtenTrustedRpcFailure.value?.promotion.previousTrustedReleaseRetained,
  true,
);

const configurationFailureReport = withScoreOperationalFailure(
  baselineReadiness,
  "configuration",
  new Error("missing score persistence configuration"),
);
assert.equal(configurationFailureReport.operation.status, "failed");
assert.equal(configurationFailureReport.operation.phase, "configuration");
assert.equal(configurationFailureReport.legacyRefresh.status, "not_attempted");
const writtenConfigurationFailure = {
  value: null as typeof configurationFailureReport | null,
};
await assert.rejects(
  reportScoreOperationalFailure(
    baselineReadiness,
    "configuration",
    new Error("missing score persistence configuration"),
    async (report) => {
      writtenConfigurationFailure.value = report;
    },
  ),
  (error: unknown) =>
    error instanceof ScoreRefreshOperationalError
    && error.phase === "configuration",
);
assert.equal(writtenConfigurationFailure.value?.operation.status, "failed");
assert.equal(
  writtenConfigurationFailure.value?.legacyRefresh.status,
  "not_attempted",
);

const machineReport = JSON.parse(
  serializeScoreReadinessReport(retained.readiness),
) as typeof retained.readiness;
assert.equal(machineReport.schemaVersion, "axis-score-readiness/v1");
assert.equal(machineReport.summary.promotable, false);
assert.equal(machineReport.sources[0].status, "failed");
assert.ok(machineReport.countries.every((country) => Array.isArray(country.indicatorGaps)));

console.log(
  `Score readiness fixtures passed: fresh boundary 54/54; mixed DZA blocked; bundled evidence ${baselineReadiness.summary.readyCountries}/54 ready; expected retention and operational failures distinguished.`,
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
