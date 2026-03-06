import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// In GitHub Actions, these will be injected as repository secrets
dotenv.config({ path: '.env.local' });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_MODEL = process.env.FOUNDRY_MODEL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FIRECRAWL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const foundry = FOUNDRY_API_KEY && FOUNDRY_ENDPOINT ? new OpenAI({
    apiKey: FOUNDRY_API_KEY,
    baseURL: FOUNDRY_ENDPOINT
}) : null;

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

const MEDIUM_SOURCES = [
    "https://medium.com/tag/africa/recommended",
    "https://medium.com/tag/geopolitics/recommended",
    "https://medium.com/tag/african-development/recommended"
];

async function getExistingTitles(table: string): Promise<Set<string>> {
    // Fetch titles inserted in the last 72 hours to avoid duplicates
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from(table)
        .select('title')
        .gte('created_at', since);

    if (error) {
        console.warn(`Could not fetch existing titles for ${table} dedup:`, error.message);
        return new Set();
    }

    return new Set((data || []).map((r: any) => r.title.toLowerCase().trim()));
}


async function scrapeWithPhi(url: string, prompt: string, schema: any): Promise<any> {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    console.log(`    (Fallback) Scraping with Jina + Phi-4: ${url}`);

    // 1. Fetch clean markdown for free via Jina Reader
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
        headers: { "X-No-Cache": "true" }
    });
    const markdown = await jinaResponse.text();

    if (!jinaResponse.ok) throw new Error(`Jina Reader failed: ${jinaResponse.statusText}`);

    // 2. Use Phi-4 to extract structured JSON
    const systemPrompt = `You are a professional data extractor. Extract the following information from the provided text and return it as a VALID JSON object matching this schema: ${JSON.stringify(schema)}. 

Instruction: ${prompt}

Text to process:
${markdown.substring(0, 30000)}`;

    const response = await foundry.chat.completions.create({
        model: FOUNDRY_MODEL,
        messages: [
            { role: "system", content: "You extract data into JSON format." },
            { role: "user", content: systemPrompt }
        ],
        response_format: { type: "json_object" }
    });

    const responseText = response.choices[0].message.content || "{}";

    // Clean JSON (in case model wraps it in ```json blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to extract valid JSON from Phi response.");

    return JSON.parse(jsonMatch[0]);
}

async function scrapeIntelligence() {
    console.log(`Scraping ${INTEL_SOURCES.length} OSINT sources...`);

    const fetchPromises = INTEL_SOURCES.map(source => {
        // Try Firecrawl first
        return firecrawl.scrapeUrl(source.url, {
            formats: ["extract"],
            extract: {
                prompt: `You are an African geopolitics intelligence analyst. Extract the top 3 most significant, recent news articles from ${source.name} that relate to African political, economic, resource, or security affairs. ALL EXTRACTED CONTENT (TITLE, SUMMARY, ETC) MUST BE TRANSLATED TO ENGLISH. For each article:
- Classify severity as HIGH (major geopolitical event), MEDIUM (significant development), or LOW (background context)
- Classify as SOVEREIGNTY RISK if the article covers African nations asserting independence, building industrial capacity, or resisting external pressure. Or OUTSIDE INFLUENCE if it covers foreign powers (China, US, EU, IMF, Russia, France) shaping African policy, debt, or trade.
- Extract the 3-letter ISO country code (e.g. NGA for Nigeria, COD for DR Congo, ZAF for South Africa).
- Identify the primary foreign actor if this is an OUTSIDE INFLUENCE article.`,
                schema: EXTRACT_SCHEMA as any
            }
        }).then((response: any) => {
            const extractedArticles = response?.extract?.articles || response?.data?.extract?.articles || response?.data?.articles || response?.articles;
            if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                console.log(`  ✓ ${source.name}: ${extractedArticles.length} articles (Firecrawl)`);
                return extractedArticles.map((a: any) => ({ ...a, source: source.name, actor: a.actor || null }));
            }
            throw new Error("No articles extracted by Firecrawl");
        }).catch(async (err) => {
            // FALLBACK TO FOUNDRY + JINA
            try {
                const prompt = `Extract top 3 latest news articles from ${source.name} about African geopolitics. ALL OUTPUT MUST BE IN ENGLISH. Classify severity (HIGH/MEDIUM/LOW) and type (SOVEREIGNTY RISK/OUTSIDE INFLUENCE). Use 3-letter ISO country codes.`;
                const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
                const articles = result.articles || [];
                if (articles.length > 0) {
                    console.log(`  ✓ ${source.name}: ${articles.length} articles (Foundry Fallback)`);
                    return articles.map((a: any) => ({ ...a, source: source.name, actor: a.actor || null }));
                }
                return [];
            } catch (fallbackErr: any) {
                console.error(`  ✗ ${source.name}: Both Firecrawl and Foundry failed - ${fallbackErr.message}`);
                return [];
            }
        });
    });

    const results = await Promise.all(fetchPromises);
    const allArticles = results.flat();

    if (allArticles.length === 0) {
        console.log("No intelligence articles extracted.");
        return;
    }

    console.log(`\nTotal scraped: ${allArticles.length} intel articles`);
    const existingTitles = await getExistingTitles('intelligence_alerts');
    const newArticles = allArticles.filter((a: any) => {
        const normalized = (a.title || "").toLowerCase().trim();
        return normalized.length > 0 && !existingTitles.has(normalized);
    }).map((a: any) => ({
        title: a.title,
        summary: a.summary,
        severity: a.severity,
        category: a.category,
        isoCode: a.isoCode,
        actor: a.actor,
        timeAgo: a.timeAgo,
        source: a.source
    }));

    if (newArticles.length === 0) {
        console.log("All intel articles already exist. No new inserts needed.");
        return;
    }

    console.log(`Inserting ${newArticles.length} new intel articles...`);
    const BATCH_SIZE = 10;
    for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
        const batch = newArticles.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('intelligence_alerts').insert(batch);
        if (error) console.error(`Failed to insert intel batch:`, error);
    }
}

