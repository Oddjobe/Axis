"use client"

import React, { useMemo, useEffect, useState } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase';
import type { CountryData } from './country-dossier-modal';

interface InfluenceSankeyChartProps {
    data: CountryData[];
}

// Hardcoded stable fallback flows when Supabase has no data yet
const STATIC_FLOWS = [
    { source: "China", target: "DR Congo", value: 55 },
    { source: "China", target: "Zambia", value: 48 },
    { source: "China", target: "Ethiopia", value: 40 },
    { source: "IMF / World Bank", target: "Zambia", value: 35 },
    { source: "IMF / World Bank", target: "Zimbabwe", value: 28 },
    { source: "IMF / World Bank", target: "Sudan", value: 22 },
    { source: "Russia", target: "Sudan", value: 30 },
    { source: "Russia", target: "DR Congo", value: 18 },
    { source: "EU / CBAM", target: "Ethiopia", value: 25 },
    { source: "EU / CBAM", target: "DR Congo", value: 20 },
    { source: "United States", target: "Zimbabwe", value: 15 },
];

const SOURCE_META: Record<string, { color: string; flag: string }> = {
    "China": { color: "#ef4444", flag: "🇨🇳" },
    "EU / CBAM": { color: "#3b82f6", flag: "🇪🇺" },
    "United States": { color: "#6366f1", flag: "🇺🇸" },
    "Russia": { color: "#8b5cf6", flag: "🇷🇺" },
    "IMF / World Bank": { color: "#f59e0b", flag: "🏦" },
    "France": { color: "#60a5fa", flag: "🇫🇷" },
    "Gulf States": { color: "#34d399", flag: "🕌" },
    "UK": { color: "#a78bfa", flag: "🇬🇧" },
};

// Map ISO code to country name
const ISO_TO_NAME: Record<string, string> = {
    COD: "DR Congo", ZMB: "Zambia", ETH: "Ethiopia", ZWE: "Zimbabwe",
    SDN: "Sudan", NGA: "Nigeria", KEN: "Kenya", TZA: "Tanzania",
    UGA: "Uganda", GHA: "Ghana", CMR: "Cameroon", MLI: "Mali",
    BFA: "Burkina Faso", MOZ: "Mozambique", AGO: "Angola", MDG: "Madagascar",
    MWI: "Malawi", TCD: "Chad", CAF: "Central African Repub.", NER: "Niger",
    SSD: "South Sudan", DZA: "Algeria", MAR: "Morocco", EGY: "Egypt",
    LBY: "Libya", RWA: "Rwanda", SEN: "Senegal", CIV: "Côte d'Ivoire",
    NAM: "Namibia", BEN: "Benin", SLE: "Sierra Leone", GIN: "Guinea",
};

