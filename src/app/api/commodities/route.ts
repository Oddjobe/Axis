import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    getFreshnessMetadata,
    getLatestTimestamp,
    type DataMode,
} from '@/lib/intelligence/trust';
import { getTrustedPublishedRecords } from '@/lib/intelligence/publication-selection.server';
import {
    getPublicationCoverage,
    type PublicationCoverage,
} from '@/lib/intelligence/publication-coverage';

export const revalidate = 3600; // Revalidate every hour

// Verified benchmark prices as of April 12, 2026
// Sources: Kitco, LME, TradingEconomics, SunSirs, S&P Global Platts
const FALLBACK_DATA = [
    {
        id: "lithium",
        name: "LITHIUM (CARBONATE)",
        price: 28113,
        unit: "T",
        currency: "USD",
        trend: +3.8,
        source: "SunSirs / Benchmark Mineral",
        sourceUrl: "https://www.sunsirs.com/uk/prodetail-2023.html",
        lastUpdated: "2026-07-16",
        frequency: "weekly",
        category: "CRITICAL",
        color: "#3b82f6"
    },
    {
        id: "cobalt",
        name: "COBALT (99.8%)",
        price: 60050,
        unit: "T",
        currency: "USD",
        trend: +0.0,
        source: "LME / TradingEconomics",
        sourceUrl: "https://tradingeconomics.com/commodity/cobalt",
        lastUpdated: "2026-07-16",
        frequency: "weekly",
        category: "CRITICAL",
        color: "#10b981"
    },
    {
        id: "copper",
        name: "COPPER (GRADE A)",
        price: 12773,
        unit: "T",
        currency: "USD",
        trend: +0.35,
        source: "LME / Westmetall",
        sourceUrl: "https://tradingeconomics.com/commodity/copper",
        lastUpdated: "2026-07-16",
        frequency: "daily",
        category: "STRATEGIC",
        color: "#f59e0b"
    },
    {
        id: "gold",
        name: "GOLD (SPOT)",
        price: 4725,
        unit: "OZ",
        currency: "USD",
        trend: +0.82,
        source: "LBMA / Kitco",
        sourceUrl: "https://www.kitco.com/gold-price-today-usa/",
        lastUpdated: "2026-07-16",
        frequency: "daily",
        category: "RESERVE",
        color: "#fbbf24"
    },
    {
        id: "bauxite",
        name: "BAUXITE (GUINEA FOB)",
        price: 60.99,
        unit: "T",
        currency: "USD",
        trend: -1.5,
        source: "S&P Global Platts / IndexBox",
        sourceUrl: "https://www.spglobal.com/commodityinsights/",
        lastUpdated: "2026-07-16",
        frequency: "monthly",
        category: "REFRACTORY",
        color: "#ef4444"
    }
];

type CommodityRow = Record<string, unknown>;

export function indexNewestCommodityRows(
    rows: readonly CommodityRow[],
): Map<string, CommodityRow> {
    const newestById = new Map<string, CommodityRow>();
    for (const row of rows) {
        if (typeof row.id === "string" && !newestById.has(row.id)) {
            newestById.set(row.id, row);
        }
    }
    return newestById;
}

export function getCommodityTimestamps(
    fresh: CommodityRow | undefined,
    fallbackTimestamp: string,
) {
    const sourceUpdatedAt =
        fresh?.sourcePublishedAt ??
        fresh?.trustedPublishedAt ??
        fresh?.sourceUpdatedAt ??
        fresh?.publishedAt ??
        fresh?.source_published_at ??
        fresh?.trusted_published_at ??
        fresh?.source_updated_at ??
        fresh?.published_at ??
        fresh?.updated_at ??
        fallbackTimestamp;
    const observedAt =
        fresh?.observedAt ??
        fresh?.trustedPublishedAt ??
        fresh?.sourcePublishedAt ??
        fresh?.retrievedAt ??
        fresh?.observed_at ??
        fresh?.retrieved_at ??
        fresh?.trusted_published_at ??
        fresh?.published_at ??
        fresh?.updated_at ??
        fallbackTimestamp;

    return { sourceUpdatedAt, observedAt };
}