async function scrapeBlogs() {
    console.log(`Scraping ${MEDIUM_SOURCES.length} blog sources...`);

    const fetchPromises = MEDIUM_SOURCES.map(url => {
        const blogSchema = {
            type: "object",
            properties: {
                posts: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            summary: { type: "string" },
                            author: { type: "string" },
                            tag: { type: "string" },
                            url: { type: "string" }
                        },
                        required: ["title", "summary", "author", "tag"]
                    }
                }
            },
            required: ["posts"]
        };

        // Try Firecrawl first
        return firecrawl.scrapeUrl(url, {
            formats: ["extract"],
            extract: {
                prompt: "Extract the top 3 blog post titles, a 1-sentence summary, the author name, and what geopolitical topic it relates to (e.g. 'AfCFTA Trade', 'Resource Sovereignty', 'Foreign Influence', 'Infrastructure', 'Digital Economy'). ALL EXTRACTED TEXT MUST BE IN ENGLISH (translate if necessary). Only include posts that directly relate to African geopolitics, economy, sovereignty, or continental development. Exclude unrelated content.",
                schema: blogSchema as any
            }
        }).then((response: any) => {
            const extractedPosts = response?.extract?.posts || response?.data?.extract?.posts || response?.data?.posts || response?.posts;
            if (Array.isArray(extractedPosts) && extractedPosts.length > 0) {
                console.log(`  ✓ ${url}: ${extractedPosts.length} posts (Firecrawl)`);
                return extractedPosts.map((p: any) => ({ ...p, url: p.url || url }));
            }
            throw new Error("No posts extracted by Firecrawl");
        }).catch(async (err) => {
            // FALLBACK TO FOUNDRY + JINA
            try {
                const prompt = "Extract top 3 blog posts about African development/geopolitics. ALL OUTPUT MUST BE IN ENGLISH. Return JSON with title, summary, author, and tag.";
                const result = await scrapeWithPhi(url, prompt, blogSchema);
                const posts = result.posts || [];
                if (posts.length > 0) {
                    console.log(`  ✓ ${url}: ${posts.length} posts (Foundry Fallback)`);
                    return posts.map((p: any) => ({ ...p, url: p.url || url }));
                }
                return [];
            } catch (fallbackErr: any) {
                console.error(`  ✗ ${url}: Both Firecrawl and Foundry failed - ${fallbackErr.message}`);
                return [];
            }
        });
    });

    const results = await Promise.all(fetchPromises);
    const allPosts = results.flat();

    if (allPosts.length === 0) {
        console.log("No blog posts extracted.");
        return;
    }

    console.log(`\nTotal scraped: ${allPosts.length} blog posts`);
    const existingTitles = await getExistingTitles('blog_posts');
    const newPosts = allPosts.filter((a: any) => {
        const normalized = (a.title || "").toLowerCase().trim();
        return normalized.length > 0 && !existingTitles.has(normalized);
    }).map((p: any) => ({
        title: p.title,
        summary: p.summary,
        author: p.author,
        tag: p.tag,
        url: p.url
    }));

    if (newPosts.length === 0) {
        console.log("All blog posts already exist. No new inserts needed.");
        return;
    }

    console.log(`Inserting ${newPosts.length} new blog posts...`);
    const BATCH_SIZE = 10;
    for (let i = 0; i < newPosts.length; i += BATCH_SIZE) {
        const batch = newPosts.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('blog_posts').insert(batch);
        if (error) console.error(`Failed to insert blog batch:`, error);
    }
}

async function runScraper() {
    console.log("Starting automated Firecrawl intelligence gathering...");
    await scrapeIntelligence();
    await scrapeBlogs();
    console.log("\nDatabase update complete.");
}

runScraper();
