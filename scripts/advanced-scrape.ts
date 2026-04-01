import FirecrawlApp from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Parser from "rss-parser";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

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
                    timeAgo: { type: "string" },
                    url: { type: "string" },
                    imageUrl: { type: "string" }
                },
                required: ["title", "summary", "severity", "category", "isoCode", "timeAgo"]
            }
        }
    },
    required: ["articles"]
};

async function scrapeWithPhi(url: string, prompt: string, schema: any, inputContent?: string): Promise<any> {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    let content = inputContent;
    if (!content) {
        const jinaUrl = `https://r.jina.ai/${url}`;
        try {
            const jinaResponse = await fetch(jinaUrl, { headers: { "X-No-Cache": "true" } });
            if (!jinaResponse.ok) throw new Error(`Jina Reader failed: ${jinaResponse.statusText}`);
            content = await jinaResponse.text();
        } catch (e) {
            console.error(`Jina failed for ${url}`, e);
            throw e;
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
    });

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
    console.log(`Scraping Intelligence: ${source.name}...`);
    let extracted: any[] = [];
    let rssItems: any[] = [];

    const ISO_LIST = Array.from(VALID_ISO_CODES).join(", ");
    const isoInstructions = `IMPORTANT: For isoCode, you MUST use exactly one of these 3-letter codes: ${ISO_LIST}.`;
    
    // ** PRIMARY ROUTE: FIRECRAWL (High quality, handles JS/Cloudflare) **
    if (firecrawl) {
        try {
            console.log(`🚀 Attempting Firecrawl extract for ${source.name}...`);
            const response: any = await firecrawl.scrapeUrl(source.url, {
                formats: ["extract"],
                extract: { prompt: `Extract top 3 articles.\n${isoInstructions}`, schema: EXTRACT_SCHEMA as any }
            });
            
            if (response && response.success === false) {
                throw new Error("Firecrawl returned success false (Credits exhausted?)");
            }
            
            extracted = response?.extract?.articles || [];
            if (extracted.length > 0) {
                console.log(`✅ Firecrawl succeeded for ${source.name}!`);
            }
        } catch (e: any) { 
            console.error(`⚠️ Firecrawl fallback triggered for ${source.name}: ${e.message}`);
            extracted = []; 
        }
    }

    // ** FALLBACK 1: RSS + PHI-4 **
    if (extracted.length === 0 && source.rssUrl) {
        console.log(`🔄 Fallback 1: Using RSS + Phi-4 for ${source.name}...`);
        rssItems = await scrapeFromRSS(source.name, source.rssUrl);
        if (rssItems.length > 0) {
            const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
            try {
                const prompt = `Classify these news items.\n${isoInstructions}`;
                const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA, rssContent);
                extracted = (result.articles || []).map((c: any, i: number) => ({
                    ...c,
                    source: source.name,
                    url: c.url || rssItems[i]?.url || source.url
                }));
            } catch (e) { console.error(`Phi failed for RSS ${source.name}`); }
        }
    }

    // ** FALLBACK 2: JINA READER + PHI-4 **
    if (extracted.length === 0) {
        console.log(`🔄 Fallback 2: Using Jina Reader + Phi-4 for COVID ${source.name}...`);
        try {
            const prompt = `Extract top 3 articles.\n${isoInstructions}`;
            const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
            extracted = result.articles || [];
        } catch (e) { console.error(`Phi failed for direct scrape ${source.name}`); }
    }

    return extracted
        .map((a: any) => ({
            ...a,
            source: source.name,
            isoCode: (a.isoCode || "").toUpperCase().trim(),
            category: ["SOVEREIGNTY RISK", "OUTSIDE INFLUENCE"].includes(a.category) ? a.category : "SOVEREIGNTY RISK",
            severity: ["HIGH", "MEDIUM", "LOW"].includes(a.severity) ? a.severity : "MEDIUM",
            actor: a.actor === "N/A" || a.actor === "NONE" ? null : (a.actor || null),
            created_at: new Date().toISOString()
        }))
        .filter((a: any) => VALID_ISO_CODES.has(a.isoCode));
}

async function scrapeBlogSource(url: string) {
    console.log(`Scraping Blog: ${url}...`);
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
    
    // ** PRIMARY ROUTE: FIRECRAWL **
    if (firecrawl) {
        try {
            const response: any = await firecrawl.scrapeUrl(url, {
                formats: ["extract"],
                extract: { prompt: "Extract blog posts.", schema: blogSchema as any }
            });
            if (response && response.success !== false) {
                extracted = (response?.extract?.posts || []).map((p: any) => ({ ...p, url: p.url || url }));
            }
        } catch (e: any) { 
            console.error(`⚠️ Firecrawl failed for blog ${url}. Falling back...`);
        }
    }

    const tag = url.split('/').slice(-2, -1)[0] || 'africa';
    const rssUrl = `https://medium.com/feed/tag/${tag}`;
    const rssItems = await scrapeFromRSS("Medium", rssUrl);

    // ** FALLBACK 1 **
    if (extracted.length === 0 && rssItems.length > 0) {
        const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
        try {
            const result = await scrapeWithPhi(url, "Classify blog posts.", blogSchema, rssContent);
            extracted = (result.posts || []).map((p: any, i: number) => ({ ...p, url: rssItems[i]?.url || url }));
        } catch (e) { console.error(`Phi failed for Blog RSS ${url}`); }
    }

    // ** FALLBACK 2 **
    if (extracted.length === 0) {
        try {
            const result = await scrapeWithPhi(url, "Extract blog posts.", blogSchema);
            extracted = (result.posts || []).map((p: any) => ({ ...p, url: p.url || url }));
        } catch (e) { console.error(`Phi failed for Blog direct ${url}`); }
    }

    return extracted.map((p: any) => ({ ...p, created_at: new Date().toISOString() }));
}

async function main() {
    if (!supabase) { console.error("Supabase not set"); return; }
    console.log("Starting Advanced Scrape (Firecrawl Primary, Phi-4/Jina Fallback)...");

    const intelResults = await Promise.allSettled(INTEL_SOURCES.map(scrapeIntelligenceSource));
    const allIntel = intelResults
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

    const uniqueIntel = Array.from(new Map(allIntel.map(item => [item.title, item])).values());
    if (uniqueIntel.length > 0) {
        const titles = uniqueIntel.map(i => i.title);
        await supabase.from('intelligence_alerts').delete().in('title', titles);
        const { error } = await supabase.from('intelligence_alerts').insert(uniqueIntel);
        console.log(`Upserted ${uniqueIntel.length} advanced alerts. Error:`, error);
    }

    const blogResults = await Promise.allSettled(MEDIUM_SOURCES.map(scrapeBlogSource));
    const allBlogs = blogResults
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

    const uniqueBlogs = Array.from(new Map(allBlogs.map(item => [item.url, item])).values());
    if (uniqueBlogs.length > 0) {
        const urls = uniqueBlogs.map(b => b.url);
        await supabase.from('blog_posts').delete().in('url', urls);
        const { error } = await supabase.from('blog_posts').insert(uniqueBlogs);
        console.log(`Upserted ${uniqueBlogs.length} advanced blogs. Error:`, error);
    }

    console.log("Advanced scramble complete.");
}

main();
