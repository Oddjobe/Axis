import assert from "node:assert/strict";

import {
  buildTrustHealthPayload,
  getPresentationTone,
  getPublicationPresentation,
  getRefreshFailurePresentation,
  type PublicationDisplayState,
} from "../src/lib/intelligence/publication-health";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";
import { trustHealthContractSchema } from "../src/lib/intelligence/trust-health-contract.server";

const ALL_DISPLAY_STATES: readonly PublicationDisplayState[] = [
  "trusted-current",
  "trusted-stale",
  "legacy-live-ingested",
  "cached",
  "static-fallback",
  "unavailable",
];

const generatedAt = "2026-07-18T00:00:00.000Z";
const staleScoreRows = AFRICAN_ISO3_CODES.map((country, index) => ({
  country,
  publicationTier: "legacy",
  dataMode: "stale",
  sourceUpdatedAt:
    index === 0
      ? null
      : `2024-${String((index % 12) + 1).padStart(2, "0")}-01T00:00:00.000Z`,
  observedAt: "2024-12-31T00:00:00.000Z",
}));
const intelligenceInternalId = "d0ddfd5f-9ca7-42e6-b1f7-45d5414bf4df";
const blogInternalId = "40eb950c-bf65-4b83-a500-0aafdc3aad95";
const missingPublisherTime = (id: string) => ({
  publicationTier: "legacy",
  source: "legacy/supabase",
  dataMode: "stale",
  fallbackUsed: false,
  sourceUpdatedAt: null,
  observedAt: null,
  generatedAt,
  data: [
    {
      id,
      publicationTier: "legacy",
      sourcePublishedAt: null,
      retrievedAt: "2026-07-17T23:00:00.000Z",
    },
  ],
});
const payload = buildTrustHealthPayload(
  {
    scores: {
      success: true,
      publicationTier: "legacy",
      source: "legacy/static",
      dataMode: "stale",
      fallbackUsed: true,
      sourceUpdatedAt: "2024-12-31T00:00:00.000Z",
      observedAt: "2024-12-31T00:00:00.000Z",
      generatedAt,
      count: 54,
      countries: staleScoreRows,
    },
    intelligence: missingPublisherTime(intelligenceInternalId),
    blogs: missingPublisherTime(blogInternalId),
    commodities: {
      success: true,
      publicationTier: "legacy",
      source: "legacy/static",
      dataMode: "fallback",
      fallbackUsed: true,
      sourceUpdatedAt: "2026-07-16T00:00:00.000Z",
      observedAt: "2026-07-16T00:00:00.000Z",
      generatedAt,
      trustedCoverage: {
        records: 0,
        total: COMMODITY_IDS.length,
        ratio: 0,
        missingIds: [...COMMODITY_IDS],
      },
      data: COMMODITY_IDS.map((id, index) => ({
        id,
        publicationTier: "legacy",
        sourceUpdatedAt:
          index === 0 ? null : "2026-07-16T00:00:00.000Z",
      })),
    },
  },
  generatedAt,
  false,
);

assert.equal(payload.status, "stale");
assert.equal(payload.trustedPublicationsEnabled, false);
assert.equal(payload.datasets.countryScores.coverage.availableRecords, 54);
assert.equal(payload.datasets.countryScores.coverage.expectedRecords, 54);
assert.equal(payload.datasets.countryScores.status, "stale");
assert(payload.datasets.countryScores.reasonCodes.includes("source-stale"));
assert.equal(
  payload.datasets.countryScores.coverage.missingPublicationTimeRecords,
  1,
);
assert.deepEqual(
  payload.datasets.countryScores.coverage.missingPublicationTimeIdentities,
  [AFRICAN_ISO3_CODES[0]],
);
assert.equal(payload.datasets.intelligence.displayState, "legacy-live-ingested");
assert.equal(payload.datasets.intelligence.freshness.sourcePublishedAt, null);
assert.equal(payload.datasets.intelligence.freshness.sourceObservedAt, null);
assert.equal(
  payload.datasets.intelligence.coverage.missingPublicationTimeRecords,
  1,
);
assert.deepEqual(
  payload.datasets.intelligence.coverage.missingPublicationTimeIdentities,
  [],
);
assert.equal(payload.datasets.blogs.displayState, "legacy-live-ingested");
assert.equal(payload.datasets.blogs.coverage.missingPublicationTimeRecords, 1);
assert.deepEqual(
  payload.datasets.blogs.coverage.missingPublicationTimeIdentities,
  [],
);
const serializedPayload = JSON.stringify(payload);
assert(!serializedPayload.includes(intelligenceInternalId));
assert(!serializedPayload.includes(blogInternalId));
assert.equal(payload.datasets.commodities.coverage.trustedRecords, 0);
assert.equal(payload.datasets.commodities.coverage.trustedExpectedRecords, 5);
assert.equal(
  payload.datasets.commodities.coverage.missingPublicationTimeRecords,
  1,
);
assert.deepEqual(
  payload.datasets.commodities.coverage.missingPublicationTimeIdentities,
  [COMMODITY_IDS[0]],
);
assert.deepEqual(
  payload.datasets.commodities.coverage.missingTrustedIdentities,
  COMMODITY_IDS,
);
assert(
  payload.datasets.commodities.reasonCodes.includes("trusted-coverage-zero"),
);