function buildRecord(
    fallback: (typeof FALLBACK_DATA)[number],
    fresh: CommodityRow | undefined,
    generatedAt: string,
    trusted: boolean,
) {
    const { sourceUpdatedAt, observedAt } = getCommodityTimestamps(
        fresh,
        fallback.lastUpdated,
    );
    const freshness = getFreshnessMetadata({
        sourceUpdatedAt,
        observedAt,
        dataset: "commodity",
        requestedMode: fresh ? "live" : "fallback",
    });
    const source = typeof fresh?.source === "string" ? fresh.source : fallback.source;
    const sourceUrl = typeof fresh?.source_url === "string" ? fresh.source_url : fallback.sourceUrl;

    return {
        ...fallback,
        price: typeof fresh?.price === "number" ? fresh.price : fallback.price,
        trend: typeof fresh?.trend === "number" ? fresh.trend : fallback.trend,
        source,
        sourceUrl,
        lastUpdated: freshness.sourceUpdatedAt?.split("T")[0] ?? fallback.lastUpdated,
        fallbackUsed: !fresh,
        publicationTier: fresh && trusted ? "trusted" : "legacy",
        ...freshness,
        freshness,
        provenance: {
            publisher: source,
            sourceUrl,
            sourcePublishedAt: freshness.sourceUpdatedAt,
            observedAt: freshness.observedAt,
            retrievedAt: generatedAt,
        },
    };
}

export async function GET() {
    const generatedAt = new Date().toISOString();
    let freshMap = new Map<string, CommodityRow>();
    let source = "legacy/static";
    let publicationTier: "trusted" | "mixed" | "legacy" = "legacy";
    let coverageMode: "trusted" | "partial" | "legacy" = "legacy";
    let trustedCoverage: PublicationCoverage = getPublicationCoverage(
        FALLBACK_DATA.map((item) => item.id),
        [],
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const trustedRows = await getTrustedPublishedRecords("commodity", 100);
    if (trustedRows) {
        const trustedMap = indexNewestCommodityRows(trustedRows);
        trustedCoverage = getPublicationCoverage(
            FALLBACK_DATA.map((item) => item.id),
            trustedMap.keys(),
        );
        if (trustedCoverage.records > 0) {
            freshMap = trustedMap;
            source = trustedCoverage.coverageMode === "trusted"
                ? "trusted"
                : "trusted/partial";
            publicationTier = trustedCoverage.publicationTier;
            coverageMode = trustedCoverage.coverageMode;
        }
    }
    if (freshMap.size === 0 && supabaseUrl && supabaseKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: freshData, error } = await supabase
                .from('commodity_prices')
                .select('*')
                .order('updated_at', { ascending: false });

            if (!error && freshData && freshData.length > 0) {
                freshMap = indexNewestCommodityRows(freshData);
                if (FALLBACK_DATA.some((fallback) => freshMap.has(fallback.id))) {
                    source = "legacy/supabase";
                }
            }
        } catch {
            // Preserve the fixed benchmark snapshot when the live source is unavailable.
        }
    }

    const data = FALLBACK_DATA.map((fallback) =>
        buildRecord(
            fallback,
            freshMap.get(fallback.id),
            generatedAt,
            publicationTier !== "legacy",
        ),
    );
    const fallbackUsed = data.some((record) => record.fallbackUsed);
    const sourceUpdatedAt = getLatestTimestamp(data.map((record) => record.sourceUpdatedAt));
    const observedAt = getLatestTimestamp(data.map((record) => record.observedAt));
    const dataMode: DataMode = getFreshnessMetadata({
        sourceUpdatedAt,
        observedAt,
        dataset: "commodity",
        requestedMode: source === "trusted" && !fallbackUsed ? "live" : "fallback",
    }).dataMode;
    const asOf = sourceUpdatedAt ?? observedAt;
    const freshness = { dataMode, sourceUpdatedAt, observedAt, asOf };

    return NextResponse.json({
        success: true,
        source,
        publicationTier,
        coverageMode,
        trustedCoverage: {
            records: trustedCoverage.records,
            total: trustedCoverage.total,
            ratio: trustedCoverage.ratio,
        },
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
        disclaimer: "Benchmark data sourced from World Bank Pink Sheet, LME, and AfDB. Update frequency varies by commodity."
    });
}
