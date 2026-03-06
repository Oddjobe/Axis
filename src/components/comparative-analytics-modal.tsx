"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Combine, Search, Check, AlertCircle, Info, BarChart3, TrendingUp, TrendingDown } from "lucide-react"
import CountryRadarChart from "./country-radar-chart"
import type { CountryData } from "./country-dossier-modal"

interface ComparativeAnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    allData: CountryData[];
    initialSelectedCodes?: string[];
}

export default function ComparativeAnalyticsModal({
    isOpen,
    onClose,
    allData,
    initialSelectedCodes = []
}: ComparativeAnalyticsModalProps) {
    const [selectedCodes, setSelectedCodes] = useState<string[]>(initialSelectedCodes);
    const [searchQuery, setSearchQuery] = useState("");
    const [renderCharts, setRenderCharts] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Set up a small delay to ensure modal is fully expanded before heavy chart rendering
            const timer = setTimeout(() => setRenderCharts(true), 400);
            return () => clearTimeout(timer);
        } else {
            setRenderCharts(false);
            setSearchQuery("");
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && initialSelectedCodes.length > 0) {
            setSelectedCodes(initialSelectedCodes);
        }
    }, [isOpen, initialSelectedCodes]);

    const toggleCountry = (code: string) => {
        if (selectedCodes.includes(code)) {
            setSelectedCodes(prev => prev.filter(c => c !== code));
        } else if (selectedCodes.length < 5) {
            setSelectedCodes(prev => [...prev, code]);
        }
    };

    const selectedCountries = selectedCodes
        .map(code => allData.find(c => c.country === code))
        .filter(Boolean) as CountryData[];

    const filteredCountries = allData.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.country.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                        className="fixed inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-xl z-[120]"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 m-auto w-[95vw] lg:w-[1100px] h-[85vh] bg-panel border border-border shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[130] flex flex-col md:flex-row overflow-hidden rounded-2xl"
                    >
                        {/* Left sidebar: Selection Panel */}
                        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border flex flex-col bg-background/30 backdrop-blur-sm">
                            <div className="p-4 border-b border-border space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xs font-bold font-mono tracking-widest text-foreground uppercase flex items-center gap-2">
                                        <Combine className="w-4 h-4 text-cobalt" /> COMPARE NATIONS
                                    </h2>
                                    <div className="px-2 py-0.5 rounded-full bg-cobalt/10 border border-cobalt/20 text-[9px] font-mono font-bold text-cobalt">
                                        {selectedCodes.length}/5
                                    </div>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-light" />
                                    <input
                                        type="text"
                                        placeholder="FILTER LIST..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-[10px] font-mono text-foreground focus:outline-none focus:border-cobalt/50 transition-all placeholder:text-slate-light/40"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                                {filteredCountries.map(nation => {
                                    const isSelected = selectedCodes.includes(nation.country);
                                    return (
                                        <button
                                            key={nation.country}
                                            onClick={() => toggleCountry(nation.country)}
                                            className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all mb-1 group uppercase ${isSelected ? 'bg-cobalt/10 border border-cobalt/20' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-cobalt shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-slate-700'}`} />
                                                <span className={`text-[10px] font-mono font-bold truncate ${isSelected ? 'text-foreground' : 'text-slate-light group-hover:text-foreground'}`}>
                                                    {nation.name}
                                                </span>
                                            </div>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-cobalt shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {selectedCodes.length < 2 && (
                                <div className="p-4 border-t border-border bg-amber-500/5">
                                    <div className="flex gap-2 text-[9px] font-mono text-amber-500 leading-normal">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>SELECT AT LEAST TWO NATIONS TO GENERATE OVERLAY ANALYTICS</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {/* Header */}
                            <div className="h-14 lg:h-16 flex items-center justify-between px-6 border-b border-border bg-background/50 shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="hidden sm:flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-emerald-500" />
                                        <span className="text-[10px] font-mono font-bold text-slate-light tracking-widest uppercase truncate whitespace-nowrap">STRATEGIC ANOMALY RADAR</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        {selectedCountries.map((c, i) => (
                                            <div key={c.country} className="w-6 h-6 rounded-full border border-background bg-slate-800 flex items-center justify-center text-[8px] font-bold text-white shadow-lg" title={c.name}>
                                                {c.country.substring(0, 2)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 hover:bg-background rounded-full transition-all border border-transparent hover:border-border text-slate-light hover:text-foreground"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Main Body */}
                            <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
                                {selectedCodes.length >= 2 ? (
                                    <div className="h-full flex flex-col gap-10">
                                        {/* Visualization Grid */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 min-h-[400px]">
                                            <div className="bg-black/20 border border-border/50 rounded-2xl p-6 relative">
                                                <div className="absolute top-4 left-4 flex items-center gap-2">
                                                    <span className="text-[10px] font-mono font-bold text-cobalt uppercase tracking-[0.2em]">METRIC OVERLAY</span>
                                                    <div className="h-px w-8 bg-cobalt/30" />
                                                </div>
                                                {renderCharts && <CountryRadarChart countries={selectedCountries} />}
                                            </div>

                                            <div className="space-y-6">
                                                <div className="p-5 bg-background border border-border rounded-2xl">
                                                    <h3 className="text-xs font-bold font-mono text-foreground mb-4 flex items-center gap-2">
                                                        <Info className="w-4 h-4 text-cobalt" /> ANALYTICAL SUMMARY
                                                    </h3>
                                                    <div className="space-y-4">
                                                        <p className="text-[10px] text-slate-light leading-relaxed italic">
                                                            Currently comparing {selectedCountries.length} tactical nodes. High variance detected in "FOREIGN INFLUENCE" vs "SOVEREIGNTY" metrics across the selection.
                                                        </p>
                                                        <hr className="border-border/30" />
                                                        <div className="grid grid-cols-1 gap-3 font-mono text-[9px]">
                                                            {selectedCountries.map(c => (
                                                                <div key={c.country} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                                                                    <span className="font-bold uppercase">{c.name}</span>
                                                                    <div className="flex gap-4">
                                                                        <span className="text-emerald-500 font-bold">SOV: {c.axisScore}</span>
                                                                        <span className="text-amber-500 font-bold">RES: {c.resourceWealth}</span>
                                                                        <span className={`${c.trend.startsWith('+') ? 'text-emerald-500' : 'text-red-500'} font-bold`}>{c.trend}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                                    <div className="flex items-center gap-2 text-emerald-500 font-bold font-mono text-[10px] mb-2">
                                                        <TrendingUp className="w-4 h-4" /> SOVEREIGN ANCHOR IDENTIFIED
                                                    </div>
                                                    <p className="text-[10px] text-emerald-500/80 leading-relaxed font-mono">
                                                        {selectedCountries.sort((a, b) => b.axisScore - a.axisScore)[0]?.name.toUpperCase()} exhibits the highest sovereignty-to-resource ratio in this comparison set.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Comparison Table */}
                                        <div className="overflow-x-auto rounded-xl border border-border">
                                            <table className="w-full text-left font-mono text-[9px] border-collapse">
                                                <thead>
                                                    <tr className="bg-background/80">
                                                        <th className="p-4 border-b border-border uppercase">METRIC / COUNTRY</th>
                                                        {selectedCountries.map(c => (
                                                            <th key={c.country} className="p-4 border-b border-border border-l border-border uppercase text-center font-bold text-cobalt">{c.name}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[
                                                        { label: "AXIS SCORE (SOVEREIGNTY)", key: "axisScore" },
                                                        { label: "RESOURCE WEALTH (VALUATION)", key: "resourceWealth" },
                                                        { label: "INFRASTRUCTURE CONTROL", key: "infrastructureControl" },
                                                        { label: "POLICY INDEPENDENCE", key: "policyIndependence" },
                                                        { label: "CURRENCY STABILITY index", key: "currencyStability" }
                                                    ].map((row, rIdx) => (
                                                        <tr key={row.key} className={rIdx % 2 === 0 ? "bg-white/5" : "bg-transparent"}>
                                                            <td className="p-4 border-b border-border uppercase font-bold text-slate-light">{row.label}</td>
                                                            {selectedCountries.map(c => (
                                                                <td key={c.country} className="p-4 border-b border-border border-l border-border text-center">
                                                                    <span className={`text-[11px] font-bold ${(c as any)[row.key] > 75 ? 'text-emerald-500' :
                                                                            (c as any)[row.key] < 50 ? 'text-red-500' : 'text-foreground'
                                                                        }`}>
                                                                        {(c as any)[row.key]}%
                                                                    </span>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-10 gap-6">
                                        <div className="w-20 h-20 rounded-full bg-cobalt/5 border border-cobalt/20 flex items-center justify-center relative">
                                            <Combine className="w-10 h-10 text-cobalt opacity-30" />
                                            <div className="absolute inset-0 border-2 border-cobalt/40 border-dashed rounded-full animate-[spin_10s_linear_infinite]" />
                                        </div>
                                        <div className="max-w-xs space-y-3">
                                            <h3 className="text-sm font-bold font-mono text-foreground tracking-[0.3em] uppercase">AWAITING TARGETS</h3>
                                            <p className="text-[10px] text-slate-light font-mono leading-relaxed">
                                                Please select multiple nations from the dispatch panel to begin comparative strategic synthesis.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer info */}
                            <div className="h-10 border-t border-border px-6 flex items-center justify-between opacity-30 font-mono text-[8px] tracking-widest bg-black/40 uppercase">
                                <span>AXIS ENABLYTICS ENGINE // COMPARISON CORE</span>
                                <span>ST-COM-v.1.0</span>
                            </div>
                        </div>
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
}
