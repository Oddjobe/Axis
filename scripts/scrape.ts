import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import Parser from "rss-parser";

// In GitHub Actions, these will be injected as repository secrets
dotenv.config({ path: '.env.local' });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_MODEL = process.env.FOUNDRY_MODEL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required Supabase environment variables.");
    process.exit(1);
}

const firecrawl = FIRECRAWL_API_KEY ? new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY }) : null;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const rssParser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
});

const foundry = FOUNDRY_API_KEY && FOUNDRY_ENDPOINT ? new OpenAI({
    apiKey: FOUNDRY_API_KEY,
    baseURL: FOUNDRY_ENDPOINT
}) : null;

const INTEL_SOURCES = [
    { url: "https://www.aljazeera.com/africa/", name: "Al Jazeera Africa", rssUrl: "https://www.aljazeera.com/xml/rss/all.xml" },
    { url: "https://www.africanews.com/business/", name: "Africanews Business", rssUrl: "https://www.africanews.com/feed/" },
    { url: "https://www.miningweekly.com/page/africa", name: "Mining Weekly Africa", rssUrl: "https://www.miningweekly.com/rss.php?item_id=2334" },
    { url: "https://african.business/", name: "African Business Magazine", rssUrl: "https://african.business/feed/" },
    { url: "https://www.reuters.com/world/africa/", name: "Reuters Africa" },
    { url: "https://theafricareport.com/", name: "The Africa Report", rssUrl: "https://www.theafricareport.com/feed/" },
    { url: "https://www.dailymaverick.co.za/", name: "Daily Maverick", rssUrl: "https://www.dailymaverick.co.za/feed/" },
    { url: "https://www.premiumtimesng.com/", name: "Premium Times Nigeria", rssUrl: "https://www.premiumtimesng.com/feed" },
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
    console.log(`  Checking existing titles in ${table}...`);
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from(table)
        .select('title')
        .gte('created_at', since);

    if (error) {
        console.warn(`Could not fetch existing titles for ${table} dedup:`, error.message);
        return new Set();
    }
    console.log(`  Found ${data?.length || 0} existing titles.`);
    return new Set((data || []).map((r: any) => r.title.toLowerCase().trim()));
}

async function scrapeWithPhi(url: string, prompt: string, schema: any, inputContent?: string): Promise<any> {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    let content = inputContent;
    if (!content) {
        console.log(`    (Fallback) Scraping with Jina + Phi-4: ${url}`);
        const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
            headers: { "X-No-Cache": "true" },
            signal: AbortSignal.timeout(15000)
        });
        if (!jinaResponse.ok) throw new Error(`Jina Reader failed: ${jinaResponse.statusText}`);
        content = await jinaResponse.text();
    }

    const systemPrompt = `You are a professional data extractor. Extract the following information from the provided text and return it as a VALID JSON object matching this schema: ${JSON.stringify(schema)}. 

Instruction: ${prompt}

Text to process:
${content.substring(0, 30000)}`;

    const response = await foundry.chat.completions.create({
        model: FOUNDRY_MODEL,
        messages: [
            { role: "system", content: "You extract data into JSON format." },
            { role: "user", content: systemPrompt }
        ],
        response_format: { type: "json_object" }
    });

    const responseText = response.choices[0].message.content || "{}";
    const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to extract valid JSON from Phi response.");

    return JSON.parse(jsonMatch[0]);
}

