import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createProductionIngestionAdapter } from "@/lib/intelligence/ingestion/adapters.server";
import { runIntelligenceIngestion } from "@/lib/intelligence/ingestion/orchestrator.server";
import { createSupabaseIngestionPersistence } from "@/lib/intelligence/ingestion/persistence.server";

export const runtime = "nodejs";
export const maxDuration = 300;
const RUN_BUDGET_MS = 270_000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  try {
    const deadlineAt = Date.now() + RUN_BUDGET_MS;
    const supabase = createClient(supabaseUrl, serviceKey);
    const summary = await runIntelligenceIngestion({
      adapter: createProductionIngestionAdapter({
        firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
        foundryApiKey: process.env.FOUNDRY_API_KEY,
        foundryEndpoint: process.env.FOUNDRY_ENDPOINT,
        foundryModel: process.env.FOUNDRY_MODEL,
        logger: console,
        deadlineAt,
      }),
      persist: createSupabaseIngestionPersistence(supabase, { deadlineAt }),
      logger: console,
      deadlineAt,
      signal: request.signal,
    });

    const status = summary.success ? 200 : summary.partialSuccess ? 207 : 500;
    return NextResponse.json(summary, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Scraper Error:", error);
    const deadlineExceeded =
      message === "Ingestion run deadline exhausted";
    return NextResponse.json(
      { success: false, error: message },
      { status: deadlineExceeded ? 504 : 500 },
    );
  }
}
