import { readFile } from "node:fs/promises";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Steps that prove the runner, credentials, schema, and deterministic checks are
 * intact. These can never be excused by a documented source gap.
 */
export const REQUIRED_STEP_VARIABLES = [
  "PREFLIGHT_OUTCOME",
  "KPI_REFRESH_OUTCOME",
  "TRUST_READINESS_OUTCOME",
  "SOURCE_SAFETY_OUTCOME",
  "SCORE_REFRESH_OUTCOME",
  "DATA_QUALITY_OUTCOME",
] as const;

export interface CoverageBaseline {
  observed: number;
  floor: number;
}

export interface KnownSourceGaps {
  version: 2;
  acceptedAt: string;
  datasets: {
    intelligence: {
      sourcesSucceeded: CoverageBaseline;
      published: CoverageBaseline;
    };
    blog: {
      sourcesSucceeded: CoverageBaseline;
      published: CoverageBaseline;
    };
    commodity: {
      trustedRecords: CoverageBaseline;
      expectedTotal: number;
    };
  };
}

export interface CoverageActuals {
  intelligence: { sourcesSucceeded: number; published: number };
  blog: { sourcesSucceeded: number; published: number };
  commodity: { trustedRecords: number; expectedTotal: number };
}

export interface EnforcementResult {
  schemaVersion: 1;
  status: "pass" | "degraded" | "failed";
  hardFailures: string[];
  regressions: string[];
  improvements: string[];
  openGaps: string[];
  fullCoverage: boolean;
  liveQualityRequired: boolean;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function section(report: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = report[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Reads observed coverage from the ingestion report. Returns null when the report
 * cannot prove coverage, which is treated as a hard failure rather than an
 * excusable gap: an unverifiable run must never pass silently.
 */
export function readCoverageActuals(report: unknown): CoverageActuals | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const root = report as Record<string, unknown>;
  const intelligence = section(root, "intelligence");
  const blog = section(root, "blog");
  const commodityCoverage = section(section(root, "commodity"), "trustedCoverage");

  const values = {
    intelligenceSources: integer(intelligence.sourcesSucceeded),
    intelligencePublished: integer(intelligence.published),
    blogSources: integer(blog.sourcesSucceeded),
    blogPublished: integer(blog.published),
    commodityRecords: integer(commodityCoverage.records),
    commodityTotal: integer(commodityCoverage.total),
  };
  if (Object.values(values).some((value) => value === null)) return null;

  return {
    intelligence: {
      sourcesSucceeded: values.intelligenceSources!,
      published: values.intelligencePublished!,
    },
    blog: {
      sourcesSucceeded: values.blogSources!,
      published: values.blogPublished!,
    },
    commodity: {
      trustedRecords: values.commodityRecords!,
      expectedTotal: values.commodityTotal!,
    },
  };
}

interface Metric {
  label: string;
  actual: number;
  baseline: CoverageBaseline;
}

function metrics(
  actuals: CoverageActuals,
  baseline: KnownSourceGaps,
): Metric[] {
  return [
    {
      label: "intelligence.sourcesSucceeded",
      actual: actuals.intelligence.sourcesSucceeded,
      baseline: baseline.datasets.intelligence.sourcesSucceeded,
    },
    {
      label: "intelligence.published",
      actual: actuals.intelligence.published,
      baseline: baseline.datasets.intelligence.published,
    },
    {
      label: "blog.sourcesSucceeded",
      actual: actuals.blog.sourcesSucceeded,
      baseline: baseline.datasets.blog.sourcesSucceeded,
    },
    {
      label: "blog.published",
      actual: actuals.blog.published,
      baseline: baseline.datasets.blog.published,
    },
    {
      label: "commodity.trustedRecords",
      actual: actuals.commodity.trustedRecords,
      baseline: baseline.datasets.commodity.trustedRecords,
    },
  ];
}

/**
 * Full coverage means the accepted baseline no longer excuses any missing data.
 * Only then is the live post-write quality gate mandatory again, so the workflow
 * automatically becomes stricter as gaps close.
 */
function describeOpenGaps(baseline: KnownSourceGaps): string[] {
  const gaps: string[] = [];
  if (baseline.datasets.intelligence.published.observed <= 0) {
    gaps.push("intelligence: no source currently yields publishable records");
  }
  if (baseline.datasets.blog.published.observed <= 0) {
    gaps.push("blog: no source currently yields publishable dated evidence");
  }
  const { trustedRecords, expectedTotal } = baseline.datasets.commodity;
  if (trustedRecords.observed < expectedTotal) {
    gaps.push(
      `commodity: only ${trustedRecords.observed}/${expectedTotal} identities have admissible current quotes`,
    );
  }
  return gaps;
}

export function evaluateEnforcement(
  environment: Environment,
  actuals: CoverageActuals | null,
  baseline: KnownSourceGaps,
): EnforcementResult {
  const hardFailures = REQUIRED_STEP_VARIABLES.filter(
    (name) => environment[name] !== "success",
  ).map((name) => `${name}=${environment[name] || "undefined"}`);

  const openGaps = describeOpenGaps(baseline);
  const fullCoverage = openGaps.length === 0;
  const liveQualityRequired = fullCoverage;

  if (!actuals) {
    hardFailures.push(
      "coverage=unverifiable (ingestion report missing or malformed)",
    );
  }

  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const metric of actuals ? metrics(actuals, baseline) : []) {
    if (metric.actual < metric.baseline.floor) {
      regressions.push(
        `${metric.label} fell to ${metric.actual}, below the accepted floor of ${metric.baseline.floor}`,
      );
    } else if (metric.actual > metric.baseline.observed) {
      improvements.push(
        `${metric.label} reached ${metric.actual}, above the accepted level of ${metric.baseline.observed}`,
      );
    }
  }

  if (liveQualityRequired && environment.LIVE_QUALITY_OUTCOME !== "success") {
    hardFailures.push(
      `LIVE_QUALITY_OUTCOME=${environment.LIVE_QUALITY_OUTCOME || "undefined"} (required once every gap is closed)`,
    );
  }

  const status: EnforcementResult["status"] =
    hardFailures.length > 0 || regressions.length > 0
      ? "failed"
      : openGaps.length > 0
        ? "degraded"
        : "pass";

  return {
    schemaVersion: 1,
    status,
    hardFailures,
    regressions,
    improvements,
    openGaps,
    fullCoverage,
    liveQualityRequired,
  };
}

export function formatEnforcement(result: EnforcementResult): string[] {
  const lines = [`enforcement status: ${result.status}`];
  for (const failure of result.hardFailures) {
    lines.push(`required check failed: ${failure}`);
  }
  for (const regression of result.regressions) {
    lines.push(`coverage regression: ${regression}`);
  }
  for (const improvement of result.improvements) {
    lines.push(
      `coverage improved, raise the baseline in .github/known-source-gaps.json: ${improvement}`,
    );
  }
  for (const gap of result.openGaps) {
    lines.push(`accepted gap still open: ${gap}`);
  }
  return lines;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    return null;
  }
}

