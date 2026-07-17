import assert from "node:assert/strict";

import {
  CURRENT_PRODUCTION_CONTRACT,
  TRUST_STATE_FIXTURES,
} from "./fixtures/trust-health";
import {
  PUBLIC_TRUST_STATES,
  derivePublicTrustState,
  getPublicTrustStateLabel,
  sanitizeDatasetHealth,
} from "../src/lib/intelligence/trust-health";

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

console.log(
  "Trust-health contract fixtures passed (six states and current production legacy scenario).",
);
