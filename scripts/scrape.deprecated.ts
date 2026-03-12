const FirecrawlApp = require("@mendable/firecrawl-js").default;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai").default;
const dotenv = require("dotenv");
const Parser = require("rss-parser");

const parser = new Parser();

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
const VALID_ISO_CODES = new Set([
    "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD", "COM", "COD", "COG", "CIV",
    "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR",
    "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN",
    "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE"
]);

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
        let jinaUrl = `https://r.jina.ai/${url}`;

        const fetchWithTimeout = async (targetUrl: string, timeoutMs: number) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(targetUrl, {
                    headers: { "X-No-Cache": "true" },
                    signal: controller.signal
                });
                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        let jinaResponse = await fetchWithTimeout(jinaUrl, 30000);

        if (jinaResponse.status === 451 || !jinaResponse.ok) {
            console.warn(`    Jina primary failed (${jinaResponse.status}), checking alternative...`);
            // Some sites block Jina, would need a proxy here in a real scenario
            if (!jinaResponse.ok) throw new Error(`Jina Reader failed: ${jinaResponse.statusText}`);
        }

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
    }, { timeout: 45000 }); // Shorter timeout to fail fast and retry if needed

    const responseText = response.choices[0].message.content || "{}";
    const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to extract valid JSON from Phi response.");

    return JSON.parse(jsonMatch[0]);
}

async function scrapeFromRSS(sourceName: string, rssUrl: string): Promise<any[]> {
    try {
        console.log(`    [RSS] Fetching for ${sourceName}: ${rssUrl}`);
        const feed = await parser.parseURL(rssUrl);
        // Take top 3 items from RSS for stability
        return feed.items.slice(0, 3).map((item: any) => ({
            title: item.title,
            summary: (item.contentSnippet || item.summary || item.content || "").substring(0, 300),
            url: item.link,
            source: sourceName
        }));
    } catch (e: any) {
        console.warn(`    [RSS] Failed for ${sourceName}: ${e.message}`);
        return [];
    }
}