export async function runWorkflowEnforcement(
  environment: Environment = process.env,
): Promise<EnforcementResult> {
  const baseline = (await readJson(
    environment.KNOWN_SOURCE_GAPS ?? ".github/known-source-gaps.json",
  )) as KnownSourceGaps | null;
  if (!baseline?.datasets) {
    throw new Error(
      "The known-source-gaps baseline is missing or malformed; coverage cannot be verified.",
    );
  }
  const actuals = readCoverageActuals(
    await readJson(
      environment.SHADOW_INGESTION_REPORT ??
        "quality-reports/shadow-ingestion-report.json",
    ),
  );
  const result = evaluateEnforcement(environment, actuals, baseline);

  const reportPath = resolve(
    environment.WORKFLOW_ENFORCEMENT_REPORT ??
      "quality-reports/workflow-enforcement.json",
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const lines = formatEnforcement(result);
  for (const line of lines) console.log(line);

  if (environment.GITHUB_STEP_SUMMARY) {
    await appendFile(
      environment.GITHUB_STEP_SUMMARY,
      ["", "## Coverage enforcement", "", ...lines.map((line) => `- ${line}`), ""].join(
        "\n",
      ),
      "utf8",
    );
  }

  if (result.status === "failed") {
    throw new Error(
      "Workflow enforcement failed: a required check broke or coverage regressed below the accepted baseline.",
    );
  }
  return result;
}

if (process.argv[1] && basename(process.argv[1]) === "workflow-enforce.ts") {
  runWorkflowEnforcement().catch((error: unknown) => {
    process.exitCode = 1;
    console.error(
      error instanceof Error ? error.message : "Workflow enforcement failed.",
    );
  });
}
