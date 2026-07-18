import { type NextRequest, NextResponse } from "next/server";

import {
  sanitizeDatasetHealth,
  type SanitizedDatasetHealth,
} from "@/lib/intelligence/trust-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deploymentOrigin(request: NextRequest): string | null {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    try {
      return new URL(`https://${vercelUrl}`).origin;
    } catch {
      return null;
    }
  }

  const requestUrl = new URL(request.url);
  return requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1" ||
    requestUrl.hostname === "::1"
    ? requestUrl.origin
    : null;
}

async function inspect(
  origin: string | null,
  path: string,
): Promise<SanitizedDatasetHealth> {
  if (!origin) return sanitizeDatasetHealth(null, 503);

  try {
    const response = await fetch(new URL(path, origin), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    return sanitizeDatasetHealth(payload, response.status);
  } catch {
    return sanitizeDatasetHealth(null, 503);
  }
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const origin = deploymentOrigin(request);
  const [countryScores, intelligence, blogs, commodities] = await Promise.all([
    inspect(origin, "/api/public/scores"),
    inspect(origin, "/api/intelligence"),
    inspect(origin, "/api/blogs"),
    inspect(origin, "/api/commodities"),
  ]);
  const datasets = {
    countryScores,
    intelligence,
    blogs,
    commodities,
  };
  const states = Object.values(datasets).map((dataset) => dataset.state);
  const status = states.every((state) => state === "trusted-current")
    ? "healthy"
    : states.every((state) => state === "unavailable")
      ? "unavailable"
      : "degraded";

  return NextResponse.json(
    {
      status,
      generatedAt,
      datasets,
    },
    {
      status: status === "unavailable" ? 503 : 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
