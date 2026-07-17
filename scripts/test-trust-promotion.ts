import assert from "node:assert/strict";

import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";
import { validatePromotionReport } from "./trust-promotion-check";

const requiredByDataset = {
  intelligence: [
    "https://fixture.example/alerts/1",
    "https://fixture.example/alerts/2",
    "https://fixture.example/alerts/3",
    "https://fixture.example/alerts/4",
    "https://fixture.example/alerts/5",
  ],
  blog: [
    "https://fixture.example/blog/1",
    "https://fixture.example/blog/2",
    "https://fixture.example/blog/3",
    "https://fixture.example/blog/4",
    "https://fixture.example/blog/5",
  ],
  "country-score": [...AFRICAN_ISO3_CODES],
  commodity: [...COMMODITY_IDS],
} as const;

function passingDataset(
  name: keyof typeof requiredByDataset,
) {
  const identities = [...requiredByDataset[name]].sort();
  const required =
    name === "country-score" || name === "commodity" ? identities : [];
  return {
    currentCount: identities.length,
    comparableCount: identities.length,
    trustedCount: identities.length,
    matchedCount: identities.length,
    freshCount: identities.length,
    currentIdentityCount: identities.length,
    trustedIdentityCount: identities.length,
    matchedIdentityCount: identities.length,
    freshMatchedIdentityCount: identities.length,
    freshRowCount: identities.length,
    duplicateTrustedRowCount: 0,
    coverageRate: 1,
    freshnessRate: 1,
    rejectionRate: 0,
    thresholdsPassed: true,
    identity: {
      schemaVersion: 1,
      currentIdentities: identities,
      trustedIdentities: identities,
      matchedIdentities: identities,
      freshMatchedIdentities: identities,
      staleMatchedIdentities: [],
      requiredIdentities: required,
      missingCurrentIdentities: [],
      missingTrustedIdentities: [],
      missingFreshIdentities: [],
      unexpectedCurrentIdentities: [],
      requirementsSatisfied: true,
    },
  };
}

const eligible = {
  version: 3,
  identitySchemaVersion: 1,
  mode: "live-shadow",
  generatedAt: "2026-07-17T08:00:00.000Z",
  promotionEligible: true,
  thresholdsPassed: true,
  consecutiveSuccessfulRuns: 3,
  thresholds: {
    minCoverage: 0.7,
    minFreshness: 0.8,
    maxRejection: 0.3,
    requiredRuns: 3,
  },
  byDataset: {
    intelligence: passingDataset("intelligence"),
    blog: passingDataset("blog"),
    "country-score": passingDataset("country-score"),
    commodity: passingDataset("commodity"),
  },
  warnings: [],
};
const validationOptions = { now: new Date("2026-07-17T09:00:00.000Z") };

assert.doesNotThrow(() => validatePromotionReport(eligible, validationOptions));
assert.throws(
  () => validatePromotionReport({ ...eligible, version: 2 }, validationOptions),
  /older reports fail closed/,
);
assert.throws(
  () =>
    validatePromotionReport({ ...eligible, mode: "fixtures" }, validationOptions),
  /mode must be live-shadow/,
);
assert.throws(
  () =>
    validatePromotionReport(
      {
        ...eligible,
        consecutiveSuccessfulRuns: 2,
        promotionEligible: false,
      },
      validationOptions,
    ),
  /2\/3 consecutive/,
);
assert.throws(
  () =>
    validatePromotionReport(
      {
        ...eligible,
        byDataset: {
          ...eligible.byDataset,
          commodity: {
            ...passingDataset("commodity"),
            currentCount: 4,
          },
        },
      },
      validationOptions,
    ),
  /commodity/,
);
assert.throws(
  () =>
    validatePromotionReport(
      { ...eligible, warnings: ["degraded"] },
      validationOptions,
    ),
  /Promotion blocked/,
);
assert.throws(
  () =>
    validatePromotionReport(
      { ...eligible, generatedAt: "2026-07-16T08:59:59.999Z" },
      validationOptions,
    ),
  /timestamp is missing, stale, or in the future/,
);
assert.throws(
  () =>
    validatePromotionReport(
      { ...eligible, generatedAt: "2026-07-17T09:05:00.001Z" },
      validationOptions,
    ),
  /timestamp is missing, stale, or in the future/,
);

console.log(
  "Trust promotion fixtures passed (identity-complete live shadow accepted; old, fixture, incomplete, and degraded reports blocked).",
);