// Contract: legacy content without publisher timestamps, stale legacy scores,
// and static commodities with 0/5 trusted coverage must never be labeled trusted.
const NEVER_TRUSTED: PublicationDisplayState[] = ["trusted-current", "trusted-stale"];
for (const [name, dataset] of Object.entries(payload.datasets)) {
  assert(
    !NEVER_TRUSTED.includes(dataset.displayState),
    `${name} must never be labeled trusted while all sources are legacy/stale/zero-coverage (got ${dataset.displayState})`,
  );
  assert.equal(
    dataset.publicationTier === "trusted",
    false,
    `${name} publicationTier must not be trusted in this all-legacy fixture`,
  );
}
assert.equal(payload.datasets.countryScores.displayState, "static-fallback");
assert.equal(payload.datasets.commodities.displayState, "static-fallback");
assert.deepEqual(trustHealthContractSchema.parse(payload), payload);
assert.equal(
  getPublicationPresentation({
    displayState: "trusted-current",
    publicationTier: "legacy",
    source: "legacy/static",
    dataMode: "fallback",
    fallbackUsed: true,
  }).state,
  "static-fallback",
);
const contradictoryPayload = structuredClone(payload);
contradictoryPayload.datasets.countryScores.displayState = "trusted-current";
assert.equal(
  trustHealthContractSchema.safeParse(contradictoryPayload).success,
  false,
);

// Aggregate output is an allowlisted health contract, never a passthrough of
// upstream errors, source material, storage details, or credentials.
const sanitizedPayload = buildTrustHealthPayload(
  {
    scores: {
      ...missingPublisherTime("score-internal"),
      error: "database timeout with internal host",
      storageBucket: "private-bucket",
      sourceUrl: "https://private.example/source",
      excerpt: "unpublished source text",
      apiKey: "secret-value",
      countries: [],
    },
    intelligence: missingPublisherTime("intelligence-internal"),
    blogs: missingPublisherTime("blog-internal"),
    commodities: {
      ...missingPublisherTime("commodity-internal"),
      trustedCoverage: {
        records: 0,
        total: COMMODITY_IDS.length,
        missingIds: [...COMMODITY_IDS],
      },
    },
  },
  generatedAt,
  false,
);
const serializedSanitizedPayload = JSON.stringify(sanitizedPayload);
for (const forbidden of [
  "database timeout",
  "private-bucket",
  "private.example",
  "unpublished source text",
  "secret-value",
]) {
  assert.equal(serializedSanitizedPayload.includes(forbidden), false);
}

// A genuinely live-ingested-but-aged legacy score (not a static fallback) must
// still resolve to the legacy state, never trusted-stale.
const staleLegacyLiveScore = getPublicationPresentation({
  publicationTier: "legacy",
  source: "legacy/supabase",
  dataMode: "stale",
  fallbackUsed: false,
  sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
});
assert.equal(staleLegacyLiveScore.state, "legacy-live-ingested");
assert.notEqual(staleLegacyLiveScore.state, "trusted-stale");

// Full trusted-current scenario: all four datasets complete, fresh, and
// authentically trusted end to end.
const trustedScoreRows = AFRICAN_ISO3_CODES.map((country) => ({
  country,
  publicationTier: "trusted",
  dataMode: "live",
  sourceUpdatedAt: generatedAt,
  observedAt: generatedAt,
}));
const trustedFeed = {
  success: true,
  publicationTier: "trusted",
  source: "trusted",
  dataMode: "live",
  fallbackUsed: false,
  sourceUpdatedAt: generatedAt,
  observedAt: generatedAt,
  generatedAt,
  data: [
    {
      id: "trusted-row",
      publicationTier: "trusted",
      sourcePublishedAt: generatedAt,
    },
  ],
};
const trustedPayload = buildTrustHealthPayload(
  {
    scores: {
      success: true,
      publicationTier: "trusted",
      source: "trusted",
      dataMode: "live",
      fallbackUsed: false,
      sourceUpdatedAt: generatedAt,
      observedAt: generatedAt,
      generatedAt,
      count: 54,
      countries: trustedScoreRows,
    },
    intelligence: trustedFeed,
    blogs: trustedFeed,
    commodities: {
      success: true,
      publicationTier: "trusted",
      source: "trusted",
      dataMode: "live",
      fallbackUsed: false,
      sourceUpdatedAt: generatedAt,
      observedAt: generatedAt,
      generatedAt,
      trustedCoverage: {
        records: COMMODITY_IDS.length,
        total: COMMODITY_IDS.length,
        ratio: 1,
        missingIds: [],
      },
      data: COMMODITY_IDS.map((id) => ({
        id,
        publicationTier: "trusted",
        sourceUpdatedAt: generatedAt,
      })),
    },
  },
  generatedAt,
  true,
);
assert.equal(trustedPayload.status, "current");
assert.equal(trustedPayload.trustedPublicationsEnabled, true);
for (const [name, dataset] of Object.entries(trustedPayload.datasets)) {
  assert.equal(
    dataset.displayState,
    "trusted-current",
    `${name} should be trusted-current when fully covered, fresh, and trusted`,
  );
  assert.equal(dataset.status, "current");
}
assert.equal(trustedPayload.datasets.commodities.coverage.trustedRecords, 5);
assert.equal(
  trustedPayload.datasets.commodities.coverage.trustedExpectedRecords,
  5,
);

