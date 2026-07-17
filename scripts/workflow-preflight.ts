import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export const DEFAULT_QUALITY_BASE_URL = "https://axis-mocha.vercel.app";
export const DEFAULT_QUALITY_PUBLICATION_MODE = "shadow";

const REQUIRED_CONFIGURATION = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FIRECRAWL_API_KEY",
] as const;

const FOUNDRY_CONFIGURATION = [
  "FOUNDRY_API_KEY",
  "FOUNDRY_ENDPOINT",
  "FOUNDRY_MODEL",
] as const;

type ConfigurationStatus = "available" | "missing";
type FoundryStatus = "available" | "degraded_missing" | "degraded_partial";
type Environment = Readonly<Record<string, string | undefined>>;

interface ConfigurationEntry {
  name: string;
  status: ConfigurationStatus;
}

export interface WorkflowPreflightReport {
  schemaVersion: 1;
  status: "ready" | "failed";
  required: ConfigurationEntry[];
  optional: ConfigurationEntry[];
  capabilities: {
    foundry: FoundryStatus;
    metadataEnrichment: "run" | "skip";
  };
  quality: {
    baseUrl: { status: "available"; source: "configured" | "safe_default" };
    publicationMode: {
      status: "available";
      source: "configured" | "safe_default";
    };
  };
}

function isAvailable(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function entries(
  names: readonly string[],
  environment: Environment,
): ConfigurationEntry[] {
  return names.map((name) => ({
    name,
    status: isAvailable(environment[name]) ? "available" : "missing",
  }));
}

export function resolveQualityConfiguration(environment: Environment): {
  baseUrl: string;
  publicationMode: string;
} {
  return {
    baseUrl:
      environment.QUALITY_BASE_URL?.trim() || DEFAULT_QUALITY_BASE_URL,
    publicationMode:
      environment.QUALITY_PUBLICATION_MODE?.trim() ||
      DEFAULT_QUALITY_PUBLICATION_MODE,
  };
}

export function evaluateWorkflowPreflight(
  environment: Environment,
): WorkflowPreflightReport {
  const required = entries(REQUIRED_CONFIGURATION, environment);
  const optional = entries(FOUNDRY_CONFIGURATION, environment);
  const foundryAvailable = optional.filter(
    ({ status }) => status === "available",
  ).length;
  const foundry: FoundryStatus =
    foundryAvailable === optional.length
      ? "available"
      : foundryAvailable === 0
        ? "degraded_missing"
        : "degraded_partial";

  return {
    schemaVersion: 1,
    status: required.some(({ status }) => status === "missing")
      ? "failed"
      : "ready",
    required,
    optional,
    capabilities: {
      foundry,
      metadataEnrichment: foundry === "available" ? "run" : "skip",
    },
    quality: {
      baseUrl: {
        status: "available",
        source: isAvailable(environment.QUALITY_BASE_URL)
          ? "configured"
          : "safe_default",
      },
      publicationMode: {
        status: "available",
        source: isAvailable(environment.QUALITY_PUBLICATION_MODE)
          ? "configured"
          : "safe_default",
      },
    },
  };
}

export function formatWorkflowPreflight(
  report: WorkflowPreflightReport,
): string[] {
  const lines = [
    ...report.required.map(
      ({ name, status }) => `required ${name}: ${status}`,
    ),
    ...report.optional.map(
      ({ name, status }) => `optional ${name}: ${status}`,
    ),
    `optional FOUNDRY_CAPABILITY: ${report.capabilities.foundry}`,
    `optional METADATA_ENRICHMENT: ${report.capabilities.metadataEnrichment}`,
    `quality QUALITY_BASE_URL: ${report.quality.baseUrl.status} (${report.quality.baseUrl.source})`,
    `quality QUALITY_PUBLICATION_MODE: ${report.quality.publicationMode.status} (${report.quality.publicationMode.source})`,
    `preflight WORKFLOW_CONFIGURATION: ${report.status}`,
  ];

  return lines;
}

async function writeOutputs(
  report: WorkflowPreflightReport,
  environment: Environment,
): Promise<void> {
  const outputPath = environment.GITHUB_OUTPUT;
  if (!outputPath) return;

  const outputs = [
    `foundry_available=${report.capabilities.foundry === "available"}`,
    `foundry_status=${report.capabilities.foundry}`,
    `metadata_enrichment=${report.capabilities.metadataEnrichment}`,
  ];
  await appendFile(outputPath, `${outputs.join("\n")}\n`, "utf8");
}

export async function runWorkflowPreflight(
  environment: Environment = process.env,
): Promise<WorkflowPreflightReport> {
  const report = evaluateWorkflowPreflight(environment);
  const reportPath = resolve(
    environment.WORKFLOW_PREFLIGHT_REPORT ||
      "quality-reports/workflow-preflight.json",
  );

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeOutputs(report, environment);

  for (const line of formatWorkflowPreflight(report)) console.log(line);

  if (report.status === "failed") {
    throw new Error("Workflow preflight failed: required configuration missing.");
  }

  return report;
}

if (process.argv[1] && basename(process.argv[1]) === "workflow-preflight.ts") {
  runWorkflowPreflight().catch((error: unknown) => {
    process.exitCode = 1;
    console.error(
      error instanceof Error ? error.message : "Workflow preflight failed.",
    );
  });
}
