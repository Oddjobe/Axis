import FirecrawlApp from "@mendable/firecrawl-js";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

const KPI_FILE = path.join(__dirname, "../src/lib/kpi-data.json");

interface KpiData {
    fdi: string;
    capitalFlight: string;
    lastUpdated: string;
    source: string;
}

const DEFAULT_KPI: KpiData = {
    fdi: "$67.0B",
    capitalFlight: "$631.4B",
    lastUpdated: new Date().toISOString(),
    source: "Static Fallback"
};

async function main() {
    console.log("Attempting to update KPIs using Firecrawl...");

    let currentKpi = { ...DEFAULT_KPI };
    if (fs.existsSync(KPI_FILE)) {
        try {
            currentKpi = JSON.parse(fs.readFileSync(KPI_FILE, "utf-8"));
        } catch (e) {
            console.error("Failed to read existing KPI file, using default.");
        }
    }

    if (!FIRECRAWL_API_KEY) {
        console.warn("No FIRECRAWL_API_KEY found. Falling back to cached KPIs.");
        saveKpis(currentKpi);
        return;
    }

    const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

    try {
        // Find latest UNCTAD or World Bank data via search
        const searchRes = await firecrawl.search("Africa total inbound FDI and total capital flight latest UNCTAD World Bank value billion");
        if (!searchRes.success || !searchRes.data || searchRes.data.length === 0) {
            throw new Error("Firecrawl search returned no results.");
        }
        
        const topUrl = searchRes.data[0].url as string;
        console.log(`Extracting from: ${topUrl}`);

        const extractRes: any = await firecrawl.scrapeUrl(topUrl, {
            formats: ["extract"],
            extract: {
                prompt: "Extract the exact values for total inbound Foreign Direct Investment (FDI) into Africa, and total Capital Flight out of Africa. Return values formatted like '$12.3B'.",
                schema: {
                    type: "object",
                    properties: {
                        fdi: { type: "string" },
                        capitalFlight: { type: "string" }
                    },
                    required: ["fdi", "capitalFlight"]
                } as any
            }
        });

        if (!extractRes.success || !extractRes.extract) {
            throw new Error(`Extraction failed: ${JSON.stringify(extractRes)}`);
        }

        const newKpi: KpiData = {
            fdi: extractRes.extract.fdi || currentKpi.fdi,
            capitalFlight: extractRes.extract.capitalFlight || currentKpi.capitalFlight,
            lastUpdated: new Date().toISOString(),
            source: topUrl
        };

        console.log("Successfully extracted new KPIs via Firecrawl!");
        saveKpis(newKpi);

    } catch (e: any) {
        console.warn(`\n[FALLBACK TRIGGERED] Firecrawl failed: ${e.message}`);
        console.warn("Credits might be exhausted or API blocked. Retaining last known good data.");
        
        // The fallback is simply relying on the previously saved JSON data (or defaults).
        // If we needed to fetch using generic RSS, we would do it here. 
        // For macro KPIs, caching the static file is the designated fallback.
        saveKpis({
            ...currentKpi,
            source: currentKpi.source === "Static Fallback" ? "Static Fallback" : currentKpi.source + " (Cached Fallback)"
        });
    }
}

function saveKpis(data: KpiData) {
    fs.writeFileSync(KPI_FILE, JSON.stringify(data, null, 2), "utf-8");
    console.log("Saved KPI data to src/lib/kpi-data.json");
    console.log(data);
}

main().catch(console.error);
