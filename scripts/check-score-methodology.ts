import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GET } from "../src/app/api/public/scores/route";
import { ALL_SOVEREIGN_DATA } from "../src/lib/mock-data";
import {
  BASELINE_COUNTRY_SCORES,
  BASELINE_SCORE_BY_ISO,
  computeCompositeScores,
  getBundledBaselineObservations,
  INDICATOR_DEFINITIONS,
  SCORE_METHODOLOGY_VERSION,
} from "../src/lib/intelligence/score-methodology";
import {
  AFRICAN_ISO3_CODES,
  deriveSovereigntyStatus,
} from "../src/lib/intelligence/trust";
import {
  mergeAuthoritativeCountryScores,
  resolveAuthoritativeScore,
  selectLatestCompleteTrustedScoreRelease,
} from "../src/lib/intelligence/score-selection";
import {
  classifyLegacyRecord,
} from "../src/lib/intelligence/trust-rollout";
import {
  assertPublishableScoreClassification,
  buildTrustedScoreRelease,
  MIN_TRUSTED_SCORE_COVERAGE,
  persistScoreRelease,
} from "./update-countries";

const observations = getBundledBaselineObservations();
const recomputed = computeCompositeScores(observations);
const countryCodes = recomputed.map((score) => score.country);

assert.equal(recomputed.length, 54, "must score all 54 African countries");
assert.equal(new Set(countryCodes).size, 54, "ISO-3 country codes must be unique");
assert.deepEqual(countryCodes, [...AFRICAN_ISO3_CODES], "country coverage drifted");
assert.deepEqual(recomputed, BASELINE_COUNTRY_SCORES, "same inputs must be deterministic");
assert.equal(INDICATOR_DEFINITIONS.length, 8, "methodology must retain eight named inputs");

for (const score of recomputed) {
  assert.equal(score.status, deriveSovereigntyStatus(score.axisScore));
  assert.equal(score.methodologyVersion, SCORE_METHODOLOGY_VERSION);
  assert.ok(score.axisScore >= 0 && score.axisScore <= 100);
  assert.ok(score.coverage >= 0 && score.coverage <= 1);
  assert.equal(
    score.sources.length,
    score.indicators.filter((indicator) => !indicator.imputed).length,
  );
}

assert.equal(ALL_SOVEREIGN_DATA.length, 54, "fallback dashboard must retain 54 rows");
assert.equal(new Set(ALL_SOVEREIGN_DATA.map((country) => country.country)).size, 54);
for (const country of ALL_SOVEREIGN_DATA) {
  const score = BASELINE_SCORE_BY_ISO[country.country as keyof typeof BASELINE_SCORE_BY_ISO];
  assert.equal(country.axisScore, score.axisScore);
  assert.equal(country.status, deriveSovereigntyStatus(country.axisScore));
}

assert.equal(BASELINE_SCORE_BY_ISO.NGA.axisScore, 37);
assert.equal(BASELINE_SCORE_BY_ISO.ZAF.axisScore, 66);
assert.equal(BASELINE_SCORE_BY_ISO.ERI.axisScore, 41);

for (const [baseline, trusted, expected] of [
  [50, 51, "IMPROVING"],
  [59, 60, "STABLE"],
  [74, 75, "OPTIMAL"],
  [75, 50, "EXTRACTIVE"],
] as const) {
  const resolved = resolveAuthoritativeScore(baseline, { axisScore: trusted });
  assert.equal(resolved.axisScore, trusted);
  assert.equal(
    resolved.status,
    expected,
    `trusted score ${trusted} must cross the status threshold`,
  );
}

