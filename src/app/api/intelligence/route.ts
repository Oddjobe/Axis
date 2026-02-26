import FirecrawlApp from "@mendable/firecrawl-js";
import { NextResponse } from "next/server";

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
let cachedData: any = null;
let lastFetch: number = 0;

export async function GET() {
    // Simple cache to avoid hitting Firecrawl limits and speed up dev
    if (cachedData && Date.now() - lastFetch < 1000 * 60 * 5) {
        return NextResponse.json(cachedData);
    }

    try {
        const response = await (app as any).v1.scrapeUrl("https://www.aljazeera.com/africa/", {
            formats: ["extract"],
            extract: {
                prompt: "Extract the top 5 latest news articles about African geopolitics, economy, and conflicts. Classify each as high/medium/low severity and categorize as either SOVEREIGNTY RISK or WESTERN RISK. Also extract the specific alpha-3 country ID (e.g. ZAF, NGA, SDN) this relates to.",
                schema: {
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
                                    category: { type: "string", enum: ["SOVEREIGNTY RISK", "WESTERN RISK"] },
                                    isoCode: { type: "string", description: "3-letter ISO code for the country" },
                                    timeAgo: { type: "string" }
                                },
                                required: ["title", "summary", "severity", "category", "isoCode", "timeAgo"]
                            }
                        }
                    },
                    required: ["articles"]
                }
            }
        });

        if (response.success && response.extract) {
            cachedData = response.extract.articles;
            lastFetch = Date.now();
            return NextResponse.json(cachedData);
        }

        throw new Error(response.error);
    } catch (error) {
        console.error("Firecrawl Error:", error);
        // Fallback Mock Data if scraping fails
        return NextResponse.json([
            {
                title: "USAID CONDITIONALITY IN DRC",
                summary: "Policy shift detected regarding funding tied to critical mineral legislation in DRC.",
                severity: "HIGH",
                category: "WESTERN RISK",
                isoCode: "COD",
                timeAgo: "2 MINS AGO"
            },
            {
                title: "SINO-AFRICAN INFRASTRUCTURE DEAL",
                summary: "New port development agreement signed, increasing sovereign debt but expanding trade capacity.",
                severity: "MEDIUM",
                category: "SOVEREIGNTY RISK",
                isoCode: "KEN",
                timeAgo: "1 HR AGO"
            },
            {
                title: "EU CARBON TAX IMPLICATIONS",
                summary: "CBAM regulations expected to impact South African steel and aluminum exports significantly.",
                severity: "HIGH",
                category: "WESTERN RISK",
                isoCode: "ZAF",
                timeAgo: "4 HRS AGO"
            }
        ]);
    }
}
