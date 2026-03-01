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
    { url: "https://african.business/", name: "African Business Magazine" },
    { url: "https://www.reuters.com/world/africa/", name: "Reuters Africa" },
    { url: "https://theafricareport.com/", name: "The Africa Report" },
    { url: "https://www.dailymaverick.co.za/", name: "Daily Maverick" },
    { url: "https://www.premiumtimesng.com/", name: "Premium Times Nigeria" },
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
                    isoCode: { type: "string", description: "3-letter ISO code for the primary African country this article relates to. E.g. 'NGA' for Nigeria, 'COD' for DR Congo." },
                    actor: {
                        type: "string",
                        description: "Primary foreign actor involved in this story. Use one of: 'China', 'United States', 'EU / CBAM', 'Russia', 'IMF / World Bank', 'France', 'Gulf States', 'UK'. Leave empty if not applicable.",
                        enum: ["China", "United States", "EU / CBAM", "Russia", "IMF / World Bank", "France", "Gulf States", "UK", ""]
                    },
                    timeAgo: { type: "string" }
                },
                required: ["title", "summary", "severity", "category", "isoCode", "timeAgo"]
            }
        }
    },
    required: ["articles"]
};

async function getExistingTitles(): Promise<Set<string>> {
    // Fetch titles inserted in the last 72 hours to avoid duplicates
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('intelligence_alerts')
        .select('title')
        .gte('created_at', since);

    if (error) {
        console.warn("Could not fetch existing titles for dedup:", error.message);
        return new Set();
    }

    return new Set((data || []).map((r: any) => r.title.toLowerCase().trim()));
}

async function runScraper() {
    console.log("Starting automated Firecrawl intelligence gathering...");
    console.log(`Scraping ${INTEL_SOURCES.length} OSINT sources...`);

    const fetchPromises = INTEL_SOURCES.map(source => {
        return firecrawl.scrapeUrl(source.url, {
            formats: ["extract"],
            extract: {
                prompt: `You are an African geopolitics intelligence analyst. Extract the top 3 most significant, recent news articles from ${source.name} that relate to African political, economic, resource, or security affairs. For each article:
- Classify severity as HIGH (major geopolitical event), MEDIUM (significant development), or LOW (background context)
- Classify as SOVEREIGNTY RISK if the article covers African nations asserting independence, building industrial capacity, or resisting external pressure. Or OUTSIDE INFLUENCE if it covers foreign powers (China, US, EU, IMF, Russia, France) shaping African policy, debt, or trade.
- Extract the 3-letter ISO country code (e.g. NGA for Nigeria, COD for DR Congo, ZAF for South Africa).
- Identify the primary foreign actor if this is an OUTSIDE INFLUENCE article.`,
                schema: EXTRACT_SCHEMA as any
            }
        }).then((response: any) => {
            const extractedArticles = response?.extract?.articles || response?.data?.extract?.articles || response?.data?.articles || response?.articles;
            if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                console.log(`  ✓ ${source.name}: ${extractedArticles.length} articles`);
                return extractedArticles.map((a: any) => ({
                    ...a,
                    source: source.name,
                    actor: a.actor || null,  // null if not applicable
                }));
            }
            console.warn(`  ✗ ${source.name}: No articles extracted`);
            return [];
        }).catch(err => {
            console.error(`  ✗ ${source.name}: Error - ${err.message}`);
            return [];
        });
    });

    const results = await Promise.all(fetchPromises);
    const allArticles = results.flat();

    if (allArticles.length === 0) {
        console.error("No articles extracted from any source.");
        process.exit(1);
    }

    console.log(`\nTotal scraped: ${allArticles.length} articles`);
    console.log("Deduplicating against recent Supabase records...");

    const existingTitles = await getExistingTitles();
    const newArticles = allArticles.filter((a: any) => {
        const normalized = (a.title || "").toLowerCase().trim();
        return normalized.length > 0 && !existingTitles.has(normalized);
    });

    if (newArticles.length === 0) {
        console.log("All articles already exist in Supabase. No new inserts needed.");
        process.exit(0);
    }

    console.log(`Inserting ${newArticles.length} new articles (${allArticles.length - newArticles.length} duplicates skipped)...`);

    // Insert in batches to avoid payload limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
        const batch = newArticles.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('intelligence_alerts')
            .insert(batch);

        if (error) {
            console.error(`Failed to insert batch ${i / BATCH_SIZE + 1}:`, error);
        } else {
            console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} inserted (${batch.length} records)`);
        }
    }

    console.log("\nDatabase update complete.");
}

runScraper();
