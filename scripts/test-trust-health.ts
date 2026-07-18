import assert from "node:assert/strict";

import {
  buildTrustHealthPayload,
  getPresentationTone,
  getPublicationPresentation,
  type PublicationDisplayState,
} from "../src/lib/intelligence/publication-health";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";

const ALL_DISPLAY_STATES: readonly PublicationDisplayState[] = [
  "trusted-current",
  "trusted-stale",
  "legacy-live-ingested",
  "cached",
  "static-fallback",
  "unavailable",
];

const generatedAt = "2026-07-18T00:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const staleScoreRows = AFRICAN_ISO3_CODES.map((country, index) => ({
  country,
  publicationTier: "legacy",
  dataMode: "stale",
  sourceUpdatedAt:
    index === 0
      ? "2025-01-15T00:00:00.000Z"
      : `2024-${String((index % 12) + 1).padStart(2, "0")}-01T00:00:00.000Z`,
  observedAt: "2024-12-31T00:00:00.000Z",
}));
const missingPublisherTime = {
  publicationTier: "legacy",
  source: "legacy/supabase",
  dataMode: "stale",
  fallbackUsed: false,
  sourceUpdatedAt: null,
  observedAt: null,
  generatedAt,
  data: [
    {
      id: "legacy-row",
      publicationTier: "legacy",
      sourcePublishedAt: null,
      retrievedAt: "2026-07-17T23:00:00.000Z",
    },
  ],
};
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
    intelligence: missingPublisherTime,
    blogs: missingPublisherTime,
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
      data: COMMODITY_IDS.map((id) => ({
        id,
        publicationTier: "legacy",
        sourceUpdatedAt: "2026-07-16T00:00:00.000Z",
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
assert.equal(payload.datasets.intelligence.displayState, "legacy-live-ingested");
assert.equal(payload.datasets.intelligence.freshness.sourcePublishedAt, null);
assert.equal(payload.datasets.intelligence.freshness.sourceObservedAt, null);
assert.deepEqual(
  payload.datasets.intelligence.coverage.missingPublicationTimeIdentities,
  ["record-1"],
);
assert.equal(payload.datasets.blogs.displayState, "legacy-live-ingested");
assert.equal(payload.datasets.commodities.coverage.trustedRecords, 0);
assert.equal(payload.datasets.commodities.coverage.trustedExpectedRecords, 5);
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
  fallbackUsed: false,
  sourceUpdatedAt: generatedAt,
  observedAt: generatedAt,
  provenance: {
    publisher: "AXIS fixture publisher",
    sourcePublishedAt: generatedAt,
  },
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
      isoCode: "NGA",
      canonicalUrl: "https://publisher.example/trusted-row",
      source: "Fixture publisher",
      publicationTier: "trusted",
      dataMode: "live",
      fallbackUsed: false,
      sourcePublishedAt: generatedAt,
      provenance: {
        publisher: "Fixture publisher",
        sourcePublishedAt: generatedAt,
      },
    },
  ],
};
const trustedInputs = {
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
      total: 54,
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
      coverageMode: "trusted",
      trustedCoverage: {
        records: COMMODITY_IDS.length,
        total: COMMODITY_IDS.length,
        ratio: 1,
        missingIds: [],
      },
      data: COMMODITY_IDS.map((id) => ({
        id,
        publicationTier: "trusted",
        dataMode: "live",
        fallbackUsed: false,
        sourceUpdatedAt: generatedAt,
        provenance: {
          publisher: "Fixture publisher",
          sourcePublishedAt: generatedAt,
        },
      })),
    },
  };
