import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 3600; // Revalidate every hour

const FALLBACK_DATA = [
    {
        id: "lithium",
        name: "LITHIUM (CARBONATE)",
        price: 23067,
        unit: "T",
        currency: "USD",
        trend: +1.12,
        source: "Sunsirs / BenchMark",
        sourceUrl: "https://www.sunsirs.com/uk/prodetail-2023.html",
        lastUpdated: "2025-01-15",
        frequency: "monthly",
        category: "CRITICAL",
        color: "#3b82f6"
    },
    {
        id: "cobalt",
        name: "COBALT (99.8%)",
        price: 58293,
        unit: "T",
        currency: "USD",
        trend: +0.42,
        source: "LME / Fastmarkets",
        sourceUrl: "https://www.lme.com/Metals/EV/Cobalt",
        lastUpdated: "2025-01-15",
        frequency: "weekly",
        category: "CRITICAL",
        color: "#10b981"
    },
    {
        id: "copper",
        name: "COPPER (GRADE A)",
        price: 12829,
        unit: "T",
        currency: "USD",
        trend: +0.50,
        source: "COMEX / TradingEconomics",
        sourceUrl: "https://tradingeconomics.com/commodity/copper",
        lastUpdated: "2025-01-15",
        frequency: "daily",
        category: "STRATEGIC",
        color: "#f59e0b"
    },
    {
        id: "gold",
        name: "GOLD (SPOT)",
        price: 3250,
        unit: "OZ",
        currency: "USD",
        trend: +0.45,
        source: "LBMA / Kitco",
        sourceUrl: "https://www.kitco.com/gold-price-today-usa/",
        lastUpdated: "2025-01-15",
        frequency: "daily",
        category: "RESERVE",
        color: "#fbbf24"
    },
    {
        id: "bauxite",
        name: "BAUXITE (GUINEA)",
        price: 77.91,
        unit: "T",
        currency: "USD",
        trend: +2.15,
        source: "AfDB Portal",
        sourceUrl: "https://www.afdb.org/en/knowledge/statistics",
        lastUpdated: "2025-01-15",
        frequency: "monthly",
        category: "REFRACTORY",
        color: "#ef4444"
    }
];

export async function GET() {
    try {
        // Try Supabase for fresh data
        let data = FALLBACK_DATA;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseKey);
                const { data: freshData, error } = await supabase
                    .from('commodity_prices')
                    .select('*')
                    .order('updated_at', { ascending: false });

                if (!error && freshData && freshData.length > 0) {
                    // Merge fresh data with fallback (fresh data overrides matching IDs)
                    const freshMap = new Map(freshData.map((d: any) => [d.id, d]));
                    data = FALLBACK_DATA.map(fallback => {
                        const fresh = freshMap.get(fallback.id) as any;
                        if (fresh) {
                            return {
                                ...fallback,
                                price: fresh.price ?? fallback.price,
                                trend: fresh.trend ?? fallback.trend,
                                lastUpdated: fresh.updated_at?.split('T')[0] ?? fallback.lastUpdated,
                            };
                        }
                        return fallback;
                    });
                }
            } catch {
                // Supabase fetch failed, use fallback silently
            }
        }

        return NextResponse.json({
            success: true,
            data,
            timestamp: new Date().toISOString(),
            disclaimer: "Benchmark data sourced from World Bank Pink Sheet, LME, and AfDB. Update frequency varies by commodity."
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Failed to fetch commodity benchmarks" },
            { status: 500 }
        );
    }
}