async function scrapeIntelligence() {
    const allArticles: any[] = [];
    for (const source of INTEL_SOURCES) {
        try {
            console.log(`  [Start] ${source.name}`);
            let extracted: any[] = [];
            let rssItems: any[] = [];

            // 1. TRY RSS FIRST IF AVAILABLE
            if (source.rssUrl) {
                rssItems = await scrapeFromRSS(source.name, source.rssUrl);
                if (rssItems.length > 0) {
                    console.log(`    [RSS] Found ${rssItems.length} items for ${source.name}. Classifying with Phi-4...`);
                    const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
                    try {
                        const prompt = `Classify these ${rssItems.length} news items. For each, determine severity (HIGH/MEDIUM/LOW), category (SOVEREIGNTY RISK/OUTSIDE INFLUENCE), and country ISO code.`;
                        const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA, rssContent);
                        const classified = result.articles || [];

                        // Merge classification with original RSS URLs
                        extracted = classified.map((c: any) => {
                            return {
                                ...c,
                                source: source.name
                            };
                        });
                        console.log(`  ✓ ${source.name}: ${extracted.length} articles (RSS + Foundry)`);
                    } catch (phiErr: any) {
                        console.warn(`    [Phi] RSS classification failed for ${source.name}: ${phiErr.message}`);
                    }
                }
            }

            // 2. TRY FOUNDRY (JINA + PHI-4) - SECONDARY
            if (extracted.length === 0) {
                try {
                    console.log(`  Trying Foundry Primary for ${source.name}`);
                    const prompt = `Extract top 3 latest news articles from this page about African geopolitics/economy. Classify severity, category, and country (ISO code).`;
                    const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
                    extracted = result.articles || [];
                    if (extracted.length > 0) {
                        console.log(`  ✓ ${source.name}: ${extracted.length} articles (Foundry Browser)`);
                    }
                } catch (foundryErr: any) {
                    console.warn(`  Foundry failed for ${source.name}: ${foundryErr.message}`);
                }
            }

            // 3. TRY FIRECRAWL - BACKUP
            if (extracted.length === 0 && firecrawl) {
                try {
                    console.log(`  Trying Firecrawl Backup for ${source.name}: ${source.url}`);
                    const response: any = await firecrawl.scrapeUrl(source.url, {
                        formats: ["extract"],
                        extract: {
                            prompt: `Extract top 3 articles about African geopolitics. Classify severity, category, and country. Translate to English.`,
                            schema: EXTRACT_SCHEMA as any
                        }
                    });
                    const extractedArticles = response?.extract?.articles || response?.data?.articles || response?.articles;
                    if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                        extracted = extractedArticles;
                        console.log(`  ✓ ${source.name}: ${extracted.length} articles (Firecrawl)`);
                    }
                } catch (fireErr: any) {
                    console.warn(`  Firecrawl backup failed for ${source.name}: ${fireErr.message}`);
                }
            }

            if (extracted.length > 0) {
                const validated = extracted
                    .map((a: any) => ({
                        ...a,
                        source: source.name,
                        isoCode: (a.isoCode || "").toUpperCase().trim(),
                        actor: a.actor || null
                    }))
                    .filter((a: any) => VALID_ISO_CODES.has(a.isoCode));
                allArticles.push(...validated);
            }
        } catch (err: any) {
            console.error(`  Unexpected error for ${source.name}: ${err.message}`);
        }
    }

    if (allArticles.length === 0) {
        console.log("No intelligence articles extracted.");
        return;
    }

    console.log(`\nTotal scraped and validated: ${allArticles.length} intel articles`);
    const existingTitles = await getExistingTitles('intelligence_alerts');
    const newArticles = allArticles.filter((a: any) => {
        const normalized = (a.title || "").toLowerCase().trim();
        return normalized.length > 0 && !existingTitles.has(normalized);
    });

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
    console.log(`Scraping ${MEDIUM_SOURCES.length} blog sources in parallel...`);

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

    const allPosts: any[] = [];
    for (const url of MEDIUM_SOURCES) {
        try {
            console.log(`  [Start Blog] ${url}`);
            let extracted: any[] = [];

            // 1. TRY RSS FIRST
            const tag = url.split('/').slice(-2, -1)[0] || 'africa';
            const rssUrl = `https://medium.com/feed/tag/${tag}`;
            const rssItems = await scrapeFromRSS("Medium", rssUrl);

            if (rssItems.length > 0) {
                console.log(`    [Blog RSS] Found ${rssItems.length} items for ${tag}. Classifying with Phi-4...`);
                const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
                try {
                    const blogPrompt = "Classify these blog posts. JSON with title, summary, author, and tag.";
                    const result = await scrapeWithPhi(url, blogPrompt, blogSchema, rssContent);
                    const posts = result.posts || [];
                    if (posts.length > 0) {
                        extracted = posts.map((p: any, i: number) => {
                            const original = rssItems[i] || {};
                            return {
                                ...p,
                                url: original.url || url
                            };
                        });
                        console.log(`  ✓ ${url}: ${extracted.length} posts (RSS + Foundry)`);
                    }
                } catch (phiErr: any) {
                    console.warn(`    [Phi] Blog RSS classification failed for ${url}: ${phiErr.message}`);
                }
            }

            // 2. TRY FOUNDRY (JINA + PHI-4) - SECONDARY
            if (extracted.length === 0) {
                try {
                    console.log(`  Trying Foundry Primary for blogs: ${url}`);
                    const blogPrompt = "Extract top 3 blog posts about African development/geopolitics. JSON with title, summary, author, and tag.";
                    const result = await scrapeWithPhi(url, blogPrompt, blogSchema);
                    const posts = result.posts || [];
                    if (posts.length > 0) {
                        extracted = posts.map((p: any) => ({ ...p, url: p.url || url }));
                        console.log(`  ✓ ${url}: ${extracted.length} posts (Foundry Browser)`);
                    }
                } catch (foundryErr: any) {
                    console.warn(`  Foundry failed for blogs: ${url} - ${foundryErr.message}`);
                }
            }

            // 3. TRY FIRECRAWL - BACKUP
            if (extracted.length === 0 && firecrawl) {
                try {
                    console.log(`  Trying Firecrawl Backup for blogs: ${url}`);
                    const response: any = await firecrawl.scrapeUrl(url, {
                        formats: ["extract"],
                        extract: {
                            prompt: "Extract top 3 blog posts about African development/geopolitics. Title, 1-sentence summary, author, and tag.",
                            schema: blogSchema as any
                        }
                    });
                    const extractedPosts = response?.extract?.posts || response?.data?.posts || response?.posts;
                    if (Array.isArray(extractedPosts) && extractedPosts.length > 0) {
                        extracted = extractedPosts.map((p: any) => ({ ...p, url: p.url || url }));
                        console.log(`  ✓ ${url}: ${extracted.length} posts (Firecrawl)`);
                    }
                } catch (fireErr) {
                    console.warn(`  Firecrawl backup failed for blogs: ${url}`);
                }
            }

            if (extracted.length > 0) {
                allPosts.push(...extracted);
            }
        } catch (err: any) {
            console.error(`  Unexpected blog error for ${url}: ${err.message}`);
        }
    }

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
    console.log("Starting serialized intelligence gathering (Foundry -> Firecrawl)...");

    console.log("\n--- PHASE 1: INTELLIGENCE ALERTS ---");
    await scrapeIntelligence();

    console.log("\n--- PHASE 2: BLOG POSTS ---");
    await scrapeBlogs();

    console.log("\nDatabase update complete.");
}

runScraper();
