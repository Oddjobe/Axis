import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

import { createProductionIngestionAdapter } from "../src/lib/intelligence/ingestion/adapters.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import { createSupabaseIngestionPersistence } from "../src/lib/intelligence/ingestion/persistence.server";

dotenv.config({ path: ".env.local" });

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const summary = await runIntelligenceIngestion({
    adapter: createProductionIngestionAdapter({
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      foundryApiKey: process.env.FOUNDRY_API_KEY,
      foundryEndpoint: process.env.FOUNDRY_ENDPOINT,
      foundryModel: process.env.FOUNDRY_MODEL,
      logger: console,
    }),
    persist: createSupabaseIngestionPersistence(supabase),
    logger: console,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.success) process.exitCode = 1;
}

main().catch((error) => {
  process.exitCode = 1;
  console.error("Advanced scrape failed:", error);
});
