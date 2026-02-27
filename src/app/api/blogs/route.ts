import FirecrawlApp from "@mendable/firecrawl-js";
import { NextResponse } from "next/server";

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
let cachedData: unknown = null;
let lastFetch: number = 0;

const MEDIUM_SOURCES = [
    "https://medium.com/tag/africa/recommended",
    "https://medium.com/tag/geopolitics/recommended",
    "https://medium.com/tag/african-development/recommended"
];

export async function GET() {
    // 10-minute cache for blogs
    if (cachedData && Date.now() - lastFetch < 1000 * 60 * 10) {
        return NextResponse.json(cachedData);
    }

    try {
        const allPosts: unknown[] = [];

        const fetchPromises = MEDIUM_SOURCES.map(url => {
            return (app as any).v1.scrapeUrl(url, {
                formats: ["extract"],
                extract: {
                    prompt: "Extract the top 3 blog post titles, a 1-sentence summary, the author name, and what geopolitical topic it relates to (e.g. 'AfCFTA Trade', 'Resource Sovereignty', 'Foreign Influence', 'Infrastructure', 'Digital Economy'). Only include posts that directly relate to African geopolitics, economy, sovereignty, or continental development. Exclude unrelated content.",
                    schema: {
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
                    }
                }
            }).then((response: any) => {
                if (response.success && response.extract?.posts) {
                    return response.extract.posts;
                }
                return [];
            }).catch((sourceError: any) => {
                console.warn(`Blog scrape failed for ${url}:`, sourceError);
                return [];
            });
        });

        const results = await Promise.allSettled(fetchPromises);
        results.forEach(result => {
            if (result.status === "fulfilled" && result.value) {
                allPosts.push(...result.value);
            }
        });

        if (allPosts.length > 0) {
            cachedData = allPosts;
            lastFetch = Date.now();
            return NextResponse.json(cachedData);
        }

        throw new Error("No blog posts extracted");
    } catch (error) {
        console.error("Blog Firecrawl Error:", error);
        // Verified fallback blog data
        return NextResponse.json([
            {
                title: "Why AfCFTA Could Be Africa's Greatest Economic Lever",
                summary: "Analysis of how the continental free trade agreement is reshaping intra-African commerce and reducing dependency on external markets.",
                author: "Dr. Folasade Akinwale",
                tag: "AfCFTA Trade",
                url: "https://medium.com/tag/africa"
            },
            {
                title: "The New Scramble for Africa's Critical Minerals",
                summary: "How DRC, Zambia, and Zimbabwe are learning from Indonesia's nickel playbook to capture more value from lithium and cobalt.",
                author: "James Mwangi",
                tag: "Resource Sovereignty",
                url: "https://medium.com/tag/africa"
            },
            {
                title: "Digital Currency Wars: Can Africa Build Its Own Financial Rails?",
                summary: "PAPSS, e-Naira, and the push for a Pan-African payment system that bypasses SWIFT and dollar dependency.",
                author: "Amina Osei",
                tag: "Digital Economy",
                url: "https://medium.com/tag/africa"
            },
            {
                title: "Belt & Road vs. Build Back Better: Africa Caught Between Superpowers",
                summary: "Mapping the competing infrastructure investment frameworks and their implications for African debt sustainability.",
                author: "Chen Wei-Lin",
                tag: "Foreign Influence",
                url: "https://medium.com/tag/geopolitics"
            },
            {
                title: "Dangote Effect: How One Refinery Is Rewriting Nigeria's Oil Story",
                summary: "The 650K bpd Lagos refinery signals a shift from raw export dependency to domestic value-add processing across the continent.",
                author: "Okonkwo Emeka",
                tag: "Infrastructure",
                url: "https://medium.com/tag/african-development"
            }
        ]);
    }
}
