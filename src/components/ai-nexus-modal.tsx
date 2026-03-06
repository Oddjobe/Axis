"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Maximize2, Share2, Network, Cpu, Database, Zap } from "lucide-react"
import AiResourceGraph from "./ai-resource-graph"

interface AiNexusModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedResource?: string | null;
}

export default function AiNexusModal({ isOpen, onClose, selectedResource }: AiNexusModalProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [contentReady, setContentReady] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setContentReady(false);
            setIsFullscreen(false);
        }
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
                        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl z-[90]"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            width: isFullscreen ? "100vw" : "min(95vw, 1200px)",
                            height: isFullscreen ? "100vh" : "80vh",
                        }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        onAnimationComplete={() => { if (isOpen) setContentReady(true); }}
                        className={`fixed inset-0 m-auto bg-panel border border-border shadow-[0_0_50px_rgba(37,99,235,0.2)] z-[100] flex flex-col overflow-hidden ${isFullscreen ? "" : "rounded-2xl"}`}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 lg:px-6 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-cobalt/20 rounded-xl border border-cobalt/30 shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                                    <Share2 className="w-5 h-5 text-cobalt animate-pulse" />
                                </div>
                                <div>
                                    <h2 className="text-sm lg:text-base font-bold tracking-[0.2em] uppercase text-foreground flex items-center gap-2">
                                        AI SUPPLY CHAIN NEXUS
                                        <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-cobalt/10 border border-cobalt/20 text-[9px] text-cobalt font-mono">v2.0 // LIVE</span>
                                    </h2>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-light tracking-wider">
                                            <Cpu className="w-3 h-3 text-emerald-500" />
                                            COMPUTE NODES
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-border" />
                                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-light tracking-wider">
                                            <Database className="w-3 h-3 text-amber-500" />
                                            RAW LITHOGY
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-border" />
                                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-light tracking-wider">
                                            <Zap className="w-3 h-3 text-cobalt" />
                                            ENERGY GRID
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                    className="p-2.5 hover:bg-background rounded-xl transition-all border border-transparent hover:border-border text-slate-light hover:text-foreground hidden sm:block"
                                    title="Toggle Fullscreen"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                                <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
                                <button
                                    onClick={onClose}
                                    className="p-2.5 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20 group"
                                >
                                    <X className="w-6 h-6 transition-transform group-hover:rotate-90" />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 relative bg-black/20 overflow-hidden">
                            {/* Technical Overlays */}
                            <div className="absolute top-6 left-6 z-10 pointer-events-none max-w-xs space-y-4">
                                <div className="p-4 bg-background/60 backdrop-blur-md border border-border rounded-xl shadow-xl">
                                    <h4 className="text-[10px] font-bold font-mono text-cobalt mb-1 tracking-widest uppercase">NETWORK TOPOLOGY</h4>
                                    <p className="text-[10px] text-slate-light leading-relaxed font-mono">
                                        Mapping the multi-stage resource dependencies required for sovereign artificial intelligence infrastructure.
                                    </p>
                                </div>
                                <div className="p-3 bg-emerald-500/5 backdrop-blur-sm border border-emerald-500/20 rounded-lg">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[9px] font-mono font-bold text-emerald-500">ENGINE STATUS</span>
                                        <span className="text-[8px] font-mono text-emerald-500/60 font-bold uppercase">Optimized</span>
                                    </div>
                                    <div className="h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: "100%" }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full bg-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="absolute bottom-6 right-6 z-10 pointer-events-none text-right">
                                <div className="p-3 bg-panel/60 backdrop-blur-md border border-border rounded-xl inline-block shadow-lg">
                                    <div className="flex items-center gap-4 text-[9px] font-mono font-bold text-slate-light">
                                        <div className="flex items-center gap-1.5 uppercase">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cobalt" />
                                            Nations
                                        </div>
                                        <div className="flex items-center gap-1.5 uppercase">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            Resources
                                        </div>
                                        <div className="flex items-center gap-1.5 uppercase">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            Influence
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* The Graph */}
                            <div className="absolute inset-0">
                                <AnimatePresence mode="wait">
                                    {contentReady ? (
                                        <motion.div
                                            key="graph-loaded"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="w-full h-full"
                                        >
                                            <AiResourceGraph selectedResource={selectedResource} />
                                        </motion.div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                            <div className="w-10 h-10 border-2 border-cobalt/20 border-t-cobalt rounded-full animate-spin" />
                                            <span className="text-[10px] font-mono text-cobalt tracking-[0.3em] font-bold animate-pulse">SYNCHRONIZING NEXUS ENGINE...</span>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Scanline Effect */}
                            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(37,99,235,0.03)_2px,rgba(37,99,235,0.03)_4px)] pointer-events-none" />
                        </div>
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
}
