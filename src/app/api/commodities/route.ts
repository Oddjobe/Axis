import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    DATASET_TRUST_POLICIES,
    getFreshnessMetadata,
    getLatestTimestamp,
    type DataMode,
} from '@/lib/intelligence/trust';
import {
    getLatestTrustedPublishedRecordsByIdentity,
    recordRetrievalTimestamp,
    trustedPublicationSelectionEnabled,
    trustedSnapshotUnavailable,
} from '@/lib/intelligence/publication-selection.server';
import {
    getPublicationCoverage,
    type PublicationCoverage,
} from '@/lib/intelligence/publication-coverage';
import {
    COMMODITY_IDS,
    type CommodityId,
} from '@/lib/intelligence/ingestion/commodity-sources';

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
        sourceUrl: "https://www.sunsirs.com/uk/prodetail-1162.html",
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

function sourceTimestampValue(row: CommodityRow): number {
    const value =
        row.sourcePublishedAt ??
        row.source_published_at ??
        row.sourceUpdatedAt ??
        row.source_updated_at;
    if (typeof value !== "string" && !(value instanceof Date)) {
        return Number.NEGATIVE_INFINITY;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function publicationTimestampValue(row: CommodityRow): number {
    const value =
        row.trustedPublishedAt ??
        row.trusted_published_at ??
        row.publishedAt ??
        row.published_at ??
        row.updated_at;
    if (typeof value !== "string" && !(value instanceof Date)) {
        return Number.NEGATIVE_INFINITY;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function indexNewestCommodityRows(
    rows: readonly CommodityRow[],
): Map<string, CommodityRow> {
    const newestById = new Map<string, CommodityRow>();
    for (const row of rows) {
        if (typeof row.id !== "string") continue;
        const id = row.id.trim().toLowerCase() as CommodityId;
        if (!COMMODITY_IDS.includes(id)) continue;
        const existing = newestById.get(id);
        const sourceDelta =
            sourceTimestampValue(row) - sourceTimestampValue(existing ?? {});
        const publicationDelta =
            publicationTimestampValue(row) -
            publicationTimestampValue(existing ?? {});
        if (
            !existing ||
            sourceDelta > 0 ||
            (sourceDelta === 0 && publicationDelta > 0)
        ) {
            newestById.set(id, { ...row, id });
        }
    }
    return newestById;
}

export function isFreshTrustedCommodityRow(
    row: CommodityRow,
    now = Date.now(),
): boolean {
    const sourceTimestamp =
        row.sourcePublishedAt ??
        row.source_published_at ??
        row.sourceUpdatedAt ??
        row.source_updated_at;
    if (typeof sourceTimestamp !== "string" && !(sourceTimestamp instanceof Date)) {
        return false;
    }
    const timestamp = new Date(sourceTimestamp).getTime();
    if (!Number.isFinite(timestamp)) return false;
    const ageMs = now - timestamp;
    return ageMs >= 0 && ageMs <= DATASET_TRUST_POLICIES.commodity.maximumAgeMs;
}

export function getCommodityTimestamps(
    fresh: CommodityRow | undefined,
    fallbackTimestamp: string,
) {
    const sourceUpdatedAt =
        fresh?.sourcePublishedAt ??
        fresh?.sourceUpdatedAt ??
        fresh?.source_published_at ??
        fresh?.source_updated_at ??
        fallbackTimestamp;
    const observedAt =
        fresh?.observedAt ??
        fresh?.sourcePublishedAt ??
        fresh?.retrievedAt ??
        fresh?.observed_at ??
        fresh?.source_published_at ??
        fresh?.retrieved_at ??
        fallbackTimestamp;

    return { sourceUpdatedAt, observedAt };
}

export function buildRecord(
    fallback: (typeof FALLBACK_DATA)[number],
    fresh: CommodityRow | undefined,
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
    const sourceUrl =
        typeof fresh?.sourceUrl === "string"
            ? fresh.sourceUrl
            : typeof fresh?.canonicalUrl === "string"
                ? fresh.canonicalUrl
                : typeof fresh?.source_url === "string"
                    ? fresh.source_url
                    : fallback.sourceUrl;
    const retrievedAt = fresh ? recordRetrievalTimestamp(fresh) : null;

    return {
        ...fallback,
        price: typeof fresh?.price === "number" ? fresh.price : fallback.price,
        trend:
            typeof fresh?.trend === "number"
                ? fresh.trend
                : fresh && trusted
                    ? null
                    : fallback.trend,
        source,
        sourceUrl,
        lastUpdated: freshness.sourceUpdatedAt?.split("T")[0] ?? fallback.lastUpdated,
        fallbackUsed:
            !fresh || (!trusted && typeof fresh.trend !== "number"),
        publicationTier: fresh && trusted ? "trusted" : "legacy",
        ...freshness,
        freshness,
        provenance: {
            publisher: source,
            sourceUrl,
            sourcePublishedAt: freshness.sourceUpdatedAt,
            observedAt: freshness.observedAt,
            retrievedAt,
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
        COMMODITY_IDS,
        [],
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const trustedRows = await getLatestTrustedPublishedRecordsByIdentity(
        "commodity",
        COMMODITY_IDS,
    );
    if (
        trustedSnapshotUnavailable(trustedRows)
    ) {
        return NextResponse.json(
            {
                success: false,
                source: "trusted/unavailable",
                publicationTier: "trusted",
                coverageMode: "partial",
                trustedCoverage: {
                    records: 0,
                    total: COMMODITY_IDS.length,
                    ratio: 0,
                    missingIds: [...COMMODITY_IDS],
                },
                fallbackUsed: false,
                dataMode: "stale",
                generatedAt,
                data: [],
                error: "No trusted commodity snapshot is available.",
            },
            { status: 503 },
        );
    }
    if (trustedRows) {
        const trustedMap = indexNewestCommodityRows(
            trustedRows,
        );
        trustedCoverage = getPublicationCoverage(
            COMMODITY_IDS,
            trustedMap.keys(),
        );
        if (
            trustedPublicationSelectionEnabled() &&
            trustedCoverage.records !== COMMODITY_IDS.length
        ) {
            return NextResponse.json(
                {
                    success: false,
                    source: "trusted/incomplete",
                    publicationTier: "trusted",
                    coverageMode: "partial",
                    trustedCoverage,
                    fallbackUsed: false,
                    dataMode: "stale",
                    generatedAt,
                    data: [],
                    error: "The trusted commodity snapshot is incomplete.",
                },
                { status: 503 },
            );
        }
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
            publicationTier !== "legacy",
        ),
    );
    const fallbackUsed = data.some((record) => record.fallbackUsed);
    const missingIds = FALLBACK_DATA
        .map((item) => item.id)
        .filter((id) => !freshMap.has(id) || publicationTier === "legacy");
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
            missingIds,
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
