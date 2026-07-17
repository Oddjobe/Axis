"use client"

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
    ResponsiveSankey,
    type SankeyLinkDatum,
    type SankeyNodeDatum,
} from '@nivo/sankey';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase';
import { getPublicTrustStateLabel } from '@/lib/intelligence/trust-health';
import type { IntelligenceAlert } from './country-dossier-modal';

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

type Flow = { source: string; target: string; value: number };
type FlowNode = { id: string; nodeColor: string };

const TOP_N = 12;

export default function InfluenceSankeyChart() {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    const [liveAlerts, setLiveAlerts] = useState<IntelligenceAlert[]>([]);
    const [alertCount, setAlertCount] = useState(0);

    // Interaction state
    const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
    const [focusNode, setFocusNode] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        async function fetchInfluenceAlerts() {
            const { data, error } = await supabase
                .from('intelligence_alerts')
                .select('*')
                .eq('category', 'OUTSIDE INFLUENCE')
                .not('isoCode', 'is', null)
                .order('created_at', { ascending: false })
                .limit(200);

            if (!error && data && data.length > 0) {
                setLiveAlerts(data);
                setAlertCount(data.length);
            }
        }
        fetchInfluenceAlerts();
    }, []);

    // Derive if we should actually show live data based on whether any alerts have influence actors
    const hasInfluenceActors = useMemo(() => {
        return liveAlerts.some(alert => alert.actor && SOURCE_META[alert.actor]);
    }, [liveAlerts]);

    const showLive = liveAlerts.length > 0 && hasInfluenceActors;
    const trustState = showLive
        ? "legacy-live-ingested"
        : "static-fallback";

    // The complete (unfiltered) set of flows derived from live or fallback data
    const baseLinks = useMemo<Flow[]>(() => {
        if (showLive && liveAlerts.length > 0) {
            const countMap: Record<string, number> = {};
            liveAlerts.forEach((alert) => {
                const actor = alert.actor;
                const iso = alert.isoCode;
                if (!actor || !SOURCE_META[actor] || !iso) return;
                const countryName = ISO_TO_NAME[iso] || iso;
                const key = `${actor}|||${countryName}`;
                countMap[key] = (countMap[key] || 0) + 1;
            });
            const links = Object.entries(countMap)
                .filter(([, v]) => v > 0)
                .map(([key, value]) => {
                    const [source, target] = key.split("|||");
                    return { source, target, value };
                });
            return links.length > 0 ? links : STATIC_FLOWS;
        }
        return STATIC_FLOWS;
    }, [liveAlerts, showLive]);

    // Actors actually present in the data, in canonical order
    const availableActors = useMemo(() => {
        const present = new Set(baseLinks.map(l => l.source));
        return Object.keys(SOURCE_META).filter(a => present.has(a));
    }, [baseLinks]);

    // Apply actor + focus filters and the top-N declutter, then build nodes
    const { sankeyData, hiddenTargetCount, totalTargetCount, isEmpty } = useMemo(() => {
        let links = baseLinks;

        if (selectedActors.size > 0) {
            links = links.filter(l => selectedActors.has(l.source));
        }
        if (focusNode) {
            links = links.filter(l => l.source === focusNode || l.target === focusNode);
        }

        // Aggregate recipient volume for the currently-filtered links
        const targetTotals: Record<string, number> = {};
        links.forEach(l => { targetTotals[l.target] = (targetTotals[l.target] || 0) + l.value; });
        const totalTargets = Object.keys(targetTotals).length;

        let hidden = 0;
        if (!showAll && !focusNode && totalTargets > TOP_N) {
            const keep = new Set(
                Object.entries(targetTotals)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, TOP_N)
                    .map(([k]) => k)
            );
            hidden = totalTargets - keep.size;
            links = links.filter(l => keep.has(l.target));
        }

        const linkedIds = new Set(links.flatMap(l => [l.source, l.target]));

        const sourceNodes = availableActors
            .filter(id => linkedIds.has(id))
            .map(id => ({ id, nodeColor: SOURCE_META[id].color }));

        const targetNodes = [...linkedIds]
            .filter(id => !SOURCE_META[id])
            .map(id => ({ id, nodeColor: isDark ? "#475569" : "#94a3b8" }));

        return {
            sankeyData: { nodes: [...sourceNodes, ...targetNodes], links },
            hiddenTargetCount: hidden,
            totalTargetCount: totalTargets,
            isEmpty: links.length === 0,
        };
    }, [baseLinks, selectedActors, focusNode, showAll, isDark, availableActors]);

    // Stats for the current view / selection
    const stats = useMemo(() => {
        const links = sankeyData.links;
        const volume = links.reduce((s, l) => s + l.value, 0);
        const states = new Set(links.map(l => l.target)).size;
        return { flows: links.length, states, volume };
    }, [sankeyData]);

    const toggleActor = useCallback((actor: string) => {
        setFocusNode(null);
        setSelectedActors(prev => {
            const next = new Set(prev);
            if (next.has(actor)) next.delete(actor); else next.add(actor);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedActors(new Set());
        setFocusNode(null);
    }, []);

    const handleNodeOrLinkClick = useCallback((
        datum: SankeyNodeDatum<FlowNode, Flow> | SankeyLinkDatum<FlowNode, Flow>,
    ) => {
        if ("id" in datum) {
            // Node click
            setFocusNode(prev => (prev === datum.id ? null : datum.id));
        } else {
            // Link click -> focus its recipient country
            setFocusNode(prev => (prev === datum.target.id ? null : datum.target.id));
        }
    }, []);

    const hasSelection = selectedActors.size > 0 || !!focusNode;
    const focusIsActor = focusNode ? !!SOURCE_META[focusNode] : false;

    const textColor = isDark ? "#e2e8f0" : "#1e293b";
    const subtleColor = isDark ? "#475569" : "#cbd5e1";

    return (
        <div className="w-full h-full min-h-[450px] flex flex-col">
            <div className="mb-3 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-bold font-mono tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        Negative Influence Flows
                    </h3>
                    <span className={`text-[10px] font-mono px-2 py-1 rounded border flex items-center gap-1.5 ${showLive ? "text-amber-500 border-amber-500/30 bg-amber-500/10" : "text-slate-light border-border bg-background/50"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${showLive ? "bg-amber-500" : "bg-slate-400"}`} />
                        {getPublicTrustStateLabel(trustState)}{showLive ? ` · ${alertCount} ALERTS` : ""}
                    </span>
                </div>
                <p className="text-xs font-mono text-slate-light mt-1">
                    Volume of debt-traps, extractive trade deals, and structural adjustment pressure on Africa&apos;s most vulnerable states.
                </p>
            </div>

            {/* Interactive actor filter chips */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2 shrink-0">
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-light/70 mr-0.5">Filter actors:</span>
                {availableActors.map((name) => {
                    const { color, flag } = SOURCE_META[name];
                    const active = selectedActors.has(name);
                    const dimmed = selectedActors.size > 0 && !active;
                    return (
                        <button
                            key={name}
                            onClick={() => toggleActor(name)}
                            aria-pressed={active}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-mono font-bold transition-all ${active ? "shadow-sm" : "hover:border-current"} ${dimmed ? "opacity-40" : "opacity-100"}`}
                            style={{
                                color: active ? "#fff" : color,
                                backgroundColor: active ? color : "transparent",
                                borderColor: color,
                            }}
                        >
                            <span className="text-sm leading-none">{flag}</span>
                            {name}
                        </button>
                    );
                })}
            </div>

            {/* Selection summary + controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-light min-w-0">
                    {focusNode ? (
                        <span className="flex items-center gap-1.5 truncate">
                            <span className="text-orange-500 font-bold">FOCUS:</span>
                            <span className="font-bold text-foreground truncate">
                                {focusIsActor ? `${SOURCE_META[focusNode].flag} ${focusNode}` : focusNode}
                            </span>
                            <span className="text-slate-light">·</span>
                            {focusIsActor
                                ? <span>{stats.states} states · {stats.volume} pressure units</span>
                                : <span>{stats.flows} actors · {stats.volume} pressure units</span>}
                        </span>
                    ) : selectedActors.size > 0 ? (
                        <span>{selectedActors.size} actor{selectedActors.size > 1 ? "s" : ""} · {stats.states} states · {stats.volume} pressure units</span>
                    ) : (
                        <span>{stats.flows} flows · {stats.states} states · {stats.volume} pressure units</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {(hiddenTargetCount > 0 || showAll) && !focusNode && totalTargetCount > TOP_N && (
                        <button
                            onClick={() => setShowAll(v => !v)}
                            className="px-2 py-1 rounded border border-border text-[10px] font-mono text-slate-light hover:text-foreground hover:border-cobalt/40 transition-colors"
                        >
                            {showAll ? `Top ${TOP_N}` : `Show all (${totalTargetCount})`}
                        </button>
                    )}
                    {hasSelection && (
                        <button
                            onClick={clearSelection}
                            className="px-2 py-1 rounded border border-orange-500/40 bg-orange-500/10 text-[10px] font-mono text-orange-500 hover:bg-orange-500/20 transition-colors flex items-center gap-1"
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 w-full min-h-0 bg-background/30 rounded-lg p-2 border border-border/50">
                {sankeyData.nodes.length < 2 || isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-light text-xs font-mono gap-3">
                        <span className="opacity-60">No matching influence flows for this selection.</span>
                        {hasSelection && (
                            <button
                                onClick={clearSelection}
                                className="px-3 py-1.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors"
                            >
                                Reset selection
                            </button>
                        )}
                    </div>
                ) : (
                    <ResponsiveSankey
                        data={sankeyData}
                        margin={{ top: 10, right: 160, bottom: 10, left: 160 }}
                        align="justify"
                        colors={(node) => node.nodeColor}
                        nodeOpacity={1}
                        nodeHoverOthersOpacity={0.15}
                        nodeThickness={18}
                        nodeSpacing={28}
                        nodeBorderWidth={0}
                        nodeBorderRadius={4}
                        linkOpacity={hasSelection ? 0.6 : 0.45}
                        linkHoverOthersOpacity={0.08}
                        linkContract={3}
                        enableLinkGradient={true}
                        labelPosition="outside"
                        labelOrientation="horizontal"
                        labelPadding={16}
                        labelTextColor={textColor}
                        onClick={handleNodeOrLinkClick}
                        label={(node) => {
                            const id: string = node.id;
                            const srcMeta = SOURCE_META[id];
                            if (srcMeta) return `${srcMeta.flag} ${id}`;
                            return id;
                        }}
                        animate={true}
                        motionConfig="gentle"
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

            <p className="text-[9px] font-mono text-slate-light/60 mt-1.5 shrink-0 text-center">
                Click an actor chip to filter · click any node or flow to isolate it · click again to release
            </p>
        </div>
    );
}
