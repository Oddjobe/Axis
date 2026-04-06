import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { ALL_SOVEREIGN_DATA } from "../src/lib/mock-data";

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

// Helper to safely parse metrics into 32-bit INT
function parseMetricSafe(val: string | number | undefined, isGdp = false): number {
    if (val === undefined) return 0;
    if (typeof val === 'number') return Math.floor(val);

    let cleanStr = val.replace(/,/g, '').replace(/\$/g, '');
    let multiplier = 1;

    if (cleanStr.toUpperCase().endsWith('B')) {
        // If GDP, we likely store in Millions in an INT column (500B -> 500,000M)
        multiplier = isGdp ? 1000 : 1000000000;
        cleanStr = cleanStr.slice(0, -1);
    } else if (cleanStr.toUpperCase().endsWith('M')) {
        multiplier = isGdp ? 1 : 1000000;
        cleanStr = cleanStr.slice(0, -1);
    }

    const result = Math.round(parseFloat(cleanStr) * multiplier) || 0;
    
    // Final clamp to signed 32-bit INT range to be absolutely safe (Postgres INT)
    const MAX_INT = 2147483647;
    return Math.min(result, MAX_INT);
}

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
        // Use 2026 for freshness
        const searchRes = await firecrawl.search("African GDP growth 2026 IMF table projections");

        if (!searchRes.success || !searchRes.data || searchRes.data.length === 0) {
            throw new Error("Search returned no results.");
        }

        const topUrl = searchRes.data[0].url as string;
        console.log(`Extracting metrics from: ${topUrl}`);

        const extractRes: any = await firecrawl.scrapeUrl(topUrl, {
            formats: ["extract"],
            extract: {
                prompt: "Extract the real GDP growth trend percentage and a performance score (1-100) for each African country. Also population and GDP if visible.",
                schema: {
                    type: "object",
                    properties: {
                        countries: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    isoCode: { type: "string", description: "3-letter ISO code" },
                                    trend: { type: "string", description: "e.g. '+4.5%'" },
                                    axisScore: { type: "number", description: "Score 1-100" }
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
            throw new Error(`Extraction failed: ${JSON.stringify(extractRes)}`);
        }

        const extractedData = extractRes.extract.countries.filter((c: any) => VALID_ISO_CODES.has(c.isoCode));
        console.log(`Extracted valid data for ${extractedData.length} countries.`);

        if (extractedData.length > 0) {
            const mappedRows = extractedData.map((c: any) => {
                const staticData = ALL_SOVEREIGN_DATA.find(s => s.country === c.isoCode);
                if (!staticData) return null;

                return {
                    id: c.isoCode,
                    name: staticData.name,
                    axisScore: Math.floor(c.axisScore || staticData.axisScore),
                    trend: c.trend || staticData.trend,
                    resourceWealth: staticData.resourceWealth || 50,
                    population: parseMetricSafe(staticData.population, false),
                    gdp: parseMetricSafe(staticData.gdp || "10B", true),
                    topExport: (staticData as any).topExport || (staticData.keyResources ? staticData.keyResources[0] : "Commodities"),
                    fdiClimate: (staticData as any).fdiClimate || "Stable",
                    strategicFocus: (staticData as any).strategicFocus || "Infrastructure Control",
                    updated_at: new Date().toISOString()
                };
            }).filter(Boolean);

            console.log(`Upserting ${mappedRows.length} countries into Supabase...`);
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
