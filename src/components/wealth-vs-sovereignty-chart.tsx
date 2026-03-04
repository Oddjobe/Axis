"use client"

import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { useTheme } from 'next-themes';
import type { CountryData } from './country-dossier-modal';

interface WealthVsSovereigntyChartProps {
    data: CountryData[];
}

export default function WealthVsSovereigntyChart({ data }: WealthVsSovereigntyChartProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    // Process data for the chart
    const chartData = useMemo(() => {
        return data.map(country => {
            const trendStr = typeof country.trend === 'string' ? country.trend : "0";
            return {
                name: country.name,
                iso: country.country,
                wealth: country.resourceWealth,
                sovereignty: country.axisScore,
                // Map trend string like "++" to a numeric size for the ZAxis (bubble size)
                fdiSize: trendStr.startsWith("++") ? 100 :
                    trendStr.startsWith("+") ? 80 :
                        trendStr === "0" ? 60 :
                            trendStr.startsWith("--") ? 30 :
                                trendStr.startsWith("-") ? 40 : 50,
                trendStr,
                resources: country.keyResources,
                color: getSeverityColor(country.axisScore, isDark)
            }
        }).filter(d => d.wealth !== undefined && d.sovereignty !== undefined);
    }, [data, isDark]);

    function getSeverityColor(score: number, dark: boolean) {
        if (score >= 70) return dark ? "rgba(34, 197, 94, 0.8)" : "rgba(34, 197, 94, 0.9)"; // Green
        if (score >= 50) return dark ? "rgba(245, 158, 11, 0.8)" : "rgba(245, 158, 11, 0.9)"; // Yellow/Amber
        return dark ? "rgba(239, 68, 68, 0.8)" : "rgba(239, 68, 68, 0.9)"; // Red
    }

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-panel border border-border p-3 rounded-lg shadow-xl backdrop-blur-md max-w-[200px]">
                    <div className="flex items-center gap-2 mb-2 border-b border-border pb-2">
                        <span className="text-[10px] font-bold font-mono text-foreground uppercase tracking-wider">{data.name}</span>
                    </div>
                    <div className="space-y-1 font-mono text-[9px] text-slate-light">
                        <div className="flex justify-between">
                            <span>RESOURCE WEALTH:</span>
                            <span className="font-bold text-amber-500">{data.wealth}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>SOVEREIGNTY SCORE:</span>
                            <span className="font-bold text-foreground">{data.sovereignty}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>FDI TREND:</span>
                            <span className="font-bold">{data.trendStr}</span>
                        </div>
                        <div className="pt-2 flex flex-wrap gap-1">
                            {data.resources?.slice(0, 3).map((res: string, i: number) => (
                                <span key={i} className="px-1 py-0.5 bg-background border border-border rounded text-[8px] text-amber-500">{res}</span>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full min-h-[400px] flex flex-col">
            <div className="mb-4 shrink-0">
                <h3 className="text-sm font-bold font-mono tracking-widest uppercase mb-1 flex items-center gap-2">
                    <span>The Extractivist Trap</span>
                </h3>
                <p className="text-[10px] font-mono text-slate-light">
                    Countries in the bottom-right have massive resource wealth but low sovereignty/value capture.
                </p>
            </div>

            <div className="flex-1 w-full relative min-w-[1px] min-h-[1px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                        <XAxis
                            type="number"
                            dataKey="wealth"
                            name="Resource Wealth"
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }}
                            stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}
                            label={{ value: "RESOURCE WEALTH (Potential)", position: "bottom", offset: 0, fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8', className: 'font-mono' }}
                        />
                        <YAxis
                            type="number"
                            dataKey="sovereignty"
                            name="Sovereignty Score"
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }}
                            stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}
                            label={{ value: "SOVEREIGNTY SCORE (Value Capture)", angle: -90, position: "insideLeft", fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8', className: 'font-mono' }}
                        />
                        <ZAxis type="number" dataKey="fdiSize" range={[60, 400]} name="FDI Trend" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />

                        {/* Quadrant lines */}
                        <ReferenceLine x={50} stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                        <ReferenceLine y={50} stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />

                        <Scatter name="Nations" data={chartData} shape="circle">
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
