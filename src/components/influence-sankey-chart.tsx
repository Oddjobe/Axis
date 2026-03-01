"use client"

import React, { useMemo } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { useTheme } from 'next-themes';
import type { CountryData } from './country-dossier-modal';

interface InfluenceSankeyChartProps {
    data: CountryData[];
}

// Hardcoded, stable mock flows — not randomized so they don't crash on every render
const STATIC_FLOWS = [
    // China flows
    { source: "China", target: "DR Congo", value: 55 },
    { source: "China", target: "Zambia", value: 48 },
    { source: "China", target: "Ethiopia", value: 40 },
    // IMF flows
    { source: "IMF / World Bank", target: "Zambia", value: 35 },
    { source: "IMF / World Bank", target: "Zimbabwe", value: 28 },
    { source: "IMF / World Bank", target: "Sudan", value: 22 },
    // Russia flows
    { source: "Russia", target: "Sudan", value: 30 },
    { source: "Russia", target: "DR Congo", value: 18 },
    // EU flow
    { source: "EU / CBAM", target: "Ethiopia", value: 25 },
    { source: "EU / CBAM", target: "DR Congo", value: 20 },
    // US flows
    { source: "United States", target: "Zimbabwe", value: 15 },
];

const SOURCE_META: Record<string, { color: string; flag: string }> = {
    "China": { color: "#ef4444", flag: "🇨🇳" },
    "EU / CBAM": { color: "#3b82f6", flag: "🇪🇺" },
    "United States": { color: "#6366f1", flag: "🇺🇸" },
    "Russia": { color: "#8b5cf6", flag: "🇷🇺" },
    "IMF / World Bank": { color: "#f59e0b", flag: "🏦" },
};

const TARGET_FLAGS: Record<string, string> = {
    "DR Congo": "🇨🇩",
    "Zambia": "🇿🇲",
    "Ethiopia": "🇪🇹",
    "Zimbabwe": "🇿🇼",
    "Sudan": "🇸🇩",
};

export default function InfluenceSankeyChart({ data: _data }: InfluenceSankeyChartProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    const sankeyData = useMemo(() => {
        const links = STATIC_FLOWS;
        const linkedIds = new Set(links.flatMap(l => [l.source, l.target]));

        const nodes = [
            ...Object.entries(SOURCE_META)
                .filter(([id]) => linkedIds.has(id))
                .map(([id, meta]) => ({ id, nodeColor: meta.color })),
            ...Object.keys(TARGET_FLAGS)
                .filter(id => linkedIds.has(id))
                .map(id => ({ id, nodeColor: isDark ? "#334155" : "#cbd5e1" })),
        ];

        return { nodes, links };
    }, [isDark]);

    const textColor = isDark ? "#e2e8f0" : "#1e293b";
    const subtleColor = isDark ? "#475569" : "#cbd5e1";

    return (
        <div className="w-full h-full min-h-[450px] flex flex-col">
            <div className="mb-4 shrink-0">
                <h3 className="text-sm font-bold font-mono tracking-widest uppercase mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Negative Influence Flows
                </h3>
                <p className="text-xs font-mono text-slate-light">
                    Volume of debt-traps, extractive trade deals, and structural adjustment pressure on Africa's most vulnerable states.
                </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 shrink-0">
                {Object.entries(SOURCE_META).map(([name, { color, flag }]) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-base leading-none">{flag}</span>
                        <span className="font-bold" style={{ color }}>{name}</span>
                    </div>
                ))}
            </div>

            <div className="flex-1 w-full min-h-0 bg-background/30 rounded-lg p-2 border border-border/50">
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
                        const tgtFlag = TARGET_FLAGS[id];
                        if (srcMeta) return `${srcMeta.flag} ${id}`;
                        if (tgtFlag) return `${tgtFlag} ${id}`;
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
            </div>
        </div>
    );
}
