import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { validatePromotionReport } from "./trust-promotion-check";

// Produces a machine-readable production-activation verdict. It combines the
// authoritative live-shadow promotion gate (evaluated from the shadow report)
// with the operator-attested activation gates required before trusted
// publication may be enabled: configuration presence, additive-migration proof,
// current trusted snapshots, and a recorded rollback target.
//
// This script reads only. It never enables trusted publication, never writes to
// production data, and fails closed: activation is reported "eligible" only when
// every gate passes. Enabling the feature flag and redeploying remains a
// separate, explicit operator action (see docs/trust-activation-checklist.md).

export interface ActivationGate {
  id: string;
  label: string;
  status: "passed" | "blocked";
  attested: boolean;
  detail: string;
}

export interface ActivationReport {
  schemaVersion: 1;
  generatedAt: string;
  status: "eligible" | "blocked";
  reportPath: string | null;
  rollbackTarget: string | null;
  gates: ActivationGate[];
  blockingReasons: string[];
}

export interface ActivationInput {
  shadowReport: unknown;
  reportPath?: string | null;
  configVerified: boolean;
  migrationsVerified: boolean;
  snapshotsVerified: boolean;
  rollbackTarget: string | null;
  now?: Date;
  maxReportAgeMs?: number;
}

export function buildActivationReport(input: ActivationInput): ActivationReport {
  const now = input.now ?? new Date();
  const gates: ActivationGate[] = [];
  const blockingReasons: string[] = [];

  let promotionPassed = false;
  let promotionDetail =
    "Live shadow report satisfies thresholds, exact identity coverage, and the consecutive-run requirement.";
  try {
    validatePromotionReport(input.shadowReport as never, {
      now,
      maxReportAgeMs: input.maxReportAgeMs,
    });
    promotionPassed = true;
  } catch (error) {
    promotionDetail =
      error instanceof Error ? error.message : "Promotion report is invalid.";
  }
  gates.push({
    id: "shadow-promotion",
    label:
      "Three consecutive live-shadow passes with exact identity coverage and thresholds",
    status: promotionPassed ? "passed" : "blocked",
    attested: false,
    detail: promotionDetail,
  });
  if (!promotionPassed) blockingReasons.push(promotionDetail);

  const attestedGates: ReadonlyArray<
    readonly [id: string, label: string, satisfied: boolean]
  > = [
    [
      "configuration-presence",
      "Required Supabase and Firecrawl configuration verified present",
      input.configVerified,
    ],
    [
      "migration-proof",
      "Additive trust migrations verified applied in the production database",
      input.migrationsVerified,
    ],
    [
      "trusted-snapshots",
      "Current trusted snapshots verified for every required identity",
      input.snapshotsVerified,
    ],
  ];
  for (const [id, label, satisfied] of attestedGates) {
    gates.push({
      id,
      label,
      status: satisfied ? "passed" : "blocked",
      attested: true,
      detail: satisfied
        ? "Operator attestation recorded."
        : "Operator attestation missing.",
    });
    if (!satisfied) {
      blockingReasons.push(`${label}: operator attestation missing.`);
    }
  }

  const rollbackTarget = (input.rollbackTarget ?? "").trim();
  const rollbackRecorded = rollbackTarget.length > 0;
  gates.push({
    id: "rollback-target",
    label: "Recorded rollback target (pre-activation deployment or commit)",
    status: rollbackRecorded ? "passed" : "blocked",
    attested: true,
    detail: rollbackRecorded
      ? `Rollback target recorded: ${rollbackTarget}.`
      : "No rollback target recorded.",
  });
  if (!rollbackRecorded) {
    blockingReasons.push("Rollback target: no rollback target recorded.");
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    status: blockingReasons.length === 0 ? "eligible" : "blocked",
    reportPath: input.reportPath ?? null,
    rollbackTarget: rollbackRecorded ? rollbackTarget : null,
    gates,
    blockingReasons,
  };
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function argument(name: string, fallback: string): string {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const reportPath = resolve(
    argument("--report", "quality-reports/trust-shadow-report.json"),
  );
  const outPath = resolve(
    argument("--out", "quality-reports/trust-activation-report.json"),
  );
  const maxReportAgeHours = Number(argument("--max-report-age-hours", "24"));
  if (!Number.isFinite(maxReportAgeHours) || maxReportAgeHours <= 0) {
    throw new Error("--max-report-age-hours must be a positive number.");
  }

  const shadowReport = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  const report = buildActivationReport({
    shadowReport,
    reportPath,
    configVerified: flag("--config-verified"),
    migrationsVerified: flag("--migrations-verified"),
    snapshotsVerified: flag("--snapshots-verified"),
    rollbackTarget: argument("--rollback-target", ""),
    maxReportAgeMs: maxReportAgeHours * 60 * 60 * 1_000,
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const gate of report.gates) {
    console.log(
      `${gate.status === "passed" ? "PASS " : "BLOCK"} ${gate.id}: ${gate.detail}`,
    );
  }
  const passed = report.gates.filter((gate) => gate.status === "passed").length;
  console.log(
    `Activation ${report.status}: ${passed}/${report.gates.length} gates passed; report ${outPath}`,
  );
  if (report.status !== "eligible") process.exitCode = 1;
}

if (
  process.argv[1] &&
  basename(process.argv[1]) === "trust-activation-report.ts"
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Activation report generation failed.",
    );
    process.exitCode = 1;
  });
}
