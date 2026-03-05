"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ExternalLink, BarChart3, Maximize2, LineChart, Network } from "lucide-react"
import WealthVsSovereigntyChart from "./wealth-vs-sovereignty-chart"
import SovereigntyTrendlineChart from "./sovereignty-trendline-chart"
import InfluenceSankeyChart from "./influence-sankey-chart"
import AiResourceGraph from "./ai-resource-graph"
import type { CountryData } from "./country-dossier-modal"

interface AnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: CountryData[];
    selectedResource?: string | null;
}

type TabType = "SCATTER" | "TRENDS" | "FLOWS" | "NEXUS";

export default function AnalyticsModal({ isOpen, onClose, data, selectedResource }: AnalyticsModalProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>("SCATTER");
    const [contentReady, setContentReady] = useState(false);

    // Reset contentReady when modal closes; it will be set to true
    // by onAnimationComplete on the modal container.
    useEffect(() => {
        if (!isOpen) setContentReady(false);
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <React.Fragment>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-xl z-[90]"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            width: isFullscreen ? "95vw" : "min(90vw, 1100px)",
                            height: isFullscreen ? "95vh" : "auto",
                            maxHeight: isFullscreen ? "95vh" : "85vh",
                        }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        onAnimationComplete={() => { if (isOpen) setContentReady(true); }}
                        className={`fixed ${isFullscreen ? "inset-y-auto inset-x-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "top-[10%] left-0 right-0 mx-auto"} bg-panel border border-border shadow-2xl z-[100] flex flex-col overflow-hidden`}
                        style={{
                            borderRadius: isFullscreen ? "1rem" : "1.5rem",
                            ...(isFullscreen ? {} : { margin: "0 auto" })
                        }}
                    >
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-6 border-b border-border bg-background/50 gap-4 sm:gap-0">
                            <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                                <div className="p-2 bg-cobalt/10 rounded-lg border border-cobalt/20 shrink-0">
                                    <BarChart3 className="w-5 h-5 text-cobalt" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-sm lg:text-base font-bold tracking-widest uppercase truncate">STRATEGIC ANALYTICS</h2>
                                    <div className="flex items-center gap-2 mt-0.5 whitespace-nowrap">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                                        <span className="text-[10px] font-mono text-slate-light tracking-wider truncate">LIVE PLATFORM DATA</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tab Navigation */}
                            <div className="flex bg-background border border-border rounded-lg p-1 w-full overflow-x-auto sm:w-auto order-3 sm:order-2">
                                <button
                                    onClick={() => setActiveTab("SCATTER")}
                                    className={`shrink-0 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] sm:text-xs font-bold font-mono transition-colors ${activeTab === "SCATTER" ? "bg-cobalt text-white shadow" : "text-slate-light hover:text-foreground hover:bg-white/5"}`}
                                >
                                    <BarChart3 className="w-3.5 h-3.5" /> <span className="hidden lg:inline">THE EXTRACTIVIST TRAP</span> <span className="lg:hidden">SCATTER</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("TRENDS")}
                                    className={`shrink-0 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] sm:text-xs font-bold font-mono transition-colors ${activeTab === "TRENDS" ? "bg-blue-500 text-white shadow" : "text-slate-light hover:text-foreground hover:bg-white/5"}`}
                                >
                                    <LineChart className="w-3.5 h-3.5" /> <span className="hidden lg:inline">SOVEREIGNTY TRENDS</span> <span className="lg:hidden">TRENDS</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("FLOWS")}
                                    className={`shrink-0 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] sm:text-xs font-bold font-mono transition-colors ${activeTab === "FLOWS" ? "bg-orange-500 text-white shadow" : "text-slate-light hover:text-foreground hover:bg-white/5"}`}
                                >
                                    <Network className="w-3.5 h-3.5" /> <span className="hidden lg:inline">INFLUENCE FLOWS</span> <span className="lg:hidden">FLOWS</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("NEXUS")}
                                    className={`shrink-0 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] sm:text-xs font-bold font-mono transition-colors ${activeTab === "NEXUS" ? "bg-emerald-500 text-white shadow" : "text-slate-light hover:text-foreground hover:bg-white/5"}`}
                                >
                                    <Network className="w-3.5 h-3.5" /> <span className="hidden lg:inline">AI NEXUS</span> <span className="lg:hidden">NEXUS</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-2 order-2 sm:order-3 self-end sm:self-auto absolute sm:relative top-4 right-4 sm:top-0 sm:right-0">
                                <button
                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                    className="p-2 hover:bg-background rounded-full transition-colors group hidden sm:block"
                                    title="Toggle Fullscreen"
                                >
                                    <Maximize2 className="w-4 h-4 text-slate-light group-hover:text-foreground" />
                                </button>
                                <div className="w-px h-4 bg-border hidden sm:block mx-1" />
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-background rounded-full transition-colors group"
                                >
                                    <X className="w-5 h-5 text-slate-light group-hover:text-foreground" />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className={`p-4 lg:p-6 overflow-y-auto ${isFullscreen ? "flex-1 flex flex-col" : "h-[500px]"}`}>

                            <AnimatePresence mode="wait">
                                {!contentReady ? (
                                    <div className="flex items-center justify-center h-full min-h-[300px]">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-6 h-6 border-2 border-cobalt/30 border-t-cobalt rounded-full animate-spin" />
                                            <span className="text-[10px] font-mono text-slate-light tracking-widest uppercase">LOADING ANALYTICS</span>
                                        </div>
                                    </div>
                                ) : (<>
                                    {activeTab === "SCATTER" && (
                                        <motion.div
                                            key="scatter"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full"
                                        >
                                            <div className="lg:col-span-1 flex flex-col gap-4">
                                                <div className="p-4 bg-background border border-border rounded-xl">
                                                    <h3 className="text-xs font-bold font-mono text-foreground mb-2 flex items-center gap-2">
                                                        <span className="text-orange-500">▶</span> THE DATA STORY
                                                    </h3>
                                                    <p className="text-xs text-slate-light leading-relaxed mb-4">
                                                        This scatter plot visualizes the core thesis of AXIS: The gap between Africa's natural endowment and its sovereign value capture.
                                                    </p>

                                                    <div className="space-y-3">
                                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-xs font-mono">
                                                            <span className="font-bold text-red-500 block mb-1">BOTTOM RIGHT: EXTRACTIVIST TARGETS</span>
                                                            High Resource Wealth, Low Sovereignty Score. These nations possess massive critical minerals but suffer from extreme capital flight, foreign debt dependency, or imbalanced trade agreements favoring external powers.
                                                        </div>

                                                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded text-xs font-mono">
                                                            <span className="font-bold text-green-500 block mb-1">TOP RIGHT: OPTIMAL ANCHORS</span>
                                                            High Resource Wealth, High Sovereignty. Nations leveraging their endowments for domestic industrialization, demanding fair tech-transfer, and securing diversified trade partnerships.
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-auto p-4 bg-cobalt/5 border border-cobalt/20 rounded-xl">
                                                    <p className="text-xs font-mono text-slate-light flex items-center gap-2">
                                                        <ExternalLink className="w-3 h-3 text-cobalt" />
                                                        Explore individual states on the map for deeper dossiers and live friction alerts.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="lg:col-span-3 bg-background border border-border rounded-xl p-4 flex flex-col min-h-[400px]">
                                                <WealthVsSovereigntyChart data={data} />
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === "TRENDS" && (
                                        <motion.div
                                            key="trends"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="h-full bg-background border border-border rounded-xl p-4 flex flex-col min-h-[400px]"
                                        >
                                            <SovereigntyTrendlineChart data={data} />
                                        </motion.div>
                                    )}

                                    {activeTab === "FLOWS" && (
                                        <motion.div
                                            key="flows"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full"
                                        >
                                            <div className="lg:col-span-1 flex flex-col gap-4">
                                                <div className="p-4 bg-background border border-border rounded-xl">
                                                    <h3 className="text-xs font-bold font-mono text-foreground mb-2 flex items-center gap-2">
                                                        <span className="text-orange-500">▶</span> INFLUENCE MAPPING
                                                    </h3>
                                                    <p className="text-xs text-slate-light leading-relaxed mb-4">
                                                        Visualizing extractive structural influence from external actors into Africa's most vulnerable states.
                                                    </p>

                                                    <div className="space-y-3">
                                                        <div className="p-3 border border-border rounded text-xs font-mono">
                                                            <span className="font-bold text-red-500 block mb-1">🇨🇳 INFRASTRUCTURE & DEBT</span>
                                                            High-interest bilateral loans exchanged for unrefined mineral export monopolies.
                                                        </div>

                                                        <div className="p-3 border border-border rounded text-xs font-mono">
                                                            <span className="font-bold text-amber-500 block mb-1">🏦 STRUCTURAL ADJUSTMENTS</span>
                                                            Forced privatization of state energy assets and currency devaluations.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="lg:col-span-3 bg-background border border-border rounded-xl p-4 flex flex-col min-h-[400px]">
                                                <InfluenceSankeyChart data={data} />
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === "NEXUS" && (
                                        <motion.div
                                            key="nexus"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="h-full bg-background border border-border rounded-xl p-4 flex flex-col min-h-[400px]"
                                        >
                                            <AiResourceGraph selectedResource={selectedResource} />
                                        </motion.div>
                                    )}
                                </>)}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
}