async function scrapeIntelligence() {
    console.log(`Scraping ${INTEL_SOURCES.length} OSINT sources...`);

    const fetchPromises = INTEL_SOURCES.map(async (source) => {
        // 1. TRY RSS PARSING (Reliable, fast, clean)
        if (source.rssUrl) {
            try {
                console.log(`  Trying RSS: ${source.name}`);
                const feed = await Promise.race([
                    rssParser.parseURL(source.rssUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('RSS Timeout')), 15000))
                ]) as any;
                const items = feed.items.slice(0, 5).map((item: any) => ({
                    title: item.title,
                    summary: item.contentSnippet || item.content || item.description,
                    link: item.link,
                    pubDate: item.pubDate
                }));

                if (items.length > 0) {
                    const prompt = `Classify these latest news items for our intelligence dashboard. Use 3-letter ISO country codes. Translate everything to English if necessary. Extract severity, category, country, and primary foreign actor. Content: ${JSON.stringify(items)}`;
                    const result = await scrapeWithPhi("", prompt, EXTRACT_SCHEMA, JSON.stringify(items));
                    const extracted = result.articles || [];
                    if (extracted.length > 0) {
                        console.log(`  ✓ ${source.name}: ${extracted.length} articles (RSS + Phi-4)`);
                        return extracted.map((a: any) => ({ ...a, source: source.name, actor: a.actor || null }));
                    }
                }
            } catch (rssErr: any) {
                console.warn(`  RSS Failed for ${source.name}: ${rssErr.message}`);
            }
        }

        // 2. TRY FIRECRAWL (Powerful if credits available)
        if (firecrawl) {
            try {
                const response: any = await firecrawl.scrapeUrl(source.url, {
                    formats: ["extract"],
                    extract: {
                        prompt: `Extract top 3 articles about African geopolitics. Classify severity, category, and country. Translate to English.`,
                        schema: EXTRACT_SCHEMA as any
                    }
                });
                const extractedArticles = response?.extract?.articles || response?.data?.articles || response?.articles;
                if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                    console.log(`  ✓ ${source.name}: ${extractedArticles.length} articles (Firecrawl)`);
                    return extractedArticles.map((a: any) => ({ ...a, source: source.name, actor: a.actor || null }));
                }
            } catch (fireErr: any) {
                console.warn(`  Firecrawl failed for ${source.name}: ${fireErr.message}`);
            }
        }

        // 3. TRY JINA + PHI-4 FALLBACK
        try {
            const prompt = `Extract top 3 latest news articles from this page about African geopolitics/economy. Classify severity, category, and country (ISO code).`;
            const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
            const articles = result.articles || [];
            if (articles.length > 0) {
                console.log(`  ✓ ${source.name}: ${articles.length} articles (Foundry Fallback)`);
                return articles.map((a: any) => ({ ...a, source: source.name, actor: a.actor || null }));
            }
        } catch (jinaErr: any) {
            console.error(`  ✗ ${source.name}: All methods failed - ${jinaErr.message}`);
        }

        return [];
    });

    const results = await Promise.allSettled(fetchPromises);
    const allArticles = results.map(r => r.status === 'fulfilled' ? r.value : []).flat();

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
        console.log(`  Inserting batch ${i / BATCH_SIZE + 1}...`);
        const { error } = await supabase.from('intelligence_alerts').insert(batch);
        if (error) {
            console.error(`  Failed to insert intel batch:`, error.message);
        } else {
            console.log(`  Batch ${i / BATCH_SIZE + 1} inserted successfully.`);
        }
    }
}

async function scrapeBlogs() {
    console.log(`Scraping ${MEDIUM_SOURCES.length} blog sources...`);

    const fetchPromises = MEDIUM_SOURCES.map(async (url) => {
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
        if (firecrawl) {
            try {
                const response: any = await firecrawl.scrapeUrl(url, {
                    formats: ["extract"],
                    extract: {
                        prompt: "Extract top 3 blog posts about African development/geopolitics. Title, 1-sentence summary, author, and tag.",
                        schema: blogSchema as any
                    }
                });
                const extractedPosts = response?.extract?.posts || response?.data?.posts || response?.posts;
                if (Array.isArray(extractedPosts) && extractedPosts.length > 0) {
                    console.log(`  ✓ ${url}: ${extractedPosts.length} posts (Firecrawl)`);
                    return extractedPosts.map((p: any) => ({ ...p, url: p.url || url }));
                }
            } catch (err) { }
        }

        // Try Jina + Phi-4
        try {
            const prompt = "Extract top 3 blog posts about African development/geopolitics. JSON with title, summary, author, and tag.";
            const result = await scrapeWithPhi(url, prompt, blogSchema);
            const posts = result.posts || [];
            if (posts.length > 0) {
                console.log(`  ✓ ${url}: ${posts.length} posts (Foundry Fallback)`);
                return posts.map((p: any) => ({ ...p, url: p.url || url }));
            }
        } catch (err) {
            console.error(`  ✗ ${url}: Blog scraping failed - ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        return [];
    });

    const results = await Promise.allSettled(fetchPromises);
    const allPosts = results.map(r => r.status === 'fulfilled' ? r.value : []).flat();

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
        console.log(`  Inserting blog batch ${i / BATCH_SIZE + 1}...`);
        const { error } = await supabase.from('blog_posts').insert(batch);
        if (error) {
            console.error(`  Failed to insert blog batch:`, error.message);
        } else {
            console.log(`  Blog batch ${i / BATCH_SIZE + 1} inserted successfully.`);
        }
    }
}

async function runScraper() {
    console.log("Starting automated Firecrawl intelligence gathering...");
    await scrapeIntelligence();
    await scrapeBlogs();
    console.log("\nDatabase update complete.");
}

runScraper();
