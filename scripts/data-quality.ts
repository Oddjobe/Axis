import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { runDeterministicQualitySuite } from "../src/lib/intelligence/quality";

function outputPath(): string {
  const index = process.argv.indexOf("--output");
  const configured = index >= 0 ? process.argv[index + 1] : undefined;
  return resolve(configured || "quality-reports/data-quality-report.json");
}

async function main(): Promise<void> {
  const report = await runDeterministicQualitySuite();
  const reportPath = outputPath();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const check of report.checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`);
  }
  console.log(
    `Data quality ${report.status}: ${report.summary.passed}/${report.summary.checks} checks passed; report ${reportPath}`,
  );

  if (report.summary.criticalFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Data quality suite failed to execute:", error);
  process.exitCode = 1;
});
