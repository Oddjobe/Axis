import { createClient } from "@supabase/supabase-js";
import Parser from "rss-parser";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const parser = new Parser();
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const INTEL_SOURCES = [
    { name: "Google News Geopolitics", rssUrl: "https://news.google.com/rss/search?q=Africa+geopolitics+when:24h&hl=en-US&gl=US&ceid=US:en" },
    { name: "Google News Foreign Influence", rssUrl: "https://news.google.com/rss/search?q=Africa+(China+OR+US+OR+Russia)+when:24h&hl=en-US&gl=US&ceid=US:en" },
    { name: "Africanews", rssUrl: "https://www.africanews.com/feed/" }
];

const MEDIUM_SOURCES = [
    { name: "Medium Africa", rssUrl: "https://medium.com/feed/tag/africa" },
    { name: "Medium Geopolitics", rssUrl: "https://medium.com/feed/tag/geopolitics" }
];

const ISO_CODES = ["NGA", "ZAF", "EGY", "KEN", "ETH", "MAR", "DZA", "COD", "GHA", "AGO"];

async function scrapeFromRSS(sourceName: string, rssUrl: string, type: 'intel' | 'blog'): Promise<any[]> {
    try {
        console.log(`Fetching RSS: ${sourceName}...`);
        const feed = await parser.parseURL(rssUrl);
        return feed.items.slice(0, 5).map((item: any, idx: number) => {
            if (type === 'intel') {
                return {
                    title: item.title,
                    summary: (item.contentSnippet || item.summary || item.content || "").substring(0, 300),
                    source: sourceName,
                    severity: "MEDIUM",
                    category: idx % 2 === 0 ? "SOVEREIGNTY RISK" : "OUTSIDE INFLUENCE",
                    isoCode: ISO_CODES[idx % ISO_CODES.length],
                    timeAgo: "1 HR AGO",
                    url: item.link,
                    created_at: new Date().toISOString()
                };
            } else {
                return {
                    title: item.title,
                    summary: (item.contentSnippet || item.summary || item.content || "").substring(0, 300),
                    author: item.creator || item.author || sourceName,
                    tag: "Africa Geopolitics",
                    url: item.link,
                    created_at: new Date().toISOString()
                };
            }
        });
    } catch (e: any) {
        console.error(`RSS failed: ${sourceName}`, e.message);
        return [];
    }
}

async function main() {
    if (!supabase) { console.error("Supabase not set"); return; }
    console.log("Starting fast RSS insert...");

    let allIntel: any[] = [];
    for (const source of INTEL_SOURCES) {
        const items = await scrapeFromRSS(source.name, source.rssUrl, 'intel');
        allIntel = [...allIntel, ...items];
    }

    if (allIntel.length > 0) {
        // Use insert instead of upsert to bypass constraint issues on empty table
        const { error } = await supabase.from('intelligence_alerts').insert(allIntel);
        console.log(`Inserted ${allIntel.length} alerts. Error:`, error);
    }

    let allBlogs: any[] = [];
    for (const source of MEDIUM_SOURCES) {
        const items = await scrapeFromRSS(source.name, source.rssUrl, 'blog');
        allBlogs = [...allBlogs, ...items];
    }

    if (allBlogs.length > 0) {
        const { error } = await supabase.from('blog_posts').insert(allBlogs);
        console.log(`Inserted ${allBlogs.length} blogs. Error:`, error);
    }

    console.log("Fast insert complete.");
}

main();
