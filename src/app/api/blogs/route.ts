import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
    getFreshnessMetadata,
    getLatestTimestamp,
    type DataMode,
} from "@/lib/intelligence/trust";
import {
    getTrustedPublishedRecords,
    recordRetrievalTimestamp,
    trustedSnapshotUnavailable,
} from "@/lib/intelligence/publication-selection.server";

export const dynamic = "force-dynamic";
export const revalidate = 300; // Cache for 5 minutes

const FALLBACK_BLOGS = [
    {
        title: "Why AfCFTA Could Be Africa's Greatest Economic Lever",
        summary: "Analysis of how the continental free trade agreement is reshaping intra-African commerce and reducing dependency on external markets.",
        author: "Dr. Folasade Akinwale",
        tag: "AfCFTA Trade",
        url: "https://medium.com/search?q=AfCFTA+Africa",
        imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "The New Scramble for Africa's Critical Minerals",
        summary: "How DRC, Zambia, and Zimbabwe are learning from Indonesia's nickel playbook to capture more value from lithium and cobalt.",
        author: "James Mwangi",
        tag: "Resource Sovereignty",
        url: "https://medium.com/search?q=DRC+cobalt+lithium",
        imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Digital Bank: Can Africa Build Its Own Financial Rails?",
        summary: "PAPSS, e-Naira, and the push for a Pan-African payment system that bypasses SWIFT and dollar dependency.",
        author: "Amina Osei",
        tag: "Digital Economy",
        url: "https://medium.com/search?q=PAPSS+Africa+banking",
        imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Belt & Road vs. Build Back Better: Africa Caught Between Superpowers",
        summary: "Mapping the competing infrastructure investment frameworks and their implications for African debt sustainability.",
        author: "Chen Wei-Lin",
        tag: "Foreign Influence",
        url: "https://medium.com/search?q=Africa+Belt+and+Road+debt",
        imageUrl: "https://images.unsplash.com/photo-1493946740624-75b8429e3e9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Dangote Effect: How One Refinery Is Rewriting Nigeria's Oil Story",
        summary: "The 650K bpd Lagos refinery signals a shift from raw export dependency to domestic value-add processing.",
        author: "Okonkwo Emeka",
        tag: "Infrastructure",
        url: "https://medium.com/search?q=Dangote+Refinery+petrol",
        imageUrl: "https://images.unsplash.com/photo-1544256223-746768a41981?q=80&w=400&auto=format&fit=crop"
    }
];

const FALLBACK_OBSERVED_AT = "2026-03-06T15:05:28.000Z";
type BlogRow = Record<string, unknown>;

function decorateItems(items: BlogRow[], requestedMode: "live" | "fallback") {
    return items.map((item, index) => {
        const fallback = FALLBACK_BLOGS[index % FALLBACK_BLOGS.length];
        const sourceUpdatedAt =
            item.sourceUpdatedAt ??
            item.source_updated_at ??
            item.sourcePublishedAt ??
            item.source_published_at ??
            item.published_at ??
            null;
        const retrievedAt = recordRetrievalTimestamp(item);
        const observedAt =
            item.observedAt ??
            item.observed_at ??
            retrievedAt ??
            FALLBACK_OBSERVED_AT;
        const freshness = getFreshnessMetadata({
            sourceUpdatedAt,
            observedAt,
            dataset: "blog",
            requestedMode,
        });
        const publisher =
            typeof item.source === "string"
                ? item.source
                : typeof item.author === "string"
                    ? item.author
                    : "AXIS editorial fallback";
        const sourceUrl = typeof item.url === "string" ? item.url : null;

        return {
            ...item,
            imageUrl: item.imageUrl || fallback.imageUrl,
            source: publisher,
            created_at: item.created_at ?? freshness.observedAt,
            ...freshness,
            freshness,
            provenance: {
                publisher,
                sourceUrl,
                sourcePublishedAt: freshness.sourceUpdatedAt,
                observedAt: freshness.observedAt,
                retrievedAt,
            },
        };
    });
}

export async function GET() {
    const generatedAt = new Date().toISOString();
    let source = "legacy/static";
    let publicationTier: "trusted" | "legacy" = "legacy";
    let fallbackUsed = true;
    let requestedMode: "live" | "fallback" = "fallback";
    let rows: BlogRow[] = FALLBACK_BLOGS;

    const trustedRows = await getTrustedPublishedRecords("blog", 10);
    if (
        trustedSnapshotUnavailable(trustedRows)
    ) {
        return NextResponse.json(
            {
                success: false,
                source: "trusted/unavailable",
                publicationTier: "trusted",
                fallbackUsed: false,
                dataMode: "stale",
                generatedAt,
                data: [],
                error: "No trusted blog snapshot is available.",
            },
            { status: 503 },
        );
    }
    if (trustedRows) {
        source = "trusted";
        publicationTier = "trusted";
        fallbackUsed = false;
        requestedMode = "live";
        rows = trustedRows;
    } else {
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (data && data.length > 0) {
                source = "legacy/supabase";
                fallbackUsed = false;
                requestedMode = "live";
                rows = data;
            }
        } catch (error) {
            console.error("Supabase Blog Fetch Error:", error);
            source = "legacy/static-error";
        }
    }

    const data = decorateItems(rows, requestedMode).map((item) => ({
        ...item,
        publicationTier,
        fallbackUsed,
    }));
    const sourceUpdatedAt = getLatestTimestamp(data.map((record) => record.sourceUpdatedAt));
    const observedAt = getLatestTimestamp(data.map((record) => record.observedAt));
    const dataMode: DataMode = getFreshnessMetadata({
        sourceUpdatedAt,
        observedAt,
        dataset: "blog",
        requestedMode,
    }).dataMode;
    const asOf = sourceUpdatedAt ?? observedAt;
    const freshness = { dataMode, sourceUpdatedAt, observedAt, asOf };

    return NextResponse.json({
        success: true,
        source,
        publicationTier,
        fallbackUsed,
        dataMode,
        generatedAt,
        sourceUpdatedAt,
        observedAt,
        asOf,
        freshness,
        updatedAt: asOf,
        timestamp: generatedAt,
        data,
    });
}
