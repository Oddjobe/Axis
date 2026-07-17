import assert from "node:assert/strict";

import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";
import { summarizeShadowDataset } from "./trust-shadow";
import { validatePromotionReport } from "./trust-promotion-check";

const generatedAt = "2026-01-15T12:00:00.000Z";
const freshAt = "2026-01-15T10:00:00.000Z";
const staleAt = "2020-01-01T00:00:00.000Z";
const thresholds = {
  minCoverage: 0.7,
  minFreshness: 0.8,
  maxRejection: 0.3,
};

const commodityCurrent = COMMODITY_IDS.map((id) => ({ id }));
const commodityTrusted = [
  ...COMMODITY_IDS.map((id) => ({ id, sourcePublishedAt: staleAt })),
  ...Array.from({ length: 100 }, () => ({
    id: COMMODITY_IDS[0],
    sourcePublishedAt: freshAt,
  })),
];
const commodity = summarizeShadowDataset(
  "commodity",
  commodityCurrent,
  commodityTrusted,
  0,
  generatedAt,
  thresholds,
);

assert.equal(commodity.matchedCount, 5);
assert.equal(commodity.freshRowCount, 100);
assert.equal(commodity.freshCount, 1);
assert.equal(commodity.freshnessRate, 0.2);
assert.equal(commodity.duplicateTrustedRowCount, 100);
assert.deepEqual(commodity.identity.freshMatchedIdentities, [COMMODITY_IDS[0]]);
assert.equal(commodity.identity.staleMatchedIdentities.length, 4);
assert.equal(commodity.identity.requirementsSatisfied, false);
assert.equal(commodity.thresholdsPassed, false);

const scoreCurrent = AFRICAN_ISO3_CODES.map((country) => ({ country }));
const scoreTrusted = [
  ...AFRICAN_ISO3_CODES.map((country) => ({
    country,
    sourcePublishedAt: staleAt,
  })),
  ...Array.from({ length: 200 }, () => ({
    country: AFRICAN_ISO3_CODES[0],
    sourcePublishedAt: freshAt,
  })),
];
const countryScore = summarizeShadowDataset(
  "country-score",
  scoreCurrent,
  scoreTrusted,
  0,
  generatedAt,
  thresholds,
);

assert.equal(countryScore.matchedCount, 54);
assert.equal(countryScore.freshRowCount, 200);
assert.equal(countryScore.freshCount, 1);
assert.equal(countryScore.freshnessRate, 0.0185);
assert.equal(countryScore.identity.staleMatchedIdentities.length, 53);
assert.equal(countryScore.identity.requirementsSatisfied, false);
assert.equal(countryScore.thresholdsPassed, false);

const content = (dataset: "intelligence" | "blog") => {
  const current = Array.from({ length: 5 }, (_, index) => ({
    canonicalUrl: `https://fixture.example/${dataset}/${index}`,
  }));
  const trusted = current.map((record) => ({
    ...record,
    sourcePublishedAt: freshAt,
  }));
  return summarizeShadowDataset(
    dataset,
    current,
    trusted,
    0,
    generatedAt,
    thresholds,
  );
};

assert.throws(
  () =>
    validatePromotionReport(
      {
        version: 3,
        identitySchemaVersion: 1,
        mode: "live-shadow",
        generatedAt,
        promotionEligible: true,
        thresholdsPassed: true,
        consecutiveSuccessfulRuns: 3,
        thresholds: { ...thresholds, requiredRuns: 3 },
        byDataset: {
          intelligence: content("intelligence"),
          blog: content("blog"),
          "country-score": countryScore,
          commodity,
        },
        warnings: [],
      },
      { now: new Date(generatedAt) },
    ),
  /country-score|commodity/,
);

console.log(
  "Trust shadow identity fixtures passed (duplicate-heavy fresh history cannot hide stale commodity or country-score identities).",
);