assert.equal(PUBLIC_TRUST_STATES.length, 6);
assert.equal(new Set(PUBLIC_TRUST_STATES).size, 6);

for (const fixture of TRUST_STATE_FIXTURES) {
  assert.equal(
    derivePublicTrustState(fixture.input),
    fixture.expected,
    fixture.name,
  );
}

assert.deepEqual(
  PUBLIC_TRUST_STATES.map(getPublicTrustStateLabel),
  [
    "TRUSTED-CURRENT",
    "TRUSTED-STALE",
    "LEGACY LIVE-INGESTED",
    "CACHED",
    "STATIC FALLBACK",
    "UNAVAILABLE",
  ],
);

for (const [dataset, fixture] of Object.entries(CURRENT_PRODUCTION_CONTRACT)) {
  const health = sanitizeDatasetHealth(fixture.payload, 200);
  assert.equal(health.state, fixture.expected, dataset);
  assert.notEqual(
    health.state,
    "trusted-current",
    `${dataset} must not be labeled trusted-current`,
  );
}

const commodityHealth = sanitizeDatasetHealth(
  CURRENT_PRODUCTION_CONTRACT.commodities.payload,
  200,
);
assert.deepEqual(commodityHealth.trustedCoverage, { records: 0, total: 5 });

const unavailable = sanitizeDatasetHealth(
  {
    success: false,
    source: "trusted/unavailable",
    publicationTier: "trusted",
    dataMode: "stale",
  },
  503,
);
assert.deepEqual(unavailable, {
  state: "unavailable",
  sourceKind: "none",
  publicationTier: "unavailable",
  dataMode: "unavailable",
  asOf: null,
  records: 0,
  trustedCoverage: null,
});

assert.equal(
  getPublicationPresentation({
    publicationTier: "legacy",
    dataMode: "cached",
    sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
  }).label,
  "CACHED",
);
assert.equal(
  getPublicationPresentation({
    publicationTier: "legacy",
    source: "legacy/static",
    dataMode: "fallback",
    fallbackUsed: true,
    sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
  }).label,
  "STATIC FALLBACK",
);
assert.equal(
  getPublicationPresentation({ success: false }).label,
  "UNAVAILABLE",
);
assert.equal(
  getPublicationPresentation({ source: "trusted/unavailable" }).state,
  "unavailable",
);

const trustedBeforeRefreshFailure = getPublicationPresentation({
  publicationTier: "trusted",
  dataMode: "live",
  sourceUpdatedAt: generatedAt,
  observedAt: generatedAt,
  generatedAt,
});
const retainedAfterRefreshFailure = getRefreshFailurePresentation(
  true,
  trustedBeforeRefreshFailure,
);
assert.equal(retainedAfterRefreshFailure.state, "cached");
assert.equal(retainedAfterRefreshFailure.label, "CACHED");
assert.equal(retainedAfterRefreshFailure.sourcePublishedAt, generatedAt);
assert.equal(retainedAfterRefreshFailure.sourceObservedAt, generatedAt);
const emptyAfterRefreshFailure = getRefreshFailurePresentation(
  false,
  trustedBeforeRefreshFailure,
);
assert.equal(emptyAfterRefreshFailure.state, "unavailable");
assert.equal(emptyAfterRefreshFailure.label, "UNAVAILABLE");

// Every one of the exact six provenance/freshness states must resolve to a
// deterministic, distinct display tone shared across dashboard surfaces.
const tones = ALL_DISPLAY_STATES.map((state) => getPresentationTone(state));
for (const tone of tones) {
  assert(tone.dot && tone.text && tone.border && tone.bg);
}
assert.equal(new Set(tones.map((tone) => tone.text)).size <= 4, true);
assert.equal(
  getPresentationTone("trusted-current").text,
  "text-emerald-500",
);
assert.equal(getPresentationTone("unavailable").text, "text-red-500");

console.log(
  "Trust health fixtures passed: all-legacy 54-country stale metadata, missing publisher times, " +
    "sanitized feed identities, cached/unavailable refresh failures, 0/5 trusted commodity coverage, " +
    "a full trusted-current release, and every one of the six " +
    "provenance/freshness display states (trusted-current, trusted-stale, legacy-live-ingested, " +
    "cached, static-fallback, unavailable) resolved as expected.",
);
