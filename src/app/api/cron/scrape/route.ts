import { NextResponse } from 'next/server';
import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Parser from "rss-parser";

// We can run this as a long-running Node.js function. Let Vercel / Next.js know it can take longer.
// However on Vercel Hobby it's limited to 10s. If this is a self-hosted or pro app, maxDuration can be higher.
export const maxDuration = 300;

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_MODEL = process.env.FOUNDRY_MODEL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const parser = new Parser();

const firecrawl = FIRECRAWL_API_KEY ? new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY }) : null;
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const foundry = (FOUNDRY_API_KEY && FOUNDRY_ENDPOINT)
    ? new OpenAI({ apiKey: FOUNDRY_API_KEY, baseURL: FOUNDRY_ENDPOINT })
    : null;

// The same constants from the old script
const INTEL_SOURCES = [
    { url: "https://news.google.com/search?q=Africa+geopolitics", name: "Google News Geopolitics", rssUrl: "https://news.google.com/rss/search?q=Africa+geopolitics+when:24h&hl=en-US&gl=US&ceid=US:en" },
    { url: "https://news.google.com/search?q=Africa+China+US", name: "Google News Foreign Influence", rssUrl: "https://news.google.com/rss/search?q=Africa+(China+OR+US+OR+Russia)+when:24h&hl=en-US&gl=US&ceid=US:en" },
    { url: "https://www.africanews.com/business/", name: "Africanews Business", rssUrl: "https://www.africanews.com/feed/" },
    { url: "https://www.miningweekly.com/page/africa", name: "Mining Weekly Africa", rssUrl: "https://www.miningweekly.com/rss.php?item_id=2334" },
    { url: "https://african.business/", name: "African Business Magazine", rssUrl: "https://african.business/feed/" },
    { url: "https://theafricareport.com/", name: "The Africa Report", rssUrl: "https://www.theafricareport.com/feed/" },
    { url: "https://www.dailymaverick.co.za/", name: "Daily Maverick", rssUrl: "https://www.dailymaverick.co.za/feed/" },
    { url: "https://www.premiumtimesng.com/", name: "Premium Times Nigeria", rssUrl: "https://www.premiumtimesng.com/feed" },
];

const MEDIUM_SOURCES = [
    "https://medium.com/tag/africa/recommended",
    "https://medium.com/tag/geopolitics/recommended",
    "https://medium.com/tag/african-development/recommended"
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
                    isoCode: { type: "string", description: "3-letter ISO code for the primary African country this article relates to." },
                    actor: { type: "string", enum: ["China", "United States", "EU / CBAM", "Russia", "IMF / World Bank", "France", "Gulf States", "UK", ""] },
                    timeAgo: { type: "string" }
                },
                required: ["title", "summary", "severity", "category", "isoCode", "timeAgo"]
            }
        }
    },
    required: ["articles"]
};

