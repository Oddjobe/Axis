"use client"

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, Zap, Target, BarChart3, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface BriefingData {
    overview: string;
    risks: { title: string, detail: string }[];
    opportunities: { title: string, detail: string }[];
    indices: {
        sovereigntyRestoration: number;
        extractivePressure: number;
        regionalStability: number;
    };
    status: string;
    timestamp: string;
}

interface AiBriefingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AiBriefingModal({ isOpen, onClose }: AiBriefingModalProps) {
    const [data, setData] = useState<BriefingData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const fetchBriefing = async () => {
                setLoading(true);
                try {
                    const res = await fetch('/api/briefing');
                    const json = await res.json();
                    if (json.success) setData(json.briefing);
                } catch (err) {
                    console.error("Briefing failed", err);
                } finally {
                    setLoading(false);
                }
            };
            fetchBriefing();
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[120]"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className="fixed inset-0 m-auto w-full max-w-2xl h-fit max-h-[90vh] bg-[#0c0c0c] border border-cobalt/30 rounded-2xl shadow-[0_0_60px_rgba(37,99,235,0.15)] z-[130] flex flex-col overflow-hidden font-mono"
                    >
                        {/* Header / Tactical Title */}
                        <div className="p-5 border-b border-border bg-cobalt/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded bg-cobalt/20 border border-cobalt/40 flex items-center justify-center relative shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                                    <ShieldAlert className="w-6 h-6 text-cobalt" />
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-black" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold tracking-[0.2em] text-foreground">EXECUTIVE SITREP // v2.4</h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] text-emerald-500/80 font-bold uppercase tracking-widest">{data?.status || 'INITIALIZING...'}</span>
                                        <span className="text-[9px] text-slate-light ml-2 uppercase opacity-50 flex items-center gap-1">
                                            <Clock className="w-2.5 h-2.5" />
                                            {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--:--'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-lg border border-transparent hover:border-border transition-colors text-slate-light hover:text-foreground"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="w-10 h-10 border-2 border-cobalt/20 border-t-cobalt rounded-full animate-spin" />
                                    <span className="text-[10px] text-cobalt tracking-[0.3em] font-bold animate-pulse">SYNTHESIZING VETTED INTEL...</span>
                                </div>
                            ) : (
                                <>
                                    {/* Overview Card */}
                                    <div className="relative group">
                                        <div className="absolute -inset-2 bg-gradient-to-r from-cobalt/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
                                        <div className="relative p-4 bg-background/40 border border-border rounded-xl">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Zap className="w-4 h-4 text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">STRATEGIC OVERVIEW</span>
                                            </div>
                                            <p className="text-xs leading-relaxed text-slate-light/90 italic">
                                                "{data?.overview}"
                                            </p>
                                        </div>
                                    </div>

                                    {/* Risk Indices */}
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: "SOVEREIGNTY", value: data?.indices.sovereigntyRestoration, color: "text-emerald-500" },
                                            { label: "EXTRACTION", value: data?.indices.extractivePressure, color: "text-red-500" },
                                            { label: "STABILITY", value: data?.indices.regionalStability, color: "text-amber-500" }
                                        ].map((idx) => (
                                            <div key={idx.label} className="p-3 bg-black/40 border border-border rounded-lg text-center">
                                                <span className="text-[8px] text-slate-light font-bold mb-1 block opacity-60 uppercase">{idx.label} INDEX</span>
                                                <span className={`text-xl font-bold font-mono tracking-tighter ${idx.color}`}>{(idx.value || 0).toFixed(1)}</span>
                                                <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(idx.value || 0) * 10}%` }}
                                                        className={`h-full ${idx.color.replace('text', 'bg')}`}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Risks & Threats */}
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-bold text-red-500 flex items-center gap-2 tracking-[0.2em] mb-4">
                                            <AlertTriangle className="w-4 h-4" />
                                            CRITICAL THREAT VECTORS
                                        </h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {data?.risks.map((risk, i) => (
                                                <div key={i} className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex gap-4 transition-all hover:bg-red-500/10 hover:border-red-500/40 hover:translate-x-1 group">
                                                    <div className="p-2 h-fit bg-red-500/10 rounded border border-red-500/30">
                                                        <Target className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[11px] font-bold text-red-400 uppercase mb-1">{risk.title}</h4>
                                                        <p className="text-[10px] leading-relaxed text-slate-light/80">{risk.detail}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Opportunities */}
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-bold text-emerald-500 flex items-center gap-2 tracking-[0.2em] mb-4 uppercase">
                                            <ShieldCheck className="w-4 h-4" />
                                            Sovereignty Growth Markers
                                        </h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {data?.opportunities.map((opp, i) => (
                                                <div key={i} className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex gap-4 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:translate-x-1 group">
                                                    <div className="p-2 h-fit bg-emerald-500/10 rounded border border-emerald-500/30">
                                                        <BarChart3 className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[11px] font-bold text-emerald-400 uppercase mb-1">{opp.title}</h4>
                                                        <p className="text-[10px] leading-relaxed text-slate-light/80">{opp.detail}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Footer Branding */}
                                    <div className="pt-6 border-t border-border flex justify-between items-center opacity-40">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-bold tracking-widest uppercase">AXIS OSINT SYSTEM</span>
                                            <div className="w-4 h-px bg-border " />
                                            <span className="text-[8px] tracking-widest uppercase font-mono italic">VETTED SITREP (CONFIDENTIAL)</span>
                                        </div>
                                        <span className="text-[8px] font-bold">© 2024</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
