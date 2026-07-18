import { NextResponse } from "next/server";
import {
    getFreshnessMetadata,
    getLatestTimestamp,
    type DataMode,
} from "@/lib/intelligence/trust";
import {
    recordRetrievalTimestamp,
    selectIntelligencePublications,
    trustedSnapshotUnavailable,
} from "@/lib/intelligence/publication-selection.server";
import { getPublicationPresentation } from "@/lib/intelligence/publication-health";

export const dynamic = "force-dynamic";
export const revalidate = 60; // Cache for 1 minute at the edge

const FALLBACK_DATA = [
    {
        title: "DRC COBALT EXPORT BAN ENFORCEMENT",
        summary: "DRC government enforces ban on raw cobalt exports, mandating domestic processing to capture more value from its critical mineral reserves.",
        severity: "HIGH",
        category: "SOVEREIGNTY RISK",
        isoCode: "COD",
        timeAgo: "4 HRS AGO",
        source: "Reuters",
        url: "https://www.reuters.com/site-search/?query=DRC+cobalt+ban",
        imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "IMF STRUCTURAL ADJUSTMENT IN GHANA",
        summary: "IMF conditions bailout on privatization of state energy assets, raising concerns over sovereignty of critical infrastructure.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "GHA",
        timeAgo: "6 HRS AGO",
        source: "Al Jazeera",
        url: "https://www.aljazeera.com/search/IMF%20Ghana",
        imageUrl: "https://images.unsplash.com/photo-1523456760081-306915f79927?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "CHINA SECURES KENYAN PORT EXPANSION",
        summary: "New BRI-funded port expansion at Mombasa increases trade capacity but adds $2.1B to sovereign debt.",
        severity: "MEDIUM",
        category: "OUTSIDE INFLUENCE",
        isoCode: "KEN",
        timeAgo: "8 HRS AGO",
        source: "Bloomberg",
        url: "https://www.bloomberg.com/search?query=Kenya%20port%20expansion",
        imageUrl: "https://images.unsplash.com/photo-1493946740624-75b8429e3e9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "ZAMBIA DEBT RESTRUCTURING FINALIZED",
        summary: "Zambia successfully completes historic $3B debt restructuring with international bondholders under the G20 Common Framework.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "ZMB",
        timeAgo: "10 HRS AGO",
        source: "Financial Times",
        url: "https://www.ft.com/search?q=Zambia+debt+restructuring",
        imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "EU CBAM IMPACTS SOUTH AFRICAN EXPORTS",
        summary: "EU Carbon Border Adjustment Mechanism expected to sharply reduce South African steel and aluminum export competitiveness.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "ZAF",
        timeAgo: "11 HRS AGO",
        source: "News24",
        url: "https://www.news24.com/news24/search?query=EU+CBAM+South+Africa",
        imageUrl: "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "NIGERIA DANGOTE REFINERY SCALES",
        summary: "Dangote Refinery ramps up domestic petrol production, significantly reducing West Africa's dependency on imported European fuels.",
        severity: "HIGH",
        category: "SOVEREIGNTY RISK",
        isoCode: "NGA",
        timeAgo: "14 HRS AGO",
        source: "Vanguard",
        url: "https://www.vanguardngr.com/?s=Dangote+Refinery",
        imageUrl: "https://images.unsplash.com/photo-1544256223-746768a41981?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "RWANDA TECH HUB EXPANSION",
        summary: "Kigali Innovation City attracts $500M in African-led venture capital, positioning Rwanda as a leading tech hub.",
        severity: "LOW",
        category: "SOVEREIGNTY RISK",
        isoCode: "RWA",
        timeAgo: "16 HRS AGO",
        source: "TechCrunch",
        url: "https://techcrunch.com/search/Rwanda+tech",
        imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "FRANCE WITHDRAWS FROM NIGER URANIUM",
        summary: "Orano ceases uranium extraction operations in Niger after the military government revokes mining licenses.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "NER",
        timeAgo: "18 HRS AGO",
        source: "France24",
        url: "https://www.france24.com/en/search/Niger+uranium",
        imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "NAMIBIA LITHIUM PROCESSING LAW",
        summary: "Namibian parliament debates legislation requiring 50% state ownership in new corporate lithium mining ventures.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "NAM",
        timeAgo: "22 HRS AGO",
        source: "AllAfrica",
        url: "https://allafrica.com/search/index.html?search-string=Namibia+lithium",
        imageUrl: "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "US AGOA EXPIRATION LOOMS",
        summary: "African manufacturers brace for potential tariff hikes as US Congress stalls on reauthorizing the AGOA act.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "KEN",
        timeAgo: "24 HRS AGO",
        source: "The EastAfrican",
        url: "https://www.theeastafrican.co.ke/tea/search?query=AGOA",
        imageUrl: "https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?q=80&w=400&auto=format&fit=crop"
    }
];