const trustedPayload = buildTrustHealthPayload(
  trustedInputs,
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

const missingPublisherInputs = clone(trustedInputs);
missingPublisherInputs.intelligence.data[0].provenance.publisher = "";
const missingPublisherPayload = buildTrustHealthPayload(
  missingPublisherInputs,
  generatedAt,
  true,
);
assert.equal(
  missingPublisherPayload.datasets.intelligence.displayState,
  "legacy-live-ingested",
);
assert.notEqual(
  missingPublisherPayload.datasets.intelligence.publicationTier,
  "trusted",
);
assert(
  missingPublisherPayload.datasets.intelligence.reasonCodes.includes(
    "publisher-missing",
  ),
);

const placeholderPublisherInputs = clone(trustedInputs);
placeholderPublisherInputs.intelligence.data[0].provenance.publisher =
  "AXIS fallback snapshot";
const placeholderPublisherPayload = buildTrustHealthPayload(
  placeholderPublisherInputs,
  generatedAt,
  true,
);
assert.notEqual(
  placeholderPublisherPayload.datasets.intelligence.displayState,
  "trusted-current",
);
assert(
  placeholderPublisherPayload.datasets.intelligence.reasonCodes.includes(
    "publisher-missing",
  ),
);

const rowSourceOnlyInputs = clone(trustedInputs);
rowSourceOnlyInputs.intelligence.data[0] = {
  ...rowSourceOnlyInputs.intelligence.data[0],
  source: "Reuters",
  provenance: {
    publisher: "",
    sourcePublishedAt: generatedAt,
  },
};
const rowSourceOnlyPayload = buildTrustHealthPayload(
  rowSourceOnlyInputs,
  generatedAt,
  true,
);
assert.notEqual(
  rowSourceOnlyPayload.datasets.intelligence.displayState,
  "trusted-current",
);
assert(
  !JSON.stringify(rowSourceOnlyPayload).includes("publisher.example"),
);

const unknownPublisherInputs = clone(trustedInputs);
unknownPublisherInputs.intelligence.data[0].provenance.publisher = "Unknown";
const unknownPublisherPayload = buildTrustHealthPayload(
  unknownPublisherInputs,
  generatedAt,
  true,
);
assert(
  unknownPublisherPayload.datasets.intelligence.reasonCodes.includes(
    "publisher-missing",
  ),
);

const tbdPublisherInputs = clone(trustedInputs);
tbdPublisherInputs.intelligence.data[0].provenance.publisher = "TBD";
const tbdPublisherPayload = buildTrustHealthPayload(
  tbdPublisherInputs,
  generatedAt,
  true,
);
assert.notEqual(
  tbdPublisherPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const duplicateFeedInputs = clone(trustedInputs);
duplicateFeedInputs.intelligence.data.push(
  {
    ...clone(duplicateFeedInputs.intelligence.data[0]),
    id: "duplicate-cross-country-row",
    isoCode: "KEN",
  },
);
const duplicateFeedPayload = buildTrustHealthPayload(
  duplicateFeedInputs,
  generatedAt,
  true,
);
assert.notEqual(
  duplicateFeedPayload.datasets.intelligence.displayState,
  "trusted-current",
);
assert(
  duplicateFeedPayload.datasets.intelligence.reasonCodes.includes(
    "incomplete-identity-coverage",
  ),
);

const sameCountryInputs = clone(trustedInputs);
sameCountryInputs.intelligence.data[0].isoCode = "KEN";
sameCountryInputs.intelligence.data.push({
  ...clone(sameCountryInputs.intelligence.data[0]),
  id: "second-kenya-row",
  canonicalUrl: "https://publisher.example/second-kenya-row",
});
const sameCountryPayload = buildTrustHealthPayload(
  sameCountryInputs,
  generatedAt,
  true,
);
assert.equal(
  sameCountryPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const collisionInputs = clone(trustedInputs);
collisionInputs.intelligence.data[0].canonicalUrl =
  "https://publisher.example/oqvecv-eap";
collisionInputs.intelligence.data.push({
  ...clone(collisionInputs.intelligence.data[0]),
  id: "fnv-collision-peer",
  canonicalUrl: "https://publisher.example/tw4w9g-f04",
});
const collisionPayload = buildTrustHealthPayload(
  collisionInputs,
  generatedAt,
  true,
);
assert.equal(
  collisionPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const caseSensitiveUrlInputs = clone(trustedInputs);
caseSensitiveUrlInputs.intelligence.data[0].canonicalUrl =
  "https://publisher.example/Story";
caseSensitiveUrlInputs.intelligence.data.push({
  ...clone(caseSensitiveUrlInputs.intelligence.data[0]),
  id: "case-sensitive-peer",
  canonicalUrl: "https://publisher.example/story",
});
const caseSensitiveUrlPayload = buildTrustHealthPayload(
  caseSensitiveUrlInputs,
  generatedAt,
  true,
);
assert.equal(
  caseSensitiveUrlPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const anonymousFeedInputs = clone(trustedInputs);
anonymousFeedInputs.intelligence.data[0].canonicalUrl = "";
const anonymousFeedPayload = buildTrustHealthPayload(
  anonymousFeedInputs,
  generatedAt,
  true,
);
assert.notEqual(
  anonymousFeedPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const missingFallbackMarkerInputs = clone(trustedInputs);
delete (
  missingFallbackMarkerInputs.intelligence.data[0] as Record<string, unknown>
).fallbackUsed;
const missingFallbackMarkerPayload = buildTrustHealthPayload(
  missingFallbackMarkerInputs,
  generatedAt,
  true,
);
assert.notEqual(
  missingFallbackMarkerPayload.datasets.intelligence.displayState,
  "trusted-current",
);

const mixedAgeInputs = clone(trustedInputs);
mixedAgeInputs.intelligence.data.push({
  ...clone(mixedAgeInputs.intelligence.data[0]),
  id: "stale-trusted-row",
  canonicalUrl: "https://publisher.example/stale-trusted-row",
  provenance: {
    publisher: "Fixture publisher",
    sourcePublishedAt: "2025-01-01T00:00:00.000Z",
  },
});
const mixedAgePayload = buildTrustHealthPayload(
  mixedAgeInputs,
  generatedAt,
  true,
);
assert.equal(
  mixedAgePayload.datasets.intelligence.displayState,
  "trusted-stale",
);

const duplicateCommodityInputs = clone(trustedInputs);
duplicateCommodityInputs.commodities.data[1].id =
  duplicateCommodityInputs.commodities.data[0].id;
const duplicateCommodityPayload = buildTrustHealthPayload(
  duplicateCommodityInputs,
  generatedAt,
  true,
);
assert.notEqual(
  duplicateCommodityPayload.datasets.commodities.displayState,
  "trusted-current",
);
assert.equal(
  duplicateCommodityPayload.datasets.commodities.coverage.trustedRecords,
  COMMODITY_IDS.length - 1,
);
assert(
  duplicateCommodityPayload.datasets.commodities.reasonCodes.includes(
    "incomplete-identity-coverage",
  ),
);

const recordFallbackInputs = clone(trustedInputs);
recordFallbackInputs.blogs.data[0].dataMode = "fallback";
recordFallbackInputs.blogs.data[0].fallbackUsed = true;
const recordFallbackPayload = buildTrustHealthPayload(
  recordFallbackInputs,
  generatedAt,
  true,
);
assert.notEqual(
  recordFallbackPayload.datasets.blogs.displayState,
  "trusted-current",
);
assert(
  recordFallbackPayload.datasets.blogs.reasonCodes.includes("record-fallback"),
);

const trustedUnavailableInputs = clone(trustedInputs);
trustedUnavailableInputs.intelligence = {
  ...trustedUnavailableInputs.intelligence,
  success: false,
  source: "trusted/unavailable",
  dataMode: "stale",
  data: [],
};
const trustedUnavailablePayload = buildTrustHealthPayload(
  trustedUnavailableInputs,
  generatedAt,
  true,
);
assert.equal(
  trustedUnavailablePayload.datasets.intelligence.displayState,
  "unavailable",
);
assert(
  trustedUnavailablePayload.datasets.intelligence.reasonCodes.includes(
    "trusted-publication-unavailable",
  ),
);

assert.equal(
  getPublicationPresentation({
    publicationTier: "legacy",
    source: "legacy/supabase",
    dataMode: "live",
    sourceUpdatedAt: generatedAt,
  }).label,
  "LEGACY LIVE-INGESTED",
);
assert.equal(
  getPublicationPresentation({
    publicationTier: "trusted",
    dataMode: "live",
    sourceUpdatedAt: generatedAt,
  }).label,
  "TRUSTED CURRENT",
);
assert.equal(
  getPublicationPresentation({
    publicationTier: "trusted",
    dataMode: "stale",
    sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
  }).label,
  "TRUSTED STALE",
);
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
    "0/5 trusted commodity coverage, a full trusted-current release, and every one of the six " +
    "provenance/freshness display states (trusted-current, trusted-stale, legacy-live-ingested, " +
    "cached, static-fallback, unavailable) resolved as expected.",
);
