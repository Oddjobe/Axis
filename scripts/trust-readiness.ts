import "dotenv/config";

import {
  assertReadOnlyArguments,
  runTrustReadiness,
  serializeRedactedReport,
} from "../src/lib/intelligence/trust-readiness";

function timeoutFromArguments(args: readonly string[]): number {
  const direct = args.find((argument) => argument.startsWith("--timeout-ms="));
  const value = direct?.split("=", 2)[1] ?? "10000";
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
    throw new Error("--timeout-ms must be an integer from 100 to 60000.");
  }
  return timeout;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assertReadOnlyArguments(args);
  const supported = args.filter(
    (argument) =>
      argument !== "--compact" &&
      argument !== "--mode=read-only" &&
      argument !== "--mode=read-only-readiness" &&
      !argument.startsWith("--timeout-ms="),
  );
  if (supported.length > 0) {
    throw new Error(`Unknown argument: ${supported[0].split("=", 1)[0]}`);
  }
  const report = await runTrustReadiness({
    timeoutMs: timeoutFromArguments(args),
  });
  const secrets = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((value): value is string => Boolean(value));
  process.stdout.write(
    serializeRedactedReport(report, secrets, !args.includes("--compact")),
  );
  if (!report.ready) process.exitCode = 1;
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Trust readiness failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
