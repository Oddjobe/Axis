import FirecrawlApp from '@mendable/firecrawl-js';

const app = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY
});

async function main() {
    console.log("Starting Firecrawl Scrape...");
    try {
        const result = await app.scrapeUrl("https://www.theeastafrican.co.ke/tea/business", {
            formats: ['extract'],
            extract: {
                prompt: "Extract top 2 latest news articles about trade, mining, or foreign policy.",
                schema: {
                    type: "object",
                    properties: {
                        articles: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    summary: { type: "string" }
                                },
                                required: ["title", "summary"]
                            }
                        }
                    },
                    required: ["articles"]
                }
            }
        });

        console.log("Extraction Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Scrape Error:", e);
    }
}

main().catch(console.error);
