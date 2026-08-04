import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";

import {
  REQUIRED_STEP_VARIABLES,
  evaluateEnforcement,
  formatEnforcement,
  readCoverageActuals,
  runWorkflowEnforcement,
  type CoverageActuals,
  type CoverageBaseline,
  type KnownSourceGaps,
} from "./workflow-enforce";

const baseline: KnownSourceGaps = {
  version: 2,
  acceptedAt: "2026-08-04",
  datasets: {
    intelligence: {
      sourcesSucceeded: { observed: 3, floor: 2 },
      published: { observed: 8, floor: 3 },
    },
    blog: {
      sourcesSucceeded: { observed: 1, floor: 0 },
      published: { observed: 0, floor: 0 },
    },
    commodity: {
      trustedRecords: { observed: 2, floor: 2 },
      expectedTotal: 5,
    },
    countryScore: {
      publishedCountries: { observed: 0, floor: 0 },
      expectedTotal: 54,
    },
  },
};

const closedBaseline: KnownSourceGaps = {
  version: 2,
  acceptedAt: "2026-08-04",
  datasets: {
    intelligence: {
      sourcesSucceeded: { observed: 5, floor: 5 },
      published: { observed: 5, floor: 5 },
    },
    blog: {
      sourcesSucceeded: { observed: 3, floor: 3 },
      published: { observed: 3, floor: 3 },
    },
    commodity: {
      trustedRecords: { observed: 5, floor: 5 },
      expectedTotal: 5,
    },
    countryScore: {
      publishedCountries: { observed: 54, floor: 54 },
      expectedTotal: 54,
    },
  },
};

const actuals: CoverageActuals = {
  intelligence: { sourcesSucceeded: 3, published: 8 },
  blog: { sourcesSucceeded: 1, published: 0 },
  commodity: { trustedRecords: 2, expectedTotal: 5 },
};

const allStepsSucceeded = Object.fromEntries(
  [...REQUIRED_STEP_VARIABLES, "LIVE_QUALITY_OUTCOME", "SHADOW_INGESTION_OUTCOME"].map(
    (name) => [name, "success"],
  ),
);

// Known gaps remain open, so the run reports degraded instead of failing. This is
// the everyday case that previously produced a red build. Coverage sitting inside
// the variance headroom must not be reported as an improvement.
const degraded = evaluateEnforcement(
  { ...allStepsSucceeded, LIVE_QUALITY_OUTCOME: "failure" },
  actuals,
  baseline,
);
assert.equal(degraded.status, "degraded");
assert.deepEqual(degraded.hardFailures, []);
assert.deepEqual(degraded.regressions, []);
assert.deepEqual(
  degraded.improvements,
  [],
  "variance headroom below the observed level must not be reported as an improvement",
);
assert(degraded.openGaps.some((gap) => gap.startsWith("blog:")));
assert(degraded.openGaps.some((gap) => gap.startsWith("commodity:")));

// Coverage inside the headroom but under observed is still tolerated.
const withinHeadroom = evaluateEnforcement(
  { ...allStepsSucceeded, LIVE_QUALITY_OUTCOME: "failure" },
  {
    ...actuals,
    intelligence: { sourcesSucceeded: 2, published: 4 },
  },
  baseline,
);
assert.equal(withinHeadroom.status, "degraded");
assert.deepEqual(withinHeadroom.regressions, []);

// Reproduces the original defect: an outcome variable that is never provided to
// the step expands to an empty string and must be reported by name.
const missingVariable = evaluateEnforcement(
  { ...allStepsSucceeded, KPI_REFRESH_OUTCOME: undefined },
  actuals,
  baseline,
);
assert.equal(missingVariable.status, "failed");
assert(
  missingVariable.hardFailures.some((failure) =>
    failure.startsWith("KPI_REFRESH_OUTCOME=undefined"),
  ),
  "an undefined required outcome must be reported by name",
);

// A genuine regression below the accepted floor still fails loudly.
const regressed = evaluateEnforcement(
  allStepsSucceeded,
  {
    ...actuals,
    commodity: { trustedRecords: 1, expectedTotal: 5 },
  },
  baseline,
);
assert.equal(regressed.status, "failed");
assert(
  regressed.regressions.some((entry) =>
    entry.includes("commodity.trustedRecords fell to 1"),
  ),
);

// Recovery beyond the accepted level passes and asks for the baseline to be raised.
const improved = evaluateEnforcement(
  { ...allStepsSucceeded, LIVE_QUALITY_OUTCOME: "failure" },
  {
    ...actuals,
    commodity: { trustedRecords: 4, expectedTotal: 5 },
  },
  baseline,
);
assert.equal(improved.status, "degraded");
assert(
  improved.improvements.some((entry) =>
    entry.includes("commodity.trustedRecords reached 4"),
  ),
);
assert(
  formatEnforcement(improved).some((line) => line.includes("raise the baseline")),
);

// An unverifiable run must never pass silently.
const unverifiable = evaluateEnforcement(allStepsSucceeded, null, baseline);
assert.equal(unverifiable.status, "failed");
assert(
  unverifiable.hardFailures.some((failure) =>
    failure.startsWith("coverage=unverifiable"),
  ),
);

// Once every gap is closed the live post-write gate becomes mandatory again.
const closedWithLiveFailure = evaluateEnforcement(
  { ...allStepsSucceeded, LIVE_QUALITY_OUTCOME: "failure" },
  {
    intelligence: { sourcesSucceeded: 5, published: 5 },
    blog: { sourcesSucceeded: 3, published: 3 },
    commodity: { trustedRecords: 5, expectedTotal: 5 },
  },
  closedBaseline,
);
assert.equal(closedWithLiveFailure.status, "failed");
assert(closedWithLiveFailure.liveQualityRequired);
assert(
  closedWithLiveFailure.hardFailures.some((failure) =>
    failure.startsWith("LIVE_QUALITY_OUTCOME=failure"),
  ),
);