// ... utility functions ...
async function scrapeWithPhi(url: string, prompt: string, schema: any, inputContent?: string): Promise<any> {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    let content = inputContent;
    if (!content) {
        const jinaUrl = `https://r.jina.ai/${url}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        try {
            const jinaResponse = await fetch(jinaUrl, { headers: { "X-No-Cache": "true" }, signal: controller.signal });
            if (!jinaResponse.ok) throw new Error(`Jina Reader failed: ${jinaResponse.statusText}`);
            content = await jinaResponse.text();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    const systemPrompt = `You are a professional data extractor. Extract the following information from the provided text and return it as a VALID JSON object matching this schema: ${JSON.stringify(schema)}. \n\nInstruction: ${prompt}\n\nText to process:\n${content.substring(0, 30000)}`;

    const response = await foundry.chat.completions.create({
        model: FOUNDRY_MODEL,
        messages: [
            { role: "system", content: "You extract data into JSON format." },
            { role: "user", content: systemPrompt }
        ],
        response_format: { type: "json_object" }
    }, { timeout: 45000 });

    const responseText = response.choices[0].message.content || "{}";
    const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to extract valid JSON from Phi response.");

    return JSON.parse(jsonMatch[0]);
}

async function scrapeFromRSS(sourceName: string, rssUrl: string): Promise<any[]> {
    try {
        const feed = await parser.parseURL(rssUrl);
        return feed.items.slice(0, 3).map((item: any) => ({
            title: item.title,
            summary: (item.contentSnippet || item.summary || item.content || "").substring(0, 300),
            url: item.link,
            source: sourceName
        }));
    } catch (e: any) {
        return [];
    }
}

async function scrapeIntelligenceSource(source: any) {
    let extracted: any[] = [];
    let rssItems: any[] = [];

    const ISO_LIST = Array.from(VALID_ISO_CODES).join(", ");
    const isoInstructions = `IMPORTANT: For isoCode, you MUST use exactly one of these 3-letter codes representing the most prominently mentioned African country: ${ISO_LIST}. If the news is continent-wide, pick the most relevant African country mentioned, or default to 'ZAF' (South Africa) if none are clearly primary. Do not use 'AFR' or non-African codes like 'CHN' or 'USA'.`;

    if (source.rssUrl) {
        rssItems = await scrapeFromRSS(source.name, source.rssUrl);
        if (rssItems.length > 0) {
            const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
            try {
                const prompt = `Classify these ${rssItems.length} news items. For each, determine severity (HIGH/MEDIUM/LOW), category (SOVEREIGNTY RISK/OUTSIDE INFLUENCE), and country ISO code.\n${isoInstructions}`;
                const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA, rssContent);
                extracted = (result.articles || []).map((c: any) => ({ ...c, source: source.name }));
            } catch (e) {
                // ignore
            }
        }
    }

    if (extracted.length === 0) {
        try {
            const prompt = `Extract top 3 latest news articles from this page about African geopolitics/economy. Classify severity, category, and country (ISO code).\n${isoInstructions}`;
            const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
            extracted = result.articles || [];
        } catch (e) {
            // ignore
        }
    }

    if (extracted.length === 0 && firecrawl) {
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
                extracted = extractedArticles;
            }
        } catch (e) {
            // ignore
        }
    }

    return extracted
        .map((a: any) => ({
            ...a,
            source: source.name,
            isoCode: (a.isoCode || "").toUpperCase().trim(),
            actor: a.actor || null
        }))
        .filter((a: any) => VALID_ISO_CODES.has(a.isoCode));
}

async function scrapeBlogSource(url: string) {
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

    let extracted: any[] = [];
    const tag = url.split('/').slice(-2, -1)[0] || 'africa';
    const rssUrl = `https://medium.com/feed/tag/${tag}`;
    const rssItems = await scrapeFromRSS("Medium", rssUrl);

    if (rssItems.length > 0) {
        const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
        try {
            const result = await scrapeWithPhi(url, "Classify these blog posts. JSON with title, summary, author, and tag.", blogSchema, rssContent);
            const posts = result.posts || [];
            if (posts.length > 0) {
                extracted = posts.map((p: any, i: number) => ({ ...p, url: rssItems[i]?.url || url }));
            }
        } catch (e) {
            // ignore
        }
    }

    if (extracted.length === 0) {
        try {
            const result = await scrapeWithPhi(url, "Extract top 3 blog posts about African development/geopolitics. JSON with title, summary, author, and tag.", blogSchema);
            const posts = result.posts || [];
            if (posts.length > 0) {
                extracted = posts.map((p: any) => ({ ...p, url: p.url || url }));
            }
        } catch (e) {
            // ignore
        }
    }

    if (extracted.length === 0 && firecrawl) {
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
                extracted = extractedPosts.map((p: any) => ({ ...p, url: p.url || url }));
            }
        } catch (e) {
            // ignore
        }
    }

    return extracted.map((p: any) => ({
        title: p.title,
        summary: p.summary,
        author: p.author,
        tag: p.tag,
        url: p.url
    }));
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    // For local dev/testing, allow without CRON_SECRET if it's not set
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    try {
        // Run all intelligence scraping in parallel
        const intelResults = await Promise.allSettled(INTEL_SOURCES.map(scrapeIntelligenceSource));
        const allIntel = intelResults
            .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
            .flatMap(r => r.value)
            .filter(a => a.title);

        // Deduplicate locally just in case before upserting
        const uniqueIntelMap = new Map();
        for (const item of allIntel) {
            uniqueIntelMap.set(item.title.toLowerCase().trim(), item);
        }
        const uniqueIntel = Array.from(uniqueIntelMap.values());

        if (uniqueIntel.length > 0) {
            // UPSERT over title based constraint. If unique constraint exists, it will update/ignore.
            const { error: intelError } = await supabase.from('intelligence_alerts')
                .upsert(uniqueIntel, { onConflict: 'title', ignoreDuplicates: true });
            if (intelError) {
                console.error("Failed to upsert intelligence:", intelError);
            }
        }

        // Run all blog scraping in parallel
        const blogResults = await Promise.allSettled(MEDIUM_SOURCES.map(scrapeBlogSource));
        const allBlogs = blogResults
            .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
            .flatMap(r => r.value)
            .filter(a => a.url);

        const uniqueBlogMap = new Map();
        for (const item of allBlogs) {
            if (item.url) uniqueBlogMap.set(item.url, item);
        }
        const uniqueBlogs = Array.from(uniqueBlogMap.values());

        if (uniqueBlogs.length > 0) {
            // UPSERT over url based constraint.
            const { error: blogError } = await supabase.from('blog_posts')
                .upsert(uniqueBlogs, { onConflict: 'url', ignoreDuplicates: true });

            if (blogError) {
                console.error("Failed to upsert blogs:", blogError);
            }
        }

        return NextResponse.json({
            success: true,
            intelScraped: uniqueIntel.length,
            blogsScraped: uniqueBlogs.length
        });

    } catch (e: any) {
        console.error("Scraper Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
