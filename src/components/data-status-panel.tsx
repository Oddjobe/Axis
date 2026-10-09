"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, CircleAlert, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";

type DatasetStatus = "current" | "stale" | "unavailable";

type TrustDataset = {
    status: DatasetStatus;
    displayState: string;
    publicationTier: "trusted" | "mixed" | "legacy";
    coverage: {
        availableRecords: number;
        expectedRecords: number | null;
        trustedRecords: number;
        trustedExpectedRecords: number | null;
    };
    freshness: {
        sourcePublishedAt: string | null;
        sourceObservedAt: string | null;
    };
    reasonCodes: string[];
};

type TrustHealth = {
    status: DatasetStatus;
    generatedAt: string;
    datasets: {
        countryScores: TrustDataset;
        intelligence: TrustDataset;
        blogs: TrustDataset;
        commodities: TrustDataset;
    };
};

const DATASETS = [
    { key: "intelligence", label: "Intelligence", cadence: "Daily" },
    { key: "blogs", label: "Analysis", cadence: "Daily" },
    { key: "commodities", label: "Commodities", cadence: "Daily" },
    { key: "countryScores", label: "Sovereignty Index 2024", cadence: "Periodic" },
] as const;

function compactDate(value: string | null): string {
    if (!value) return "No source date";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "No source date";
    return new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(parsed);
}

function statusClasses(status: DatasetStatus): string {
    if (status === "current") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    if (status === "stale") return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    return "border-red-500/30 bg-red-500/10 text-red-400";
}

export default function DataStatusPanel() {
    const [health, setHealth] = useState<TrustHealth | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch("/api/public/trust-health", {
                    cache: "no-store",
                    headers: { "Cache-Control": "no-cache" },
                });
                if (!response.ok) throw new Error(`Trust health returned ${response.status}`);
                const payload = (await response.json()) as TrustHealth;
                if (active) setHealth(payload);
            } catch {
                if (active) setHealth(null);
            }
        };
        void load();
        const interval = window.setInterval(load, 300_000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

    const summary = useMemo(() => {
        if (!health) return { trusted: 0, ingested: 0, baseline: 1, unavailable: true };
        const trusted = DATASETS.filter(
            ({ key }) =>
                key !== "countryScores" && health.datasets[key].displayState === "trusted-current",
        ).length;
        const ingested = DATASETS.filter(
            ({ key }) =>
                key !== "countryScores" && health.datasets[key].displayState === "legacy-live-ingested",
        ).length;        return { trusted, ingested, baseline: 1, unavailable: false };
    }, [health]);
    return (
        <div className="relative hidden lg:block">
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                className={`flex min-w-[17rem] items-center gap-2 rounded-2xl border px-3 py-2 text-left font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition ${summary.unavailable ? "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15" : "border-cobalt/30 bg-cobalt/10 hover:border-cobalt/60 hover:bg-cobalt/15"}`}
            >
                {summary.unavailable ? (
                    <CircleAlert className="h-4 w-4 text-amber-400" />
                ) : (
                    <ShieldCheck className="h-4 w-4 text-cobalt" />
                )}
                <span className="min-w-0 flex-1">
                    <span className="block text-[8px] font-bold uppercase tracking-[0.22em] text-slate-light/70">
                        Data coverage
                    </span>
                    <span className="block text-[11px] font-black tracking-wide text-foreground">
                        {summary.unavailable ? "STATUS UNAVAILABLE" : `${summary.trusted} TRUSTED · ${summary.ingested} INGESTED · ${summary.baseline} BASELINE`}
                    </span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-light transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[23rem] overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl">
                    <div className="border-b border-border bg-cobalt/5 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-cobalt" />
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-foreground">Coverage & provenance</p>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-light">
                            Live signals update daily. The sovereignty index is a periodic structural baseline, not a live market feed.
                        </p>
                    </div>
                    <div className="space-y-2 p-3">
                        {DATASETS.map(({ key, label, cadence }) => {
                            const dataset = health?.datasets[key];
                            const status = dataset?.status ?? "unavailable";
                            const sourceDate = dataset?.freshness.sourcePublishedAt ?? dataset?.freshness.sourceObservedAt ?? null;
                            const expected = dataset?.coverage.expectedRecords;
                            const available = dataset?.coverage.availableRecords;
                            const trustedExpected = dataset?.coverage.trustedExpectedRecords;
                            const showIdentityCoverage = key === "countryScores" || key === "commodities";
                            const coverageText = showIdentityCoverage && trustedExpected !== null && trustedExpected !== undefined
                                ? `${dataset?.coverage.trustedRecords ?? 0}/${trustedExpected} trusted`
                                : showIdentityCoverage && expected !== null && expected !== undefined && available !== undefined
                                    ? `${available}/${expected}`
                                    : null;
                            return (
                                <div key={key} className="flex items-center gap-3 rounded-xl border border-border bg-panel/50 px-3 py-2.5">
                                    <span className={`rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusClasses(key === "countryScores" ? "stale" : status)}`}>
                                        {key === "countryScores" ? "2024 baseline" : dataset?.displayState === "legacy-live-ingested" ? "Ingested" : status === "current" ? "Live" : status}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[10px] font-bold text-foreground">{label}</span>
                                        <span className="block text-[8px] text-slate-light">
                                            {compactDate(sourceDate)} · {cadence}
                                            {coverageText ? ` · ${coverageText}` : ""}
                                        </span>
                                    </span>
                                    {key === "countryScores" && <Activity className="h-3.5 w-3.5 text-amber-400" />}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[9px] font-mono">
                        <span className="text-slate-light">Request health: {health ? compactDate(health.generatedAt) : "unavailable"}</span>
                        <Link href="/methodology" className="font-bold text-cobalt hover:underline">Methodology →</Link>
                    </div>
                </div>
            )}
        </div>
    );
}