const FALLBACK_OBSERVED_AT = "2026-03-06T15:05:28.000Z";
type IntelligenceRow = Record<string, unknown>;

function fallbackSourceUpdatedAt(timeAgo: string) {
    const hours = Number.parseInt(timeAgo, 10);
    return new Date(
        Date.parse(FALLBACK_OBSERVED_AT) - (Number.isFinite(hours) ? hours : 0) * 60 * 60 * 1_000,
    ).toISOString();
}

function formatAge(asOf: string | null, generatedAt: string) {
    if (!asOf) return "UNKNOWN AGE";
    const hours = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(asOf)) / 3_600_000));
    if (hours < 24) return `${hours} HRS AGO`;
    return `${Math.floor(hours / 24)} DAYS AGO`;
}

function decorateItems(items: IntelligenceRow[], requestedMode: "live" | "fallback", generatedAt: string) {
    return items.map((item, index) => {
        const fallback = FALLBACK_DATA[index % FALLBACK_DATA.length];
        const fallbackUpdatedAt = requestedMode === "fallback"
            ? fallbackSourceUpdatedAt(String(item.timeAgo ?? ""))
            : null;
        const sourceUpdatedAt =
            item.sourceUpdatedAt ??
            item.source_updated_at ??
            item.sourcePublishedAt ??
            item.source_published_at ??
            item.published_at ??
            fallbackUpdatedAt;
        const retrievedAt = recordRetrievalTimestamp(item);
        const observedAt =
            item.observedAt ??
            item.observed_at ??
            retrievedAt ??
            FALLBACK_OBSERVED_AT;
        const freshness = getFreshnessMetadata({
            sourceUpdatedAt,
            observedAt,
            dataset: "intelligence",
            requestedMode,
        });
        const publisher = typeof item.source === "string" ? item.source : "AXIS fallback snapshot";
        const sourceUrl = typeof item.url === "string" ? item.url : null;

        return {
            ...item,
            imageUrl: item.imageUrl || fallback.imageUrl,
            created_at: item.created_at ?? freshness.observedAt,
            timeAgo: formatAge(freshness.asOf, generatedAt),
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
    let rows: IntelligenceRow[] = FALLBACK_DATA;

    const selection = await selectIntelligencePublications(15);
    if (
        trustedSnapshotUnavailable(selection?.records)
    ) {
        return NextResponse.json(
            {
                success: false,
                source: "trusted/unavailable",
                publicationTier: "trusted",
                fallbackUsed: false,
                dataMode: "stale",
                displayState: getPublicationPresentation({ success: false }).state,
                generatedAt,
                data: [],
                error: "No trusted intelligence snapshot is available.",
            },
            { status: 503 },
        );
    }
    if (selection) {
        source = selection.source;
        publicationTier = selection.publicationTier;
        fallbackUsed = false;
        requestedMode = "live";
        rows = selection.records;
    }

    const data = decorateItems(rows, requestedMode, generatedAt).map((item) => ({
        ...item,
        publicationTier,
    }));
    const sourceUpdatedAt = getLatestTimestamp(data.map((record) => record.sourceUpdatedAt));
    const observedAt = getLatestTimestamp(data.map((record) => record.observedAt));
    const dataMode: DataMode = getFreshnessMetadata({
        sourceUpdatedAt,
        observedAt,
        dataset: "intelligence",
        requestedMode,
    }).dataMode;
    const asOf = sourceUpdatedAt ?? observedAt;
    const freshness = { dataMode, sourceUpdatedAt, observedAt, asOf };
    const displayState = getPublicationPresentation({
        success: true,
        source,
        publicationTier,
        fallbackUsed,
        dataMode,
        generatedAt,
        sourceUpdatedAt,
        observedAt,
    }).state;

    return NextResponse.json({
        success: true,
        source,
        publicationTier,
        fallbackUsed,
        dataMode,
        displayState,
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
