import { NextResponse } from "next/server";

import { buildTrustHealthPayload } from "@/lib/intelligence/publication-health";
import { trustedPublicationSelectionEnabled } from "@/lib/intelligence/publication-selection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS = {
  scores: "/api/public/scores",
  intelligence: "/api/intelligence",
  blogs: "/api/blogs",
  commodities: "/api/commodities",
} as const;

async function safePayload(origin: string, path: string): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, origin), {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
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
  }
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  const origin = new URL(request.url).origin;
  const [scores, intelligence, blogs, commodities] = await Promise.all(
    Object.values(ENDPOINTS).map((path) => safePayload(origin, path)),
  );

  return NextResponse.json(
    buildTrustHealthPayload(
      { scores, intelligence, blogs, commodities },
      generatedAt,
      trustedPublicationSelectionEnabled(),
    ),
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
