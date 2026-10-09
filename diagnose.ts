import FirecrawlApp from "@mendable/firecrawl-js";
import OpenAI from "openai";
import Parser from "rss-parser";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_MODEL = process.env.FOUNDRY_MODEL;

const parser = new Parser();
const firecrawl = FIRECRAWL_API_KEY ? new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY }) : null;
const foundry = (FOUNDRY_API_KEY && FOUNDRY_ENDPOINT)
    ? new OpenAI({ apiKey: FOUNDRY_API_KEY, baseURL: FOUNDRY_ENDPOINT })
    : null;

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

type FirecrawlScrapeOptions = NonNullable<Parameters<FirecrawlApp["scrapeUrl"]>[1]>;
type FirecrawlExtractOptions = NonNullable<FirecrawlScrapeOptions["extract"]>;

const VALID_ISO_CODES = new Set([
    "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD", "COM", "COD", "COG", "CIV",
    "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR",
    "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN",
    "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE"
]);

interface ExtractedArticle {
    title?: string;
    summary?: string;
    severity?: string;
    category?: string;
    isoCode?: string;
    actor?: string | null;
    timeAgo?: string;
    url?: string;
    imageUrl?: string;
    source?: string;
}

interface ArticleExtraction {
    articles?: ExtractedArticle[];
}

interface IntelligenceSource {
    url: string;
    name: string;
    rssUrl?: string;
}

interface RssArticle {
    title?: string;
    summary: string;
    url?: string;
    source: string;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function scrapeWithPhi(
    url: string,
    prompt: string,
    schema: Record<string, unknown>,
    inputContent?: string
): Promise<ArticleExtraction> {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    let content = inputContent;
    if (!content) {
        console.log(`[Jina] Fetching ${url}`);
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

    return JSON.parse(jsonMatch[0]) as ArticleExtraction;
}

async function scrapeFromRSS(sourceName: string, rssUrl: string): Promise<RssArticle[]> {
    try {
        console.log(`[RSS] Fetching ${rssUrl}`);
        const feed = await parser.parseURL(rssUrl);
        return feed.items.slice(0, 10).map(item => ({
            title: item.title,
            summary: (item.contentSnippet || item.summary || item.content || "").substring(0, 300),
            url: item.link,
            source: sourceName
        }));
    } catch (error: unknown) {
        console.log(`[RSS] Error: ${errorMessage(error)}`);
        return [];
    }
}

async function diagnoseSource(source: IntelligenceSource) {
    let extracted: ExtractedArticle[] = [];
    let rssItems: RssArticle[] = [];

    if (source.rssUrl) {
        rssItems = await scrapeFromRSS(source.name, source.rssUrl);
        console.log(`[Diagnose] Found ${rssItems.length} RSS items for ${source.name}`);
        if (rssItems.length > 0) {
            console.log(rssItems.map(i => i.title));
            const rssContent = rssItems.map(item => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`).join("\n---\n");
            try {
                const prompt = `Classify these ${rssItems.length} news items. For each, determine severity (HIGH/MEDIUM/LOW), category (SOVEREIGNTY RISK/OUTSIDE INFLUENCE), and country ISO code.`;
                const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA, rssContent);
                extracted = (result.articles || []).map(article => ({ ...article, source: source.name }));
                console.log(`[Diagnose] Phi-4 extracted ${extracted.length} from RSS`);
                console.log(JSON.stringify(extracted, null, 2));
            } catch (error: unknown) {
                console.error(`[Diagnose] Phi-4 RSS error:`, errorMessage(error));
            }
        }
    }

    if (extracted.length === 0) {
        try {
            console.log(`[Diagnose] Trying Foundry directly on ${source.url}`);
            const prompt = `Extract top 10 latest news articles from this page about African geopolitics/economy. Classify severity, category, and country (ISO code).`;
            const result = await scrapeWithPhi(source.url, prompt, EXTRACT_SCHEMA);
            extracted = result.articles || [];
            console.log(`[Diagnose] Phi-4 extracted ${extracted.length} from Jina`);
        } catch (error: unknown) {
            console.error(`[Diagnose] Foundry error:`, errorMessage(error));
        }
    }

    if (extracted.length === 0 && firecrawl) {
        try {
            console.log(`[Diagnose] Trying Firecrawl Backup for ${source.name}`);
            const response = await firecrawl.scrapeUrl(source.url, {
                formats: ["extract"],
                extract: {
                    prompt: `Extract top 10 articles about African geopolitics. Classify severity, category, and country. Translate to English.`,
                    schema: EXTRACT_SCHEMA as unknown as FirecrawlExtractOptions["schema"]
                }
            });
            const payload = response as {
                extract?: ArticleExtraction;
                data?: ArticleExtraction;
                articles?: ExtractedArticle[];
            };
            const extractedArticles = payload.extract?.articles || payload.data?.articles || payload.articles;
            if (Array.isArray(extractedArticles) && extractedArticles.length > 0) {
                extracted = extractedArticles;
                console.log(`[Diagnose] Firecrawl extracted ${extracted.length}`);
            } else {
                console.log(`[Diagnose] Firecrawl returned empty or error: ${JSON.stringify(response)}`);
            }
        } catch (fireError: unknown) {
            console.error(`[Diagnose] Firecrawl error:`, errorMessage(fireError));
        }
    }

    const filtered = extracted
        .map(article => ({
            ...article,
            source: source.name,
            isoCode: (article.isoCode || "").toUpperCase().trim(),
            actor: article.actor || null
        }))
        .filter(article => {
            const valid = VALID_ISO_CODES.has(article.isoCode);
            if (!valid) console.log(`[Diagnose] Filtered out ${article.title} because isoCode ${article.isoCode} is invalid`);
            return valid;
        });

    console.log(`[Diagnose] Final for ${source.name}: ${filtered.length} valid items.`);
}

async function run() {
    await diagnoseSource({ url: "https://news.google.com/search?q=Africa", name: "Google News Africa", rssUrl: 'https://news.google.com/rss/search?q=Africa+China+when:24h&hl=en-US&gl=US&ceid=US:en' });
}

run();
