import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createProductionIngestionAdapter } from "../src/lib/intelligence/ingestion/adapters.server";
import { createCommodityFirecrawlAdapter } from "../src/lib/intelligence/ingestion/commodity-adapter.server";
import {
  commodityHistorySummary,
  loadPreviousCommodityPrices,
  type CommodityHistoryLoad,
} from "../src/lib/intelligence/ingestion/commodity-history.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import { createSupabaseIngestionPersistence } from "../src/lib/intelligence/ingestion/persistence.server";

dotenv.config({ path: ".env.local" });

const DEFAULT_DEADLINE_MS = 8 * 60 * 1_000;

function argument(name: string, fallback: string): string {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function writeReport(report: unknown): Promise<string> {
  const path = resolve(
    argument(
      "--output",
      "quality-reports/shadow-ingestion-report.json",
    ),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}

async function writeCommodityHistoryOutputs(
  history: CommodityHistoryLoad,
): Promise<void> {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `commodity_history_status=${history.status}`,
      `commodity_history_bootstrap=${String(history.bootstrap)}`,
      `commodity_history_unavailable=${String(history.historyUnavailable)}`,
      `commodity_history_loaded_count=${history.loadedIds.length}`,
      `commodity_history_latest_source_published_at=${history.latestSourcePublishedAt ?? ""}`,
      `commodity_history_latest_published_at=${history.latestPublishedAt ?? ""}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const deadlineMs = Number(
    argument("--deadline-ms", String(DEFAULT_DEADLINE_MS)),
  );
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1_000) {
    throw new Error("--deadline-ms must be an integer of at least 1000.");
  }
  const deadlineAt = Date.now() + deadlineMs;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY ?? "";
  try {
    const commodityHistory = await loadPreviousCommodityPrices(supabase, {
      signal: AbortSignal.timeout(Math.max(1, deadlineAt - Date.now())),
    });
    await writeCommodityHistoryOutputs(commodityHistory);
    const summary = await runIntelligenceIngestion({
      adapter: createProductionIngestionAdapter({
        firecrawlApiKey,
        foundryApiKey: process.env.FOUNDRY_API_KEY,
        foundryEndpoint: process.env.FOUNDRY_ENDPOINT,
        foundryModel: process.env.FOUNDRY_MODEL,
        logger: console,
        deadlineAt,
      }),
      commodityAdapter: createCommodityFirecrawlAdapter({
        apiKey: firecrawlApiKey,
        deadlineAt,
      }),
      previousCommodityPrices: commodityHistory.previousCommodityPrices,
      previousCommoditySourcePublishedAt:
        commodityHistory.previousCommoditySourcePublishedAt,
      commodityHistory: commodityHistorySummary(commodityHistory),
      persist: createSupabaseIngestionPersistence(supabase, { deadlineAt }),
      logger: console,
      deadlineAt,
    });
    const reportPath = await writeReport(summary);
    console.log(JSON.stringify({ reportPath, ...summary }, null, 2));
    if (!summary.success) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reportPath = await writeReport({
      success: false,
      completedAt: new Date().toISOString(),
      error: message,
    });
    console.error(`Shadow ingestion failed; report ${reportPath}: ${message}`);
    throw error;
  }
}

main().catch((error) => {
  process.exitCode = 1;
  console.error("Advanced scrape failed:", error);
});
