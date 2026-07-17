import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";

const REQUIRED_DATASETS = [
  "intelligence",
  "blog",
  "country-score",
  "commodity",
] as const;
const REQUIRED_RECORD_COUNTS: Partial<
  Record<(typeof REQUIRED_DATASETS)[number], number>
> = {
  "country-score": 54,
  commodity: 5,
};
const REQUIRED_IDENTITIES: Partial<
  Record<(typeof REQUIRED_DATASETS)[number], readonly string[]>
> = {
  "country-score": AFRICAN_ISO3_CODES,
  commodity: COMMODITY_IDS,
};
const DEFAULT_MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

interface DatasetReport {
  currentCount?: number;
  comparableCount?: number;
  trustedCount?: number;
  matchedCount?: number;
  freshCount?: number;
  currentIdentityCount?: number;
  trustedIdentityCount?: number;
  matchedIdentityCount?: number;
  freshMatchedIdentityCount?: number;
  freshRowCount?: number;
  duplicateTrustedRowCount?: number;
  coverageRate?: number;
  freshnessRate?: number;
  rejectionRate?: number;
  thresholdsPassed?: boolean;
  identity?: {
    schemaVersion?: number;
    currentIdentities?: unknown;
    trustedIdentities?: unknown;
    matchedIdentities?: unknown;
    freshMatchedIdentities?: unknown;
    staleMatchedIdentities?: unknown;
    requiredIdentities?: unknown;
    missingCurrentIdentities?: unknown;
    missingTrustedIdentities?: unknown;
    missingFreshIdentities?: unknown;
    unexpectedCurrentIdentities?: unknown;
    requirementsSatisfied?: boolean;
  };
}

interface ShadowReport {
  version?: number;
  identitySchemaVersion?: number;
  mode?: string;
  generatedAt?: string;
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

function identityArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    return null;
  }
  const sorted = [...value].sort();
  if (
    new Set(sorted).size !== sorted.length ||
    sorted.some((item, index) => item !== value[index])
  ) {
    return null;
  }
  return sorted;
}

