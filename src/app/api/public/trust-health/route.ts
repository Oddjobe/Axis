import { NextResponse } from "next/server";

import { GET as getBlogs } from "@/app/api/blogs/route";
import { GET as getCommodities } from "@/app/api/commodities/route";
import { GET as getIntelligence } from "@/app/api/intelligence/route";
import { GET as getScores } from "@/app/api/public/scores/route";
import { buildTrustHealthPayload } from "@/lib/intelligence/publication-health";
import { trustedPublicationSelectionEnabled } from "@/lib/intelligence/publication-selection.server";
import { trustHealthContractSchema } from "@/lib/intelligence/trust-health-contract.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS = {
  scores: getScores,
  intelligence: getIntelligence,
  blogs: getBlogs,
  commodities: getCommodities,
} as const;

async function safePayload(handler: () => Promise<Response>): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      handler(),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Trust-health source timed out.")),
          10_000,
        );
      }),
    ]);
    const payload = await response.json();
    if (response.ok) return payload;
    return {
      success: false,
      source:
        payload && typeof payload === "object" && "source" in payload
          ? payload.source
          : "upstream/unavailable",
      publicationTier:
        payload && typeof payload === "object" && "publicationTier" in payload
          ? payload.publicationTier
          : "legacy",
      dataMode: "stale",
      fallbackUsed: false,
      data: [],
      countries: [],
    };
  } catch {
    return {
      success: false,
      source: "upstream/unavailable",
      publicationTier: "legacy",
      dataMode: "stale",
      fallbackUsed: false,
      data: [],
      countries: [],
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const [scores, intelligence, blogs, commodities] = await Promise.all(
    Object.values(ENDPOINTS).map((handler) => safePayload(handler)),
  );
  const payload = trustHealthContractSchema.parse(
    buildTrustHealthPayload(
      { scores, intelligence, blogs, commodities },
      generatedAt,
      trustedPublicationSelectionEnabled(),
    ),
  );

  return NextResponse.json(
    payload,
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
