import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";

import fixtures from "./fixtures/workflow-preflight.json";
import {
  DEFAULT_QUALITY_BASE_URL,
  DEFAULT_QUALITY_PUBLICATION_MODE,
  evaluateWorkflowPreflight,
  formatWorkflowPreflight,
  resolveQualityConfiguration,
  runWorkflowPreflight,
} from "./workflow-preflight";

type FixtureEnvironment = Record<string, string>;

const complete = evaluateWorkflowPreflight(fixtures.complete);
assert.equal(complete.status, "ready");
assert.equal(complete.capabilities.foundry, "available");
assert.equal(complete.capabilities.metadataEnrichment, "run");

const missingRequired = evaluateWorkflowPreflight(fixtures.missingRequired);
assert.equal(missingRequired.status, "failed");
assert.deepEqual(
  missingRequired.required
    .filter(({ status }) => status === "missing")
    .map(({ name }) => name),
  ["SUPABASE_SERVICE_ROLE_KEY", "FIRECRAWL_API_KEY"],
);

const missingFoundry = evaluateWorkflowPreflight(fixtures.missingFoundry);
assert.equal(missingFoundry.status, "ready");
assert.equal(missingFoundry.capabilities.foundry, "degraded_missing");
assert.equal(missingFoundry.capabilities.metadataEnrichment, "skip");

const partialFoundry = evaluateWorkflowPreflight(fixtures.partialFoundry);
assert.equal(partialFoundry.status, "ready");
assert.equal(partialFoundry.capabilities.foundry, "degraded_partial");
assert.equal(partialFoundry.capabilities.metadataEnrichment, "skip");

const safeQuality = resolveQualityConfiguration({});
assert.equal(safeQuality.baseUrl, DEFAULT_QUALITY_BASE_URL);
assert.equal(safeQuality.publicationMode, DEFAULT_QUALITY_PUBLICATION_MODE);
assert.notEqual(safeQuality.publicationMode, "trusted");
assert.notEqual(safeQuality.publicationMode, "enforce");

const configuredQuality = resolveQualityConfiguration({
  QUALITY_BASE_URL: "https://configured.example",
  QUALITY_PUBLICATION_MODE: "pre-promotion",
});
assert.equal(configuredQuality.baseUrl, "https://configured.example");
assert.equal(configuredQuality.publicationMode, "pre-promotion");

for (const environment of Object.values(fixtures) as FixtureEnvironment[]) {
  const output = [
    JSON.stringify(evaluateWorkflowPreflight(environment)),
    ...formatWorkflowPreflight(evaluateWorkflowPreflight(environment)),
  ].join("\n");
  for (const value of Object.values(environment).filter((item) => item.trim())) {
    assert.equal(output.includes(value), false, `preflight exposed ${value}`);
  }
}

async function verifyWorkflowWiring(): Promise<void> {
  const workflow = await readFile(".github/workflows/scrape.yml", "utf8");
  assert.match(
    workflow,
    /QUALITY_BASE_URL: \$\{\{ vars\.QUALITY_BASE_URL \|\| 'https:\/\/axis-mocha\.vercel\.app' \}\}/,
  );
  assert.match(
    workflow,
    /Verify live post-write data quality[\s\S]*QUALITY_PUBLICATION_MODE: shadow/,
  );
  assert.doesNotMatch(
    workflow,
    /QUALITY_PUBLICATION_MODE: \$\{\{ vars\./,
  );
  assert.match(
    workflow,
    /if: steps\.preflight\.outputs\.foundry_available == 'true'/,
  );
  assert.match(
    workflow,
    /if: always\(\)[\s\S]*quality-reports\/workflow-preflight\.json[\s\S]*quality-reports\/trust-readiness\.json[\s\S]*quality-reports\/workflow-data-quality-report\.json[\s\S]*quality-reports\/workflow-summary\.json[\s\S]*quality-reports\/shadow-ingestion-report\.json[\s\S]*quality-reports\/score-readiness-report\.json/,
  );
  assert.match(
    workflow,
    /id: trust_readiness[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY:[\s\S]*npm run trust:readiness -- --compact > quality-reports\/trust-readiness\.json/,
  );
  const shadowIndex = workflow.indexOf(
    "Run intelligence, blog, and commodity shadow ingestion",
  );
  const kpiIndex = workflow.indexOf("Refresh legacy KPI metadata");
  const scoreIndex = workflow.indexOf(
    "Refresh legacy scores and report trusted readiness",
  );
  const summaryIndex = workflow.indexOf("Publish workflow summary");
  const artifactIndex = workflow.indexOf(
    "Upload workflow safety and quality reports",
  );
  const enforcementIndex = workflow.indexOf(
    "Enforce required workflow outcomes",
  );
  assert(kpiIndex > 0 && shadowIndex > kpiIndex && scoreIndex > shadowIndex);
  assert(summaryIndex > scoreIndex && artifactIndex > summaryIndex);
  assert(enforcementIndex > artifactIndex);
  assert.match(
    workflow,
    /id: shadow_ingestion[\s\S]*steps\.trust_readiness\.outcome == 'success'[\s\S]*continue-on-error: true[\s\S]*id: score_refresh[\s\S]*steps\.trust_readiness\.outcome == 'success'[\s\S]*continue-on-error: true/,
  );
  assert.match(
    workflow,
    /KPI_REFRESH_OUTCOME: \$\{\{ steps\.kpis\.outcome \}\}/,
  );
  assert.match(workflow, /"\$KPI_REFRESH_OUTCOME"/);
  assert.doesNotMatch(workflow, /trust:promotion-check|QUALITY_PUBLICATION_MODE: trusted/);
}

async function verifyRequiredFailure(): Promise<void> {
  const reportPath =
    "quality-reports/fixtures/workflow-preflight-test-output.json";
  try {
    await assert.rejects(
      runWorkflowPreflight({
        ...fixtures.missingRequired,
        WORKFLOW_PREFLIGHT_REPORT: reportPath,
      }),
      /required configuration missing/,
    );
    const savedReport = await readFile(reportPath, "utf8");
    assert.equal(JSON.parse(savedReport).status, "failed");
    for (const value of Object.values(fixtures.missingRequired).filter((item) =>
      item.trim(),
    )) {
      assert.equal(savedReport.includes(value), false);
    }
  } finally {
    await rm(reportPath, { force: true });
  }
}

Promise.all([verifyWorkflowWiring(), verifyRequiredFailure()])
  .then(() => {
    console.log(
      "Workflow preflight fixtures passed (redaction, required failure, Foundry degradation, safe defaults).",
    );
  })
  .catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error);
  });
