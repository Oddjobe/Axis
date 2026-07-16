import { NextResponse } from "next/server";

import { getStorageHealth } from "@/lib/intelligence/health.server";
import { runDeterministicQualitySuite } from "@/lib/intelligence/quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const generatedAt = new Date();
  const [quality, storage] = await Promise.all([
    runDeterministicQualitySuite(generatedAt),
    getStorageHealth(generatedAt),
  ]);
  const unhealthy = quality.status !== "pass" || storage.status !== "healthy";

  return NextResponse.json(
    {
      status: unhealthy ? "degraded" : "healthy",
      generatedAt: generatedAt.toISOString(),
      quality: {
        version: quality.version,
        status: quality.status,
        summary: quality.summary,
        metrics: quality.metrics,
        checks: quality.checks.map((check) => ({
          id: check.id,
          passed: check.passed,
          critical: check.critical,
        })),
      },
      storage,
    },
    {
      status: unhealthy ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
