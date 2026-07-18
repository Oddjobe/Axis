import assert from "node:assert/strict";

import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";
import { buildActivationReport } from "./trust-activation-report";

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

function passingDataset(name: keyof typeof requiredByDataset) {
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

const eligibleShadowReport = {
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

const now = new Date("2026-07-17T09:00:00.000Z");

function baseInput() {
  return {
    shadowReport: eligibleShadowReport,
    reportPath: "quality-reports/trust-shadow-report.json",
    configVerified: true,
    migrationsVerified: true,
    snapshotsVerified: true,
    rollbackTarget: "3ccd14c",
    now,
  };
}

// 1. All gates satisfied against an approvable live-shadow report -> eligible.
const eligible = buildActivationReport(baseInput());
assert.equal(eligible.status, "eligible");
assert.equal(eligible.blockingReasons.length, 0);
assert.equal(eligible.rollbackTarget, "3ccd14c");
assert.equal(eligible.gates.length, 5);
assert.ok(eligible.gates.every((gate) => gate.status === "passed"));

// 2. A fixtures-mode shadow report is never promotable, so activation blocks
//    even when every operator attestation is present.
const fixtureMode = buildActivationReport({
  ...baseInput(),
  shadowReport: { ...eligibleShadowReport, mode: "fixtures" },
});
assert.equal(fixtureMode.status, "blocked");
assert.equal(
  fixtureMode.gates.find((gate) => gate.id === "shadow-promotion")?.status,
  "blocked",
);
assert.ok(
  fixtureMode.blockingReasons.some((reason) =>
    reason.includes("mode must be live-shadow"),
  ),
);

// 3. A stale live-shadow report (older than the max age) fails closed.
const stale = buildActivationReport({
  ...baseInput(),
  now: new Date("2026-07-19T09:00:00.000Z"),
});
assert.equal(stale.status, "blocked");
assert.equal(
  stale.gates.find((gate) => gate.id === "shadow-promotion")?.status,
  "blocked",
);

// 4. Missing rollback target blocks activation while the shadow gate still
//    passes independently.
const noRollback = buildActivationReport({ ...baseInput(), rollbackTarget: "" });
assert.equal(noRollback.status, "blocked");
assert.equal(
  noRollback.gates.find((gate) => gate.id === "shadow-promotion")?.status,
  "passed",
);
assert.equal(
  noRollback.gates.find((gate) => gate.id === "rollback-target")?.status,
  "blocked",
);
assert.equal(noRollback.rollbackTarget, null);

// 5. Each missing operator attestation blocks activation with an explicit reason.
for (const key of [
  "configVerified",
  "migrationsVerified",
  "snapshotsVerified",
] as const) {
  const report = buildActivationReport({ ...baseInput(), [key]: false });
  assert.equal(report.status, "blocked");
  assert.ok(report.blockingReasons.length >= 1);
}

// 6. Whitespace-only rollback target is treated as absent.
const whitespaceRollback = buildActivationReport({
  ...baseInput(),
  rollbackTarget: "   ",
});
assert.equal(whitespaceRollback.status, "blocked");
assert.equal(whitespaceRollback.rollbackTarget, null);

console.log(
  "Trust activation report fixtures passed (eligible verdict, fixture/stale promotion block, missing rollback, and missing attestation gates all fail closed).",
);