const completeOlderRelease = AFRICAN_ISO3_CODES.map((country) => ({
  country,
  axisScore: 60,
  releaseId: "country-score:older",
  trustedPublishedAt: "2026-07-15T00:00:00.000Z",
}));
const incompleteNewerRelease = AFRICAN_ISO3_CODES.slice(0, 53).map((country) => ({
  country,
  axisScore: 75,
  releaseId: "country-score:newer",
  trustedPublishedAt: "2026-07-16T00:00:00.000Z",
}));
const retained = selectLatestCompleteTrustedScoreRelease([
  ...incompleteNewerRelease,
  ...completeOlderRelease,
]);
assert.equal(
  retained?.releaseId,
  "country-score:older",
  "an incomplete release must not displace the last complete trusted release",
);
const promoted = selectLatestCompleteTrustedScoreRelease([
  ...AFRICAN_ISO3_CODES.map((country) => ({
    country,
    axisScore: 75,
    releaseId: "country-score:newer",
    trustedPublishedAt: "2026-07-16T00:00:00.000Z",
  })),
  ...completeOlderRelease,
]);
assert.equal(promoted?.releaseId, "country-score:newer");

const mergedFixture = mergeAuthoritativeCountryScores(
  [{ country: "NGA", name: "Nigeria", staticLabel: "preserved" }],
  [{ country: "NGA", axisScore: 51, status: "IMPROVING", publicationTier: "trusted" }],
);
assert.equal(mergedFixture[0].staticLabel, "preserved");
assert.equal(mergedFixture[0].axisScore, 51);
assert.equal(mergedFixture[0].status, "IMPROVING");
assert.equal(mergedFixture[0].publicationTier, "trusted");

const eligibleScores = recomputed.map((score) => ({
  ...score,
  asOf: "2026-07-15T00:00:00.000Z",
  coverage: 1,
  confidence: {
    ...score.confidence,
    overall: 0.9,
    completeness: 1,
    recency: 1,
  },
}));
const trustedRelease = buildTrustedScoreRelease(
  eligibleScores,
  "2026-07-16T00:00:00.000Z",
);
assert.equal(trustedRelease.records.length, 54);
assert.equal(
  new Set(trustedRelease.records.map((record) => record.releaseId)).size,
  1,
);
assert.match(trustedRelease.releaseHash, /^[0-9a-f]{64}$/);
for (const record of trustedRelease.records) {
  assert.equal(record.dataset, "country-score");
  assert.equal(record.releaseId, trustedRelease.releaseId);
  assert.equal(record.releaseHash, trustedRelease.releaseHash);
  assert.equal(record.classificationDisposition, "clean");
  assert.ok(Number(record.coverage) >= MIN_TRUSTED_SCORE_COVERAGE);
  assert.ok(
    Number((record.confidence as { overall: number }).overall) >= 0.8,
  );
  assert.match(String(record.contentHash), /^[0-9a-f]{64}$/);
}
assert.throws(
  () =>
    buildTrustedScoreRelease(
      eligibleScores.map((score, index) =>
        index === 0
          ? {
              ...score,
              confidence: { ...score.confidence, overall: 0.79 },
            }
          : score,
      ),
      "2026-07-16T00:00:00.000Z",
    ),
  /confidence 0.79 is below 0.8/,
);
assert.throws(
  () =>
    buildTrustedScoreRelease(
      eligibleScores.map((score, index) =>
        index === 0 ? { ...score, coverage: 0.79 } : score,
      ),
      "2026-07-16T00:00:00.000Z",
    ),
  /coverage 0.79 is below 0.8/,
);
assert.throws(
  () =>
    buildTrustedScoreRelease(
      eligibleScores.map((score) => ({
        ...score,
        asOf: "2024-12-31T00:00:00.000Z",
      })),
      "2026-07-16T00:00:00.000Z",
    ),
  /stale_source/,
);
const missingConfidence = classifyLegacyRecord(
  "country-score",
  { country: "NGA", axisScore: 60 },
  new Date("2026-07-16T00:00:00.000Z"),
);
assert.equal(missingConfidence.disposition, "quarantine");
assert.ok(
  missingConfidence.reasons.some(
    (reason) => reason.code === "missing_confidence",
  ),
);
assert.throws(
  () => assertPublishableScoreClassification("NGA", missingConfidence),
  /missing_confidence/,
);