function sameIdentities(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function difference(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function validateIdentities(
  name: (typeof REQUIRED_DATASETS)[number],
  dataset: DatasetReport,
): string[] {
  const identity = dataset.identity;
  if (!identity || identity.schemaVersion !== 1) {
    return [`${name}: identity-aware metrics version 1 are required`];
  }
  const fields = {
    current: identityArray(identity.currentIdentities),
    trusted: identityArray(identity.trustedIdentities),
    matched: identityArray(identity.matchedIdentities),
    freshMatched: identityArray(identity.freshMatchedIdentities),
    staleMatched: identityArray(identity.staleMatchedIdentities),
    required: identityArray(identity.requiredIdentities),
    missingCurrent: identityArray(identity.missingCurrentIdentities),
    missingTrusted: identityArray(identity.missingTrustedIdentities),
    missingFresh: identityArray(identity.missingFreshIdentities),
    unexpectedCurrent: identityArray(identity.unexpectedCurrentIdentities),
  };
  if (Object.values(fields).some((value) => value === null)) {
    return [`${name}: identity lists must be sorted, unique string arrays`];
  }
  const {
    current,
    trusted,
    matched,
    freshMatched,
    staleMatched,
    required,
    missingCurrent,
    missingTrusted,
    missingFresh,
    unexpectedCurrent,
  } = fields as Record<keyof typeof fields, string[]>;
  const failures: string[] = [];
  if (
    difference(matched, current).length > 0 ||
    difference(matched, trusted).length > 0
  ) {
    failures.push(`${name}: matched identities are not current and trusted`);
  }
  if (difference(freshMatched, matched).length > 0) {
    failures.push(`${name}: fresh identities are not matched identities`);
  }
  if (!sameIdentities(staleMatched, difference(matched, freshMatched))) {
    failures.push(`${name}: stale identity details are inconsistent`);
  }
  for (const [reported, calculated, label] of [
    [dataset.comparableCount, current.length, "comparable count"],
    [dataset.currentIdentityCount, current.length, "current identity count"],
    [dataset.trustedIdentityCount, trusted.length, "trusted identity count"],
    [dataset.matchedCount, matched.length, "matched count"],
    [dataset.matchedIdentityCount, matched.length, "matched identity count"],
    [dataset.freshCount, freshMatched.length, "fresh count"],
    [
      dataset.freshMatchedIdentityCount,
      freshMatched.length,
      "fresh matched identity count",
    ],
  ] as const) {
    if (reported !== calculated) {
      failures.push(`${name}: ${label} does not match identity details`);
    }
  }
  if (
    !positiveInteger(dataset.trustedCount) ||
    !positiveInteger(dataset.freshRowCount) ||
    typeof dataset.duplicateTrustedRowCount !== "number" ||
    dataset.duplicateTrustedRowCount !==
      dataset.trustedCount - trusted.length ||
    dataset.freshRowCount < freshMatched.length
  ) {
    failures.push(`${name}: raw-row and distinct-identity counts conflict`);
  }
  const coverageRate = Number(
    (current.length === 0 ? 0 : matched.length / current.length).toFixed(4),
  );
  const freshnessRate = Number(
    (current.length === 0 ? 0 : freshMatched.length / current.length).toFixed(4),
  );
  if (
    dataset.coverageRate !== coverageRate ||
    dataset.freshnessRate !== freshnessRate
  ) {
    failures.push(`${name}: rates do not match distinct current identities`);
  }

  const expectedRequired = [...(REQUIRED_IDENTITIES[name] ?? [])].sort();
  const expectedMissingCurrent = difference(expectedRequired, current);
  const expectedMissingTrusted = difference(expectedRequired, trusted);
  const expectedMissingFresh = difference(expectedRequired, freshMatched);
  const expectedUnexpectedCurrent =
    expectedRequired.length > 0 ? difference(current, expectedRequired) : [];
  if (
    !sameIdentities(required, expectedRequired) ||
    !sameIdentities(missingCurrent, expectedMissingCurrent) ||
    !sameIdentities(missingTrusted, expectedMissingTrusted) ||
    !sameIdentities(missingFresh, expectedMissingFresh) ||
    !sameIdentities(unexpectedCurrent, expectedUnexpectedCurrent)
  ) {
    failures.push(`${name}: required identity details are inconsistent`);
  }
  if (expectedRequired.length > 0) {
    if (
      !sameIdentities(current, expectedRequired) ||
      !sameIdentities(matched, expectedRequired) ||
      !sameIdentities(freshMatched, expectedRequired) ||
      dataset.currentCount !== expectedRequired.length ||
      identity.requirementsSatisfied !== true
    ) {
      failures.push(`${name}: complete fresh required identity set is missing`);
    }
  } else if (
    required.length > 0 ||
    missingCurrent.length > 0 ||
    missingTrusted.length > 0 ||
    missingFresh.length > 0 ||
    unexpectedCurrent.length > 0 ||
    identity.requirementsSatisfied !== true
  ) {
    failures.push(`${name}: identity requirement state is inconsistent`);
  }
  return failures;
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
  const requiredRecords = REQUIRED_RECORD_COUNTS[name];
  if (
    requiredRecords &&
    [
      dataset.currentCount,
      dataset.comparableCount,
      dataset.trustedCount,
      dataset.matchedCount,
      dataset.freshCount,
    ].some((value) => (value ?? 0) < requiredRecords)
  ) {
    failures.push(
      `${name}: requires at least ${requiredRecords} current, trusted, matched, and fresh records`,
    );
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
  failures.push(...validateIdentities(name, dataset));
  return failures;
}

export function validatePromotionReport(
  report: ShadowReport,
  {
    now = new Date(),
    maxReportAgeMs = DEFAULT_MAX_REPORT_AGE_MS,
  }: { now?: Date; maxReportAgeMs?: number } = {},
): void {
  if (report.version !== 3 || report.identitySchemaVersion !== 1) {
    throw new Error(
      "Promotion blocked: identity-aware shadow report version 3 is required; older reports fail closed.",
    );
  }
  if (report.mode !== "live-shadow") {
    throw new Error(
      `Promotion blocked: report mode must be live-shadow; received ${String(report.mode)}.`,
    );
  }
  const generatedAt = Date.parse(report.generatedAt ?? "");
  const reportAgeMs = now.getTime() - generatedAt;
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(maxReportAgeMs) ||
    maxReportAgeMs <= 0 ||
    reportAgeMs < -MAX_FUTURE_SKEW_MS ||
    reportAgeMs > maxReportAgeMs
  ) {
    throw new Error(
      "Promotion blocked: live shadow report timestamp is missing, stale, or in the future.",
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

async function main(): Promise<void> {
  const reportPath = resolve(
    argument("--report", "quality-reports/trust-shadow-report.json"),
  );
  const report = JSON.parse(
    await readFile(reportPath, "utf8"),
  ) as ShadowReport;
  const maxReportAgeHours = Number(argument("--max-report-age-hours", "24"));
  if (!Number.isFinite(maxReportAgeHours) || maxReportAgeHours <= 0) {
    throw new Error("--max-report-age-hours must be a positive number.");
  }
  validatePromotionReport(report, {
    maxReportAgeMs: maxReportAgeHours * 60 * 60 * 1_000,
  });
}

if (
  process.argv[1] &&
  basename(process.argv[1]) === "trust-promotion-check.ts"
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Promotion report is invalid.",
    );
    process.exitCode = 1;
  });
}