const fullyHealthy = evaluateEnforcement(
  allStepsSucceeded,
  {
    intelligence: { sourcesSucceeded: 5, published: 5 },
    blog: { sourcesSucceeded: 3, published: 3 },
    commodity: { trustedRecords: 5, expectedTotal: 5 },
  },
  closedBaseline,
);
assert.equal(fullyHealthy.status, "pass");
assert.deepEqual(fullyHealthy.openGaps, []);

// Malformed report sections must not be coerced into zero coverage.
assert.equal(readCoverageActuals(null), null);
assert.equal(readCoverageActuals({ intelligence: {}, blog: {} }), null);
assert.deepEqual(
  readCoverageActuals({
    intelligence: { sourcesSucceeded: 3, published: 8 },
    blog: { sourcesSucceeded: 1, published: 0 },
    commodity: { trustedCoverage: { records: 2, total: 5 } },
  }),
  actuals,
);

/**
 * Guards the defect class that caused the daily failure: a variable referenced by
 * the enforcement step but never passed into its `env:` block.
 */
async function verifyWorkflowWiring(): Promise<void> {
  const workflow = await readFile(".github/workflows/scrape.yml", "utf8");
  const enforceStep = workflow.slice(
    workflow.indexOf("- name: Enforce required workflow outcomes"),
  );
  const stepBody = enforceStep.slice(0, enforceStep.indexOf("\n      - name:"));

  for (const variable of [...REQUIRED_STEP_VARIABLES, "LIVE_QUALITY_OUTCOME"]) {
    assert.match(
      stepBody,
      new RegExp(`^\\s+${variable}: \\$\\{\\{ steps\\.`, "m"),
      `${variable} must be supplied to the enforcement step`,
    );
  }

  // Generated metadata must be committed even when coverage is degraded,
  // otherwise a successful refresh is discarded.
  const commitIndex = workflow.indexOf("- name: Commit and Push Changes");
  const enforceIndex = workflow.indexOf(
    "- name: Enforce required workflow outcomes",
  );
  assert(commitIndex > 0, "the commit step must exist");
  assert(
    commitIndex < enforceIndex,
    "the commit step must run before enforcement so refreshed metadata is not discarded",
  );
  assert.match(
    workflow.slice(commitIndex, enforceIndex),
    /if: always\(\) && steps\.kpis\.outcome == 'success' && steps\.data_quality\.outcome == 'success'/,
    "the commit step must be gated on the checks that produce and validate the metadata",
  );
}

async function verifyReportAndFailure(): Promise<void> {
  const reportPath = "quality-reports/fixtures/workflow-enforcement-test.json";
  try {
    await assert.rejects(
      runWorkflowEnforcement({
        ...allStepsSucceeded,
        KPI_REFRESH_OUTCOME: "",
        WORKFLOW_ENFORCEMENT_REPORT: reportPath,
        SHADOW_INGESTION_REPORT: "does-not-exist.json",
      }),
      /Workflow enforcement failed/,
    );
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).status, "failed");
  } finally {
    await rm(reportPath, { force: true });
  }
}

async function verifyShippedBaseline(): Promise<void> {
  const shipped = JSON.parse(
    await readFile(".github/known-source-gaps.json", "utf8"),
  ) as KnownSourceGaps;
  assert.equal(shipped.version, 2, "baseline schema version must match the reader");

  const entries: Array<[string, CoverageBaseline]> = [
    ["intelligence.sourcesSucceeded", shipped.datasets.intelligence.sourcesSucceeded],
    ["intelligence.published", shipped.datasets.intelligence.published],
    ["blog.sourcesSucceeded", shipped.datasets.blog.sourcesSucceeded],
    ["blog.published", shipped.datasets.blog.published],
    ["commodity.trustedRecords", shipped.datasets.commodity.trustedRecords],
  ];
  for (const [label, entry] of entries) {
    assert(
      Number.isInteger(entry?.observed) && Number.isInteger(entry?.floor),
      `${label} must declare integer observed and floor values`,
    );
    assert(
      entry.floor <= entry.observed,
      `${label} floor must not exceed the observed level`,
    );
    assert(entry.floor >= 0, `${label} floor must not be negative`);
  }
  assert(
    Number.isInteger(shipped.datasets.commodity.expectedTotal) &&
      shipped.datasets.commodity.expectedTotal > 0,
    "commodity.expectedTotal must be a positive integer",
  );

  // The shipped baseline must still describe today's known gaps, so a green run
  // can never be mistaken for full coverage.
  const currentActuals: CoverageActuals = {
    intelligence: { sourcesSucceeded: 4, published: 7 },
    blog: { sourcesSucceeded: 4, published: 6 },
    commodity: { trustedRecords: 5, expectedTotal: 5 },
  };
  const result = evaluateEnforcement(allStepsSucceeded, currentActuals, shipped);
  assert.equal(result.status, "degraded");
  assert.equal(result.liveQualityRequired, false);
  assert.deepEqual(result.regressions, []);
}

Promise.all([
  verifyWorkflowWiring(),
  verifyReportAndFailure(),
  verifyShippedBaseline(),
])
  .then(() => {
    console.log(
      "Workflow enforcement fixtures passed (degraded gaps, variance headroom, undefined variable, regression, recovery, unverifiable report, live-gate escalation, commit ordering, shipped baseline).",
    );
  })
  .catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error);
  });