console.log(
  `Score methodology smoke check passed: 54 countries, ${observations.length} published observations.`,
);
console.log("Score continuity checks passed: thresholds, complete-release retention, and authoritative merge.");
console.log(
  `Fixture scores — NGA ${BASELINE_SCORE_BY_ISO.NGA.axisScore}, ZAF ${BASELINE_SCORE_BY_ISO.ZAF.axisScore}, ERI ${BASELINE_SCORE_BY_ISO.ERI.axisScore}.`,
);

async function checkPublicApi() {
  const response = await GET();
  const payload = await response.json() as {
    count: number;
    countries: Array<{
      country: string;
      coverage: number;
      confidence: { overall: number };
      methodologyVersion: string;
      sources: unknown[];
    }>;
    methodology: { version: string; citations: unknown[] };
    freshness: { dataMode: string; asOf: string | null };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.count, 54);
  assert.equal(payload.countries.length, 54);
  assert.equal(payload.methodology.version, SCORE_METHODOLOGY_VERSION);
  assert.equal(payload.methodology.citations.length, 8);
  assert.ok(payload.freshness.dataMode);
  assert.ok(payload.freshness.asOf);
  for (const country of payload.countries) {
    assert.ok(country.coverage >= 0 && country.coverage <= 1);
    assert.ok(country.confidence.overall >= 0 && country.confidence.overall <= 1);
    assert.equal(country.methodologyVersion, SCORE_METHODOLOGY_VERSION);
    assert.ok(country.sources.length > 0);
  }
  console.log("Public score API smoke check passed.");
}

async function checkPersistenceSemantics() {
  const rows = AFRICAN_ISO3_CODES.map((id) => ({ id }));
  let legacyWrites = 0;
  let rpcCalls = 0;
  const rpcArguments: Array<Record<string, unknown>> = [];
  const client = (rpcError: { code?: string; message: string } | null) => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls += 1;
      rpcArguments.push(args);
      return { error: rpcError };
    },
    from: () => ({
      upsert: async () => {
        legacyWrites += 1;
        return { error: null };
      },
    }),
  }) as unknown as SupabaseClient;

  assert.equal(
    await persistScoreRelease(
      client(null),
      rows as never,
      trustedRelease.records,
    ),
    "trusted",
  );
  assert.equal(legacyWrites, 0, "atomic success must not perform a second legacy write");
  assert.equal(rpcArguments[0].p_minimum_confidence, 0.8);
  assert.equal(rpcArguments[0].p_minimum_coverage, MIN_TRUSTED_SCORE_COVERAGE);
  assert.equal(
    await persistScoreRelease(
      client({
        code: "PGRST202",
        message: "Could not find publish_country_score_release in the schema cache",
      }),
      rows as never,
      trustedRelease.records,
    ),
    "legacy",
  );
  assert.equal(legacyWrites, 1, "missing migration must preserve the legacy fallback");
  await assert.rejects(
    persistScoreRelease(
      client({ code: "XX000", message: "transaction failed" }),
      rows as never,
      trustedRelease.records,
    ),
    /previous release was retained/,
  );
  assert.equal(
    legacyWrites,
    1,
    "trusted publication failures must retain the previous release instead of writing raw rows",
  );
  await assert.rejects(
    persistScoreRelease(
      client(null),
      rows as never,
      trustedRelease.records.map((record, index) =>
        index === 0
          ? { ...record, classificationDisposition: "quarantine" }
          : record,
      ),
    ),
    /rejected trusted score/,
  );
  assert.equal(rpcCalls, 3, "rejected records must never reach the trusted RPC");
  console.log("Score persistence checks passed: atomic path, migration fallback, and fail-retain semantics.");
}

Promise.all([checkPublicApi(), checkPersistenceSemantics()]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