export default function InfluenceSankeyChart({ data: _data }: InfluenceSankeyChartProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
    const [alertCount, setAlertCount] = useState(0);
    const [isLive, setIsLive] = useState(false);

    useEffect(() => {
        async function fetchInfluenceAlerts() {
            const { data, error } = await supabase
                .from('intelligence_alerts')
                .select('isoCode, actor, source, title')
                .eq('category', 'OUTSIDE INFLUENCE')
                .not('isoCode', 'is', null)
                .order('created_at', { ascending: false })
                .limit(200);

            if (!error && data && data.length > 0) {
                setLiveAlerts(data);
                setAlertCount(data.length);
                setIsLive(true);
            }
        }
        fetchInfluenceAlerts();
    }, []);

    const sankeyData = useMemo(() => {
        let links: { source: string; target: string; value: number }[];

        if (isLive && liveAlerts.length > 0) {
            // Build flows from real Supabase data using the `actor` field
            const countMap: Record<string, number> = {};

            liveAlerts.forEach((alert) => {
                const actor = alert.actor;
                const iso = alert.isoCode;
                if (!actor || !SOURCE_META[actor] || !iso) return;

                const countryName = ISO_TO_NAME[iso] || iso;
                const key = `${actor}|||${countryName}`;
                countMap[key] = (countMap[key] || 0) + 1;
            });

            links = Object.entries(countMap)
                .filter(([, v]) => v > 0)
                .map(([key, value]) => {
                    const [source, target] = key.split("|||");
                    return { source, target, value };
                });

            // If liveAlerts exist but no actor field is set yet (old data), fall back
            if (links.length === 0) {
                links = STATIC_FLOWS;
                setIsLive(false);
            }
        } else {
            links = STATIC_FLOWS;
        }

        const linkedIds = new Set(links.flatMap(l => [l.source, l.target]));

        const sourceNodes = Object.entries(SOURCE_META)
            .filter(([id]) => linkedIds.has(id))
            .map(([id, meta]) => ({ id, nodeColor: meta.color }));

        const targetIds = [...linkedIds].filter(id => !SOURCE_META[id]);
        const targetNodes = targetIds.map(id => ({
            id,
            nodeColor: isDark ? "#334155" : "#cbd5e1"
        }));

        return { nodes: [...sourceNodes, ...targetNodes], links };
    }, [liveAlerts, isLive, isDark]);

    const textColor = isDark ? "#e2e8f0" : "#1e293b";
    const subtleColor = isDark ? "#475569" : "#cbd5e1";

    return (
        <div className="w-full h-full min-h-[450px] flex flex-col">
            <div className="mb-4 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-bold font-mono tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        Negative Influence Flows
                    </h3>
                    <span className={`text-[10px] font-mono px-2 py-1 rounded border flex items-center gap-1.5 ${isLive ? "text-green-500 border-green-500/30 bg-green-500/10" : "text-slate-light border-border bg-background/50"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
                        {isLive ? `LIVE · ${alertCount} ALERTS` : "STATIC FALLBACK"}
                    </span>
                </div>
                <p className="text-xs font-mono text-slate-light mt-1">
                    Volume of debt-traps, extractive trade deals, and structural adjustment pressure on Africa's most vulnerable states.
                </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 shrink-0">
                {Object.entries(SOURCE_META)
                    .filter(([id]) => sankeyData.nodes.some(n => n.id === id))
                    .map(([name, { color, flag }]) => (
                        <div key={name} className="flex items-center gap-1.5 text-[11px] font-mono">
                            <span className="text-base leading-none">{flag}</span>
                            <span className="font-bold" style={{ color }}>{name}</span>
                        </div>
                    ))}
            </div>

            <div className="flex-1 w-full min-h-0 bg-background/30 rounded-lg p-2 border border-border/50">
                {sankeyData.nodes.length < 2 ? (
                    <div className="flex items-center justify-center h-full text-slate-light text-xs font-mono opacity-50">
                        No influence flow data available yet. Run the scraper to populate.
                    </div>
                ) : (
                    <ResponsiveSankey
                        data={sankeyData}
                        margin={{ top: 10, right: 160, bottom: 10, left: 160 }}
                        align="justify"
                        colors={(node: any) => node.nodeColor}
                        nodeOpacity={1}
                        nodeHoverOthersOpacity={0.1}
                        nodeThickness={18}
                        nodeSpacing={28}
                        nodeBorderWidth={0}
                        nodeBorderRadius={4}
                        linkOpacity={0.4}
                        linkHoverOthersOpacity={0.05}
                        linkContract={3}
                        enableLinkGradient={true}
                        labelPosition="outside"
                        labelOrientation="horizontal"
                        labelPadding={16}
                        labelTextColor={textColor}
                        label={(node: any) => {
                            const id: string = node.id;
                            const srcMeta = SOURCE_META[id];
                            if (srcMeta) return `${srcMeta.flag} ${id}`;
                            // Try to find a flag for target country
                            const entry = Object.entries(ISO_TO_NAME).find(([, name]) => name === id);
                            if (entry) return `${id}`;
                            return id;
                        }}
                        animate={true}
                        theme={{
                            labels: {
                                text: {
                                    fontSize: 13,
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                    fontWeight: 700,
                                }
                            },
                            tooltip: {
                                container: {
                                    background: isDark ? '#18181b' : '#ffffff',
                                    color: isDark ? '#e2e8f0' : '#0f172a',
                                    fontSize: 12,
                                    fontFamily: 'ui-monospace, monospace',
                                    borderRadius: '8px',
                                    border: `1px solid ${subtleColor}`,
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                }
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
}
