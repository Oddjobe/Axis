import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const VALID_ISO_CODES = new Set([
    "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD", "COM", "COD", "COG", "CIV",
    "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR",
    "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN",
    "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE"
]);

async function main() {
    console.log("Starting Dynamic Country DB Update...");

    if (!supabase) {
        console.error("Supabase config missing.");
        return;
    }

    if (!FIRECRAWL_API_KEY) {
        console.warn("No FIRECRAWL_API_KEY. Graceful exit.");
        return;
    }

    const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

    try {
        console.log("Searching African Development Bank / IMF for macro data...");
        const searchRes = await firecrawl.search("African economic outlook 2024 real GDP growth by country IMF table");

        if (!searchRes.success || !searchRes.data || searchRes.data.length === 0) {
            throw new Error("Search returned no results.");
        }

        const topUrl = searchRes.data[0].url as string;
        console.log(`Extracting metrics from: ${topUrl}`);

        const extractRes: any = await firecrawl.scrapeUrl(topUrl, {
            formats: ["extract"],
            extract: {
                prompt: "Extract the real GDP growth trend percentage and score for each African country found in this text.",
                schema: {
                    type: "object",
                    properties: {
                        countries: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    isoCode: { type: "string", description: "3-letter ISO code" },
                                    trend: { type: "string", description: "e.g. '+3.2%'" },
                                    axisScore: { type: "number", description: "A generic score from 1-100 representing performance/stability" }
                                },
                                required: ["isoCode", "trend", "axisScore"]
                            }
                        }
                    },
                    required: ["countries"]
                } as any
            }
        });

        if (!extractRes.success || !extractRes.extract || !extractRes.extract.countries) {
            throw new Error(`Extraction failed or came back empty: ${JSON.stringify(extractRes)}`);
        }

        const extractedData = extractRes.extract.countries.filter((c: any) => VALID_ISO_CODES.has(c.isoCode));
        console.log(`Extracted valid data for ${extractedData.length} countries.`);

        if (extractedData.length > 0) {
            // Map the data into the structure Supabase `countries` table expects
            const mappedRows = extractedData.map((c: any) => ({
                id: c.isoCode, // 'id' matches dbCountry.id in page.tsx
                trend: c.trend,
                axisScore: c.axisScore,
                updated_at: new Date().toISOString()
            }));

            console.log("Upserting into Supabase 'countries' table...");
            const { error } = await supabase.from('countries').upsert(mappedRows);
            if (error) {
                console.error("Supabase upsert error:", error);
            } else {
                console.log("✅ Successfully updated DB with dynamic country metrics.");
            }
        }
    } catch (e: any) {
        console.warn(`\n[FALLBACK TRIGGERED] Firecrawl DB update failed: ${e.message}`);
        console.warn("Retaining existing Supabase & Mock data seamlessly.");
    }
}

main().catch(console.error);
