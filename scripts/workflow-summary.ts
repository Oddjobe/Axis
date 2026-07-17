import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export type WorkflowStepOutcome =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped";

type Environment = Readonly<Record<string, string | undefined>>;

const REQUIRED_STEPS = [
  "preflight",
  "shadowIngestion",
  "scoreRefresh",
  "dataQuality",
  "liveQuality",
] as const;

export interface WorkflowSummaryReport {
  schemaVersion: 2;
  status: "success" | "degraded" | "failed";
  steps: Record<(typeof REQUIRED_STEPS)[number], WorkflowStepOutcome>;
  optional: {
    foundry: "available" | "degraded_missing" | "degraded_partial";
    metadataEnrichment: "success" | "skipped" | "failure";
  };
  commodityHistory: {
    status: "loaded" | "bootstrap" | "failed" | "unknown";
    bootstrap: boolean;
    historyUnavailable: boolean;
    loadedIdentityCount: number;
    latestSourcePublishedAt: string | null;
    latestPublishedAt: string | null;
  };
  scorePromotion: "published" | "retained" | "unknown";
  failedRequiredSteps: string[];
}

function outcome(
  value: string | undefined,
  fallback: WorkflowStepOutcome = "skipped",
): WorkflowStepOutcome {
  return ["success", "failure", "cancelled", "skipped"].includes(value ?? "")
    ? (value as WorkflowStepOutcome)
    : fallback;
}

function timestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function evaluateWorkflowSummary(
  environment: Environment,
): WorkflowSummaryReport {
  const steps = {
    preflight: outcome(environment.PREFLIGHT_OUTCOME),
    shadowIngestion: outcome(environment.SHADOW_INGESTION_OUTCOME),
    scoreRefresh: outcome(environment.SCORE_REFRESH_OUTCOME),
    dataQuality: outcome(environment.DATA_QUALITY_OUTCOME),
    liveQuality: outcome(environment.LIVE_QUALITY_OUTCOME),
  };
  const failedRequiredSteps = REQUIRED_STEPS.filter(
    (step) => steps[step] !== "success",
  ) as string[];
  const foundry = ["available", "degraded_missing", "degraded_partial"].includes(
    environment.FOUNDRY_STATUS ?? "",
  )
    ? (environment.FOUNDRY_STATUS as WorkflowSummaryReport["optional"]["foundry"])
    : "degraded_missing";
  const metadataEnrichment =
    outcome(environment.METADATA_OUTCOME) === "success"
      ? "success"
      : outcome(environment.METADATA_OUTCOME) === "failure"
        ? "failure"
        : "skipped";
  const scorePromotion = ["published", "retained"].includes(
    environment.SCORE_PROMOTION_STATUS ?? "",
  )
    ? (environment.SCORE_PROMOTION_STATUS as
        | "published"
        | "retained")
    : "unknown";
  const commodityHistoryStatus = ["loaded", "bootstrap", "failed"].includes(
    environment.COMMODITY_HISTORY_STATUS ?? "",
  )
    ? (environment.COMMODITY_HISTORY_STATUS as
        | "loaded"
        | "bootstrap"
        | "failed")
    : "unknown";
  const commodityHistory: WorkflowSummaryReport["commodityHistory"] = {
    status: commodityHistoryStatus,
    bootstrap:
      commodityHistoryStatus === "bootstrap" ||
      environment.COMMODITY_HISTORY_BOOTSTRAP === "true",
    historyUnavailable:
      commodityHistoryStatus !== "loaded" ||
      environment.COMMODITY_HISTORY_UNAVAILABLE === "true",
    loadedIdentityCount: Math.max(
      0,
      Number.parseInt(environment.COMMODITY_HISTORY_LOADED_COUNT ?? "0", 10) ||
        0,
    ),
    latestSourcePublishedAt: timestamp(
      environment.COMMODITY_HISTORY_LATEST_SOURCE_PUBLISHED_AT,
    ),
    latestPublishedAt: timestamp(
      environment.COMMODITY_HISTORY_LATEST_PUBLISHED_AT,
    ),
  };
  if (
    commodityHistory.status === "failed" &&
    !failedRequiredSteps.includes("commodityHistory")
  ) {
    failedRequiredSteps.push("commodityHistory");
  }
  return {
    schemaVersion: 2,
    status:
      failedRequiredSteps.length > 0
        ? "failed"
        : foundry === "available" &&
            metadataEnrichment === "success" &&
            scorePromotion === "published" &&
            commodityHistory.status === "loaded"
          ? "success"
          : "degraded",
    steps,
    optional: { foundry, metadataEnrichment },
    commodityHistory,
    scorePromotion,
    failedRequiredSteps,
  };
}

export function formatWorkflowSummary(
  report: WorkflowSummaryReport,
): string {
  const rows = Object.entries(report.steps)
    .map(([step, status]) => `| ${step} | ${status} |`)
    .join("\n");
  return [
    "## AXIS ingestion workflow summary",
    "",
    `**Status:** ${report.status}`,
    "",
    "| Required step | Outcome |",
    "| --- | --- |",
    rows,
    "",
    `Trusted score promotion: ${report.scorePromotion}.`,
    "",
    `Commodity history: ${report.commodityHistory.status}; bootstrap=${report.commodityHistory.bootstrap}; historyUnavailable=${report.commodityHistory.historyUnavailable}; loaded identities=${report.commodityHistory.loadedIdentityCount}; latest source=${report.commodityHistory.latestSourcePublishedAt ?? "none"}; latest approval=${report.commodityHistory.latestPublishedAt ?? "none"}.`,
    "",
    `Foundry: ${report.optional.foundry}; metadata enrichment: ${report.optional.metadataEnrichment}.`,
    "",
  ].join("\n");
}

export async function writeWorkflowSummary(
  environment: Environment = process.env,
): Promise<WorkflowSummaryReport> {
  const report = evaluateWorkflowSummary(environment);
  const reportPath = resolve(
    environment.WORKFLOW_SUMMARY_REPORT ??
      "quality-reports/workflow-summary.json",
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (environment.GITHUB_STEP_SUMMARY) {
    await appendFile(
      environment.GITHUB_STEP_SUMMARY,
      formatWorkflowSummary(report),
      "utf8",
    );
  }
  console.log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && basename(process.argv[1]) === "workflow-summary.ts") {
  writeWorkflowSummary().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Workflow summary failed.",
    );
    process.exitCode = 1;
  });
}
