import assert from "node:assert/strict";

import {
  buildAggregateTrustHealth,
  classifyTrustHealth,
  TRUST_HEALTH_LABELS,
} from "../src/lib/intelligence/trust-health";
import {
  cachedProbe,
  legacyLiveProbe,
  staticFallbackProbe,
  STALE_TIMESTAMP,
  trustedProbe,
  TRUST_HEALTH_NOW,
  unavailableProbe,
} from "./fixtures/trust-health";

assert.deepEqual(TRUST_HEALTH_LABELS, [
  "trusted-current",
  "trusted-stale",
  "legacy live-ingested",
  "cached",
  "static fallback",
  "unavailable",
]);

assert.equal(
  classifyTrustHealth(
    "intelligence",
    trustedProbe("intelligence"),
    TRUST_HEALTH_NOW,
  ).label,
  "trusted-current",
);
assert.equal(
  classifyTrustHealth(
    "blogs",
    trustedProbe("blogs", {
      timestamp: STALE_TIMESTAMP,
      dataMode: "stale",
    }),
    TRUST_HEALTH_NOW,
  ).label,
  "trusted-stale",
);

const mixedAge = trustedProbe("intelligence");
const mixedAgePayload = mixedAge.payload as {
  data: Array<{
    provenance: { sourcePublishedAt: string };
  }>;
};
mixedAgePayload.data[1].provenance.sourcePublishedAt = STALE_TIMESTAMP;
assert.equal(
  classifyTrustHealth(
    "intelligence",
    mixedAge,
    TRUST_HEALTH_NOW,
  ).label,
  "trusted-stale",
);

assert.equal(
  classifyTrustHealth(
    "intelligence",
    legacyLiveProbe(),
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);
assert.equal(
  classifyTrustHealth("intelligence", cachedProbe(), TRUST_HEALTH_NOW).label,
  "cached",
);
assert.equal(
  classifyTrustHealth(
    "intelligence",
    staticFallbackProbe(),
    TRUST_HEALTH_NOW,
  ).label,
  "static fallback",
);
assert.equal(
  classifyTrustHealth(
    "intelligence",
    unavailableProbe(),
    TRUST_HEALTH_NOW,
  ).label,
  "unavailable",
);

const missingPublisher = trustedProbe("intelligence", { publisher: null });
const missingPublisherPayload = missingPublisher.payload as {
  data: Array<{ provenance: { publisher: string | null } }>;
};
for (const item of missingPublisherPayload.data) {
  item.provenance.publisher = null;
}
assert.equal(
  classifyTrustHealth(
    "intelligence",
    missingPublisher,
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);

const contradictoryPartial = trustedProbe("intelligence");
const contradictoryPayload = contradictoryPartial.payload as {
  coverageMode?: string;
  data: Array<{ dataMode: string; fallbackUsed: boolean }>;
};
contradictoryPayload.coverageMode = "partial";
contradictoryPayload.data[0].dataMode = "fallback";
contradictoryPayload.data[0].fallbackUsed = true;
assert.equal(
  classifyTrustHealth(
    "intelligence",
    contradictoryPartial,
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);

const staleLegacy = legacyLiveProbe();
(staleLegacy.payload as Record<string, unknown>).dataMode = "stale";
assert.equal(
  classifyTrustHealth(
    "intelligence",
    staleLegacy,
    TRUST_HEALTH_NOW,
  ).label,
  "unavailable",
);

const zeroOfFive = trustedProbe("commodities");
const zeroCoveragePayload = zeroOfFive.payload as Record<string, unknown>;
zeroCoveragePayload.source = "legacy/static";
zeroCoveragePayload.publicationTier = "legacy";
zeroCoveragePayload.fallbackUsed = true;
zeroCoveragePayload.dataMode = "stale";
zeroCoveragePayload.trustedCoverage = {
  records: 0,
  total: 5,
  ratio: 0,
  missingIds: ["lithium", "cobalt", "copper", "gold", "bauxite"],
};
assert.equal(
  classifyTrustHealth("commodities", zeroOfFive, TRUST_HEALTH_NOW).label,
  "static fallback",
);

const incompleteTrusted = trustedProbe("commodities");
(incompleteTrusted.payload as Record<string, unknown>).trustedCoverage = {
  records: 4,
  total: 5,
  ratio: 0.8,
  missingIds: ["bauxite"],
};
assert.equal(
  classifyTrustHealth(
    "commodities",
    incompleteTrusted,
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);

const duplicateCommodities = trustedProbe("commodities");
const duplicateCommodityPayload = duplicateCommodities.payload as {
  data: Array<{ id: string }>;
};
duplicateCommodityPayload.data[1].id = duplicateCommodityPayload.data[0].id;
assert.equal(
  classifyTrustHealth(
    "commodities",
    duplicateCommodities,
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);

const duplicateCountries = trustedProbe("country-scores");
const duplicateCountryPayload = duplicateCountries.payload as {
  countries: Array<{ country: string }>;
};
duplicateCountryPayload.countries[1].country =
  duplicateCountryPayload.countries[0].country;
assert.equal(
  classifyTrustHealth(
    "country-scores",
    duplicateCountries,
    TRUST_HEALTH_NOW,
  ).label,
  "legacy live-ingested",
);

const healthy = buildAggregateTrustHealth(
  {
    "country-scores": trustedProbe("country-scores"),
    commodities: trustedProbe("commodities"),
    intelligence: trustedProbe("intelligence"),
    blogs: trustedProbe("blogs"),
  },
  TRUST_HEALTH_NOW,
);
assert.equal(healthy.status, "healthy");
assert.equal(healthy.currentTrusted, true);
assert.equal(healthy.summary["trusted-current"], 4);

const productionLike = buildAggregateTrustHealth(
  {
    "country-scores": staticFallbackProbe(),
    commodities: zeroOfFive,
    intelligence: missingPublisher,
    blogs: staleLegacy,
  },
  TRUST_HEALTH_NOW,
);
assert.equal(productionLike.status, "degraded");
assert.equal(productionLike.currentTrusted, false);
assert.equal(productionLike.summary["trusted-current"], 0);
assert.equal(productionLike.datasets.commodities.currentTrusted, false);

const serialized = JSON.stringify(
  buildAggregateTrustHealth(
    {
      "country-scores": unavailableProbe(),
      commodities: unavailableProbe(),
      intelligence: unavailableProbe(),
      blogs: unavailableProbe(),
    },
    TRUST_HEALTH_NOW,
  ),
);
assert(!serialized.includes("fixture secret"));
assert(!serialized.includes("error"));
assert.equal(JSON.parse(serialized).status, "unavailable");

console.log(
  "Trust health contract fixtures passed (exact labels, fail-closed trust, complete coverage, provenance, stale/static/cache distinction, and sanitized aggregation).",
);
