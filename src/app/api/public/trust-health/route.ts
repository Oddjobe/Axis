import { NextResponse } from "next/server";

import { GET as getBlogs } from "@/app/api/blogs/route";
import { GET as getCommodities } from "@/app/api/commodities/route";
import { GET as getIntelligence } from "@/app/api/intelligence/route";
import { GET as getScores } from "@/app/api/public/scores/route";
import {
  buildAggregateTrustHealth,
  type TrustHealthProbe,
} from "@/lib/intelligence/trust-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function probe(
  handler: () => Promise<Response>,
): Promise<TrustHealthProbe> {
  try {
    const response = await handler();
    return {
      ok: response.ok,
      status: response.status,
      payload: await response.json(),
    };
  } catch {
    return {
      ok: false,
      status: null,
      payload: null,
    };
  }
}

export async function GET() {
  const generatedAt = new Date();
  const [scores, commodities, intelligence, blogs] = await Promise.all([
    probe(getScores),
    probe(getCommodities),
    probe(getIntelligence),
    probe(getBlogs),
  ]);
  const health = buildAggregateTrustHealth(
    {
      "country-scores": scores,
      commodities,
      intelligence,
      blogs,
    },
    generatedAt,
  );

  return NextResponse.json(health, {
    status: health.status === "unavailable" ? 503 : 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
