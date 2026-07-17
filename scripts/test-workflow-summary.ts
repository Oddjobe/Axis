import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";

import {
  evaluateWorkflowSummary,
  formatWorkflowSummary,
  writeWorkflowSummary,
} from "./workflow-summary";

const complete = {
  PREFLIGHT_OUTCOME: "success",
  SHADOW_INGESTION_OUTCOME: "success",
  SCORE_REFRESH_OUTCOME: "success",
  DATA_QUALITY_OUTCOME: "success",
  LIVE_QUALITY_OUTCOME: "success",
  FOUNDRY_STATUS: "available",
  METADATA_OUTCOME: "success",
  SCORE_PROMOTION_STATUS: "published",
  COMMODITY_HISTORY_STATUS: "loaded",
  COMMODITY_HISTORY_BOOTSTRAP: "false",
  COMMODITY_HISTORY_UNAVAILABLE: "false",
  COMMODITY_HISTORY_LOADED_COUNT: "5",
  COMMODITY_HISTORY_LATEST_SOURCE_PUBLISHED_AT:
    "2026-07-16T10:00:00.000Z",
  COMMODITY_HISTORY_LATEST_PUBLISHED_AT: "2026-07-16T12:00:00.000Z",
};

const successful = evaluateWorkflowSummary(complete);
assert.equal(successful.status, "success");
assert.deepEqual(successful.failedRequiredSteps, []);

const degraded = evaluateWorkflowSummary({
  ...complete,
  FOUNDRY_STATUS: "degraded_missing",
  METADATA_OUTCOME: "skipped",
  SCORE_PROMOTION_STATUS: "retained",
});
assert.equal(degraded.status, "degraded");
assert.deepEqual(degraded.failedRequiredSteps, []);
assert.equal(degraded.scorePromotion, "retained");

const bootstrap = evaluateWorkflowSummary({
  ...complete,
  COMMODITY_HISTORY_STATUS: "bootstrap",
  COMMODITY_HISTORY_BOOTSTRAP: "true",
  COMMODITY_HISTORY_UNAVAILABLE: "true",
  COMMODITY_HISTORY_LOADED_COUNT: "0",
  COMMODITY_HISTORY_LATEST_SOURCE_PUBLISHED_AT: "",
  COMMODITY_HISTORY_LATEST_PUBLISHED_AT: "",
});
assert.equal(bootstrap.status, "degraded");
assert.deepEqual(bootstrap.commodityHistory, {
  status: "bootstrap",
  bootstrap: true,
  historyUnavailable: true,
  loadedIdentityCount: 0,
  latestSourcePublishedAt: null,
  latestPublishedAt: null,
});

const historyFailed = evaluateWorkflowSummary({
  ...complete,
  COMMODITY_HISTORY_STATUS: "failed",
  COMMODITY_HISTORY_UNAVAILABLE: "true",
});
assert.equal(historyFailed.status, "failed");
assert(historyFailed.failedRequiredSteps.includes("commodityHistory"));

const failed = evaluateWorkflowSummary({
  ...complete,
  SHADOW_INGESTION_OUTCOME: "failure",
  LIVE_QUALITY_OUTCOME: "skipped",
});
assert.equal(failed.status, "failed");
assert.deepEqual(failed.failedRequiredSteps, [
  "shadowIngestion",
  "liveQuality",
]);
assert(!JSON.stringify(failed).includes("secret"));

const markdown = formatWorkflowSummary(degraded);
assert.match(markdown, /Status:\*\* degraded/);
assert.match(markdown, /\| shadowIngestion \| success \|/);
assert.match(markdown, /Trusted score promotion: retained/);
assert.match(formatWorkflowSummary(bootstrap), /historyUnavailable=true/);

async function main(): Promise<void> {
  const reportPath = "quality-reports/fixtures/workflow-summary-test.json";
  const markdownPath = "quality-reports/fixtures/workflow-summary-test.md";
  try {
    await writeWorkflowSummary({
      ...complete,
      WORKFLOW_SUMMARY_REPORT: reportPath,
      GITHUB_STEP_SUMMARY: markdownPath,
    });
    assert.equal(
      JSON.parse(await readFile(reportPath, "utf8")).status,
      "success",
    );
    assert.match(await readFile(markdownPath, "utf8"), /workflow summary/);
  } finally {
    await Promise.all([
      rm(reportPath, { force: true }),
      rm(markdownPath, { force: true }),
    ]);
  }

  console.log(
    "Workflow summary fixtures passed (success, optional degradation, required failure, report and job summary).",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
