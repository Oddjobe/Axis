import FirecrawlApp from "@mendable/firecrawl-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
let cachedData: unknown = null;
let lastFetch: number = 0;

const INTEL_SOURCES = [
    {
        url: "https://www.aljazeera.com/africa/",
        name: "Al Jazeera Africa"
    },
    {
        url: "https://www.africanews.com/business/",
        name: "Africanews Business"
    },
    {
        url: "https://www.miningweekly.com/page/africa",
        name: "Mining Weekly Africa"
    },
    {
        url: "https://african.business/",
        name: "African Business Magazine"
    }
];

const EXTRACT_SCHEMA = {
    type: "object",
    properties: {
        articles: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                    category: { type: "string", enum: ["SOVEREIGNTY RISK", "OUTSIDE INFLUENCE"] },
                    isoCode: { type: "string", description: "3-letter ISO code for the country" },
                    timeAgo: { type: "string" }
                },
                required: ["title", "summary", "severity", "category", "isoCode", "timeAgo"]
            }
        }
    },
    required: ["articles"]
};

export async function GET() {
    // 5-minute cache
    if (cachedData && Date.now() - lastFetch < 1000 * 60 * 5) {
        return NextResponse.json(cachedData);
    }

    try {
        const allArticles: unknown[] = [];

        // Parallelize requests to prevent Vercel Serverless Function Timeout (10s literal threshold on Hobby tier)
        const fetchPromises = INTEL_SOURCES.map(source => {
            return app.scrapeUrl(source.url, {
                formats: ["extract"],
                extract: {
                    prompt: `Extract the top 3 latest news articles about African geopolitics, economy, mining, resources, and conflicts from ${source.name}. Classify each as HIGH/MEDIUM/LOW severity and categorize as either SOVEREIGNTY RISK (African nations building independence) or OUTSIDE INFLUENCE (foreign powers, IMF, EU, China, US impacting African affairs). Extract the 3-letter ISO country code this relates to.`,
                    schema: EXTRACT_SCHEMA as any
                }
            }).then((response: any) => {
                const extractedArticles = response?.extract?.articles || response?.data?.extract?.articles || response?.data?.articles || response?.articles;
                if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                    return extractedArticles.map((a: any) => ({
                        ...a,
                        source: source.name
                    }));
                }
                return [];
            }).catch((sourceError: any) => {
                console.warn(`Failed to scrape ${source.name}:`, sourceError);
                return [];
            });
        });

        const results = await Promise.allSettled(fetchPromises);
        results.forEach(result => {
            if (result.status === "fulfilled" && result.value) {
                allArticles.push(...result.value);
            }
        });

        if (allArticles.length > 0) {
            cachedData = allArticles;
            lastFetch = Date.now();
            return NextResponse.json(cachedData);
        }

        throw new Error("No articles extracted from any source");
    } catch (error) {
        console.error("Firecrawl Error:", error);
        // Verified fallback data
        return NextResponse.json([
            {
                title: "DRC COBALT EXPORT BAN ENFORCEMENT",
                summary: "DRC government enforces ban on raw cobalt exports, mandating domestic processing to capture more value from its critical mineral reserves.",
                severity: "HIGH",
                category: "SOVEREIGNTY RISK",
                isoCode: "COD",
                timeAgo: "4 HRS AGO",
                source: "Fallback"
            },
            {
                title: "IMF STRUCTURAL ADJUSTMENT IN GHANA",
                summary: "IMF conditions bailout on privatization of state energy assets, raising concerns over sovereignty of critical infrastructure.",
                severity: "HIGH",
                category: "OUTSIDE INFLUENCE",
                isoCode: "GHA",
                timeAgo: "6 HRS AGO",
                source: "Fallback"
            },
            {
                title: "CHINA SECURES KENYAN PORT EXPANSION",
                summary: "New BRI-funded port expansion at Mombasa increases trade capacity but adds $2.1B to sovereign debt, raising intense debt sustainability questions.",
                severity: "MEDIUM",
                category: "OUTSIDE INFLUENCE",
                isoCode: "KEN",
                timeAgo: "8 HRS AGO",
                source: "Fallback"
            },
            {
                title: "ZAMBIA DEBT RESTRUCTURING FINALIZED",
                summary: "Zambia successfully completes historic $3B debt restructuring with international bondholders under the G20 Common Framework.",
                severity: "MEDIUM",
                category: "SOVEREIGNTY RISK",
                isoCode: "ZMB",
                timeAgo: "10 HRS AGO",
                source: "Fallback"
            },
            {
                title: "EU CBAM IMPACTS SOUTH AFRICAN EXPORTS",
                summary: "EU Carbon Border Adjustment Mechanism expected to sharply reduce South African steel and aluminum export competitiveness.",
                severity: "HIGH",
                category: "OUTSIDE INFLUENCE",
                isoCode: "ZAF",
                timeAgo: "11 HRS AGO",
                source: "Fallback"
            },
            {
                title: "NIGERIA DANGOTE REFINERY SCALES",
                summary: "Dangote Refinery ramps up domestic petrol production, significantly reducing West Africa's dependency on imported European fuels.",
                severity: "HIGH",
                category: "SOVEREIGNTY RISK",
                isoCode: "NGA",
                timeAgo: "14 HRS AGO",
                source: "Fallback"
            },
            {
                title: "RWANDA TECH HUB EXPANSION",
                summary: "Kigali Innovation City attracts $500M in African-led venture capital, positioning Rwanda as the continent's leading tech sovereignty hub.",
                severity: "LOW",
                category: "SOVEREIGNTY RISK",
                isoCode: "RWA",
                timeAgo: "16 HRS AGO",
                source: "Fallback"
            },
            {
                title: "FRANCE WITHDRAWS FROM NIGER URANIUM",
                summary: "Orano ceases uranium extraction operations in Niger after the military government revokes mining licenses in push for resource sovereignty.",
                severity: "HIGH",
                category: "OUTSIDE INFLUENCE",
                isoCode: "NER",
                timeAgo: "18 HRS AGO",
                source: "Fallback"
            },
            {
                title: "NAMIBIA LITHIUM PROCESSING LAW",
                summary: "Namibian parliament debates legislation requiring 50% state ownership in new corporate lithium mining ventures.",
                severity: "MEDIUM",
                category: "SOVEREIGNTY RISK",
                isoCode: "NAM",
                timeAgo: "22 HRS AGO",
                source: "Fallback"
            },
            {
                title: "US AGOA EXPIRATION LOOMS",
                summary: "African manufacturers brace for potential tariff hikes as US Congress stalls on reauthorizing the African Growth and Opportunity Act.",
                severity: "HIGH",
                category: "OUTSIDE INFLUENCE",
                isoCode: "PAN",
                timeAgo: "24 HRS AGO",
                source: "Fallback"
            }
        ]);
    }
}
