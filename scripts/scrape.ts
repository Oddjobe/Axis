import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// In GitHub Actions, these will be injected as repository secrets
dotenv.config({ path: '.env.local' });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FIRECRAWL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const INTEL_SOURCES = [
    { url: "https://www.aljazeera.com/africa/", name: "Al Jazeera Africa" },
    { url: "https://www.africanews.com/business/", name: "Africanews Business" },
    { url: "https://www.miningweekly.com/page/africa", name: "Mining Weekly Africa" },
    { url: "https://african.business/", name: "African Business Magazine" }
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

async function runScraper() {
    console.log("Starting automated Firecrawl intelligence gathering...");

    const fetchPromises = INTEL_SOURCES.map(source => {
        return firecrawl.scrapeUrl(source.url, {
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
        }).catch(err => {
            console.error(`Error scraping ${source.name}:`, err.message);
            return [];
        });
    });

    const results = await Promise.all(fetchPromises);
    const allArticles = results.flat();

    if (allArticles.length === 0) {
        console.error("No articles extracted from any source.");
        process.exit(1);
    }

    console.log(`Successfully scraped ${allArticles.length} articles. Inserting into Supabase...`);

    // Insert into Supabase
    const { data, error } = await supabase
        .from('intelligence_alerts')
        .insert(allArticles);

    if (error) {
        console.error("Failed to insert articles into Supabase:", error);
        process.exit(1);
    }

    console.log("Database updated successfully.");
}

runScraper();
