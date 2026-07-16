import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_DATASETS = [
  "intelligence",
  "blog",
  "country-score",
  "commodity",
] as const;

interface DatasetReport {
  currentCount?: number;
  comparableCount?: number;
  trustedCount?: number;
  matchedCount?: number;
  freshCount?: number;
  coverageRate?: number;
  freshnessRate?: number;
  rejectionRate?: number;
  thresholdsPassed?: boolean;
}

interface ShadowReport {
  mode?: string;
  promotionEligible?: boolean;
  thresholdsPassed?: boolean;
  consecutiveSuccessfulRuns?: number;
  thresholds?: {
    minCoverage?: number;
    minFreshness?: number;
    maxRejection?: number;
    requiredRuns?: number;
  };
  byDataset?: Record<string, DatasetReport>;
  warnings?: unknown[];
}

function argument(name: string, fallback: string): string {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function validRate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateDataset(
  name: (typeof REQUIRED_DATASETS)[number],
  dataset: DatasetReport | undefined,
  thresholds: NonNullable<ShadowReport["thresholds"]>,
): string[] {
  if (!dataset) return [`${name}: result is missing`];
  const failures: string[] = [];
  for (const [label, value] of [
    ["current rows", dataset.currentCount],
    ["comparable rows", dataset.comparableCount],
    ["trusted rows", dataset.trustedCount],
    ["matched rows", dataset.matchedCount],
    ["fresh rows", dataset.freshCount],
  ] as const) {
    if (!positiveInteger(value)) failures.push(`${name}: ${label} must be nonzero`);
  }
  if (
    !validRate(dataset.coverageRate) ||
    dataset.coverageRate < thresholds.minCoverage!
  ) {
    failures.push(`${name}: coverage threshold failed`);
  }
  if (
    !validRate(dataset.freshnessRate) ||
    dataset.freshnessRate < thresholds.minFreshness!
  ) {
    failures.push(`${name}: freshness threshold failed`);
  }
  if (
    !validRate(dataset.rejectionRate) ||
    dataset.rejectionRate > thresholds.maxRejection!
  ) {
    failures.push(`${name}: rejection threshold failed`);
  }
  if (dataset.thresholdsPassed !== true) {
    failures.push(`${name}: dataset result is not marked successful`);
  }
  return failures;
}

async function main(): Promise<void> {
  const reportPath = resolve(
    argument("--report", "quality-reports/trust-shadow-report.json"),
  );
  const report = JSON.parse(
    await readFile(reportPath, "utf8"),
  ) as ShadowReport;
  if (report.mode !== "live-shadow") {
    throw new Error(
      `Promotion blocked: report mode must be live-shadow; received ${String(report.mode)}.`,
    );
  }

  const thresholds = report.thresholds;
  if (
    !thresholds ||
    !validRate(thresholds.minCoverage) ||
    !validRate(thresholds.minFreshness) ||
    !validRate(thresholds.maxRejection) ||
    !positiveInteger(thresholds.requiredRuns)
  ) {
    throw new Error("Promotion blocked: report thresholds are invalid.");
  }

  const datasetFailures = REQUIRED_DATASETS.flatMap((dataset) =>
    validateDataset(dataset, report.byDataset?.[dataset], thresholds),
  );
  const required = thresholds.requiredRuns;
  const consecutive = report.consecutiveSuccessfulRuns ?? 0;
  if (
    datasetFailures.length > 0 ||
    report.thresholdsPassed !== true ||
    report.promotionEligible !== true ||
    (report.warnings?.length ?? 0) > 0 ||
    consecutive < required
  ) {
    const detail =
      datasetFailures.length > 0
        ? ` ${datasetFailures.join("; ")}.`
        : "";
    throw new Error(
      `Promotion blocked: ${consecutive}/${required} consecutive successful live shadow runs.${detail}`,
    );
  }
  console.log(
    `Promotion approved by live shadow report: ${consecutive}/${required} consecutive successful runs; every required dataset passed independently.`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Promotion report is invalid.",
  );
  process.exitCode = 1;
});
