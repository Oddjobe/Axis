"use client";

import { useEffect, useState } from "react";
import { Clock3, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

type LiveCommodity = {
    id: string;
    name: string;
    price: number;
    unit: string;
    currency: string;
    trend: number | null;
    source: string;
    sourceUpdatedAt?: string | null;
    observedAt?: string | null;
    fallbackUsed?: boolean;
    publicationTier?: "trusted" | "mixed" | "legacy";
};

type CommodityPayload = {
    success: boolean;
    dataMode: string;
    displayState: string;
    asOf: string | null;
    trustedCoverage?: { records: number; total: number };
    data: LiveCommodity[];
};

function sourceTime(value: string | null): string {
    if (!value) return "SOURCE TIME UNAVAILABLE";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "SOURCE TIME UNAVAILABLE";
    return new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    }).format(date).toUpperCase();
}

export default function ContinentalGoalsTicker() {
    const [commodities, setCommodities] = useState<LiveCommodity[]>([]);
    const [asOf, setAsOf] = useState<string | null>(null);
    const [coverage, setCoverage] = useState("0/5");
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch("/api/commodities", {
                    cache: "no-store",
                    headers: { "Cache-Control": "no-cache" },
                });
                const payload = (await response.json()) as CommodityPayload;
                if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
                    throw new Error(`Commodity API returned ${response.status}`);
                }
                const trusted = payload.data.filter(
                    item => item.publicationTier === "trusted" && item.fallbackUsed !== true,
                );
                if (!active) return;
                setCommodities(trusted);
                setAsOf(payload.asOf);
                setCoverage(
                    payload.trustedCoverage
                        ? `${payload.trustedCoverage.records}/${payload.trustedCoverage.total}`
                        : `${trusted.length}/5`,
                );
                setAvailable(payload.dataMode === "live" && trusted.length > 0);
            } catch {
                if (active) setAvailable(false);
            }
        };
        void load();
        const interval = window.setInterval(load, 300_000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

    const displayItems = [...commodities, ...commodities];

    return (
        <footer className="relative flex h-10 shrink-0 items-center overflow-hidden border-t-[1.5px] border-cobalt/40 bg-black/5 font-mono shadow-[0_-5px_20px_rgba(37,99,235,0.05)] transition-all dark:bg-black/40">
            <div className={`absolute inset-y-0 left-0 z-20 flex items-center gap-2 whitespace-nowrap px-4 text-[9px] font-black tracking-wider text-white shadow-[5px_0_15px_rgba(0,0,0,0.5)] ${available ? "bg-emerald-600" : "bg-amber-600"}`}>
                {available ? <ShieldCheck className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                <span>{available ? `TRUSTED LIVE MARKETS ${coverage}` : "MARKET DATA DEGRADED"}</span>
            </div>

            {displayItems.length > 0 ? (
                <div className="flex w-full overflow-hidden">
                    <div className="flex w-max animate-ticker items-center whitespace-nowrap pl-[250px] transition-all hover:[animation-play-state:paused]">
                        {displayItems.map((item, index) => {
                            const rising = (item.trend ?? 0) >= 0;
                            return (
                                <div key={`${item.id}-${index}`} className="mx-6 flex items-center gap-3 text-[10px]">
                                    <span className="text-slate-light/60">[{item.id.toUpperCase()}]</span>
                                    <span className="font-bold tracking-wider text-foreground">{item.name}</span>
                                    <span className={`font-bold tabular-nums ${rising ? "text-emerald-500" : "text-red-500"}`}>
                                        {item.currency} {item.price.toLocaleString("en-US", {
                                            minimumFractionDigits: item.price < 100 ? 2 : 0,
                                            maximumFractionDigits: 2,
                                        })}/{item.unit}
                                    </span>
                                    {item.trend !== null && (
                                        <span className={`flex items-center gap-0.5 ${rising ? "text-emerald-500" : "text-red-500"}`}>
                                            {rising ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                            {rising ? "+" : ""}{item.trend.toFixed(2)}%
                                        </span>
                                    )}
                                    <span className="max-w-36 truncate text-[8px] uppercase text-slate-light/60" title={item.source}>
                                        {item.source}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <span className="pl-[250px] text-[9px] text-slate-light">AWAITING VERIFIED MARKET DATA</span>
            )}

            <div className="absolute inset-y-0 right-0 z-20 flex items-center bg-background/90 px-3 text-[8px] text-slate-light shadow-[-8px_0_15px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                {sourceTime(asOf)}
            </div>
        </footer>
    );
}
