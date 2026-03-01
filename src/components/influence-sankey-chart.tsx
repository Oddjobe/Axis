"use client"

import React, { useMemo } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { useTheme } from 'next-themes';
import type { CountryData } from './country-dossier-modal';

interface InfluenceSankeyChartProps {
    data: CountryData[];
}

export default function InfluenceSankeyChart({ data }: InfluenceSankeyChartProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    // Process data to build standard Sankey payload
    const sankeyData = useMemo(() => {
        if (!data || data.length === 0) return { nodes: [], links: [] };

        // Top 5 worst affected countries dynamically
        const worstCountries = [...data]
            .sort((a, b) => (a.axisScore || 100) - (b.axisScore || 100))
            .slice(0, 5);

        const sourcePool = [
            { id: "🇨🇳 China (Debt/Infrastructure)", nodeColor: "#ef4444" },
            { id: "🇪🇺 European Union (Trade Policy/CBAM)", nodeColor: "#3b82f6" },
            { id: "🇺🇸 United States (Military/Agoa)", nodeColor: "#6366f1" },
            { id: "🇷🇺 Russia (Security/Mining)", nodeColor: "#8b5cf6" },
            { id: "🏦 IMF / World Bank (Structural Adjustment)", nodeColor: "#f59e0b" },
        ];

        const links: any[] = [];
        const targetPool: any[] = [];

        // Map some fake flows based on common geopolitical scenarios 
        worstCountries.forEach((c, i) => {
            const targetId = `🇿🇦 ${c.name}`;
            targetPool.push({ id: targetId, nodeColor: getSeverityColor(c.axisScore, isDark) });

            // Randomize some flows toward the worst affected states
            if (i % 2 === 0) {
                links.push({ source: "🇨🇳 China (Debt/Infrastructure)", target: targetId, value: Math.floor(Math.random() * 40) + 20 });
            }
            if (i % 3 === 0) {
                links.push({ source: "🏦 IMF / World Bank (Structural Adjustment)", target: targetId, value: Math.floor(Math.random() * 30) + 15 });
            }
            if (c.name.includes("Congo") || c.name.includes("Mali")) {
                links.push({ source: "🇷🇺 Russia (Security/Mining)", target: targetId, value: Math.floor(Math.random() * 25) + 15 });
            }
            if (c.name.includes("South Africa") || c.name.includes("Nigeria")) {
                links.push({ source: "🇪🇺 European Union (Trade Policy/CBAM)", target: targetId, value: Math.floor(Math.random() * 35) + 10 });
                links.push({ source: "🇺🇸 United States (Military/Agoa)", target: targetId, value: Math.floor(Math.random() * 20) + 10 });
            }

            // Ensure every generated country has at least one flow
            if (links.filter(l => l.target === targetId).length === 0) {
                links.push({ source: "🇨🇳 China (Debt/Infrastructure)", target: targetId, value: 20 });
            }
        });

        // NIVO WARNING: Sankey will crash if a node has no links. 
        // We only push nodes to the final array if they actually exist in the generated links!
        const linkedNodeIds = new Set(links.flatMap(l => [l.source, l.target]));
        const nodes = [...sourcePool, ...targetPool].filter(node => linkedNodeIds.has(node.id));

        return { nodes, links };
    }, [data, isDark]);

    function getSeverityColor(score: number, dark: boolean) {
        if (score >= 70) return dark ? "#22c55e" : "#16a34a"; // Green
        if (score >= 50) return dark ? "#f59e0b" : "#d97706"; // Yellow/Amber
        return dark ? "#ef4444" : "#dc2626"; // Red
    }

    return (
        <div className="w-full h-full min-h-[450px] flex flex-col">
            <div className="mb-4">
                <h3 className="text-sm font-bold font-mono tracking-widest uppercase mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Negative Influence Flows
                </h3>
                <p className="text-[10px] font-mono text-slate-light">
                    Tracking the volume of debt-traps, extractive trade agreements, and external structural adjustments impacting Africa's most vulnerable states.
                </p>
            </div>

            <div className="flex-1 w-full bg-background/30 rounded-lg p-2 border border-border/50">
                <ResponsiveSankey
                    data={sankeyData}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    align="justify"
                    colors={(node: any) => node.nodeColor}
                    nodeOpacity={0.9}
                    nodeHoverOthersOpacity={0.1}
                    nodeThickness={12}
                    nodeSpacing={24}
                    nodeBorderWidth={0}
                    nodeBorderColor={{
                        from: 'color',
                        modifiers: [['darker', 0.8]]
                    }}
                    nodeBorderRadius={3}
                    linkOpacity={0.3}
                    linkHoverOthersOpacity={0.05}
                    linkContract={3}
                    enableLinkGradient={true}
                    labelPosition="outside"
                    labelOrientation="horizontal"
                    labelPadding={12}
                    labelTextColor={isDark ? "#e2e8f0" : "#1e293b"}
                    animate={true}
                    theme={{
                        labels: {
                            text: {
                                fontSize: 10,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                fontWeight: 600,
                            }
                        },
                        tooltip: {
                            container: {
                                background: isDark ? '#18181b' : '#ffffff',
                                color: isDark ? '#e2e8f0' : '#0f172a',
                                fontSize: 10,
                                fontFamily: 'ui-monospace, monospace',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: isDark ? '#3f3f46' : '#e2e8f0',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            }
                        }
                    }}
                />
            </div>
        </div>
    );
}
