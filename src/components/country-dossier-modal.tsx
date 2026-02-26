import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, ShieldAlert, BarChart3, ArrowRight, Activity, Cpu, Hexagon } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export interface CountryData {
    country: string;
    name: string;
    axisScore: number;
    trend: string;
    highlights: string[];
    status: string;
    population: string;
    resourceWealth: number;       // 0-100 natural resource endowment score
    keyResources: string[];       // Top 2-3 resources
    infrastructureControl: number;
    policyIndependence: number;
    currencyStability: number;
    keyInitiatives: { title: string, details: string }[];
    exportsData: { resource: string, volume: string, destination: string, value: string, status: string }[];
    frictionVectors: { title: string, severity: string, details: string }[];
}

export interface CountryDossierProps {
    isOpen: boolean;
    onClose: () => void;
    countryData: CountryData | null;
}

export default function CountryDossierModal({ isOpen, onClose, countryData }: CountryDossierProps) {
    const [activeTab, setActiveTab] = useState<"STRATEGY" | "EXPORTS" | "FRICTION">("STRATEGY");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !countryData || !mounted) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl p-6"
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="w-full max-w-4xl max-h-[85vh] bg-panel border border-border rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-border bg-black/5 dark:bg-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-cobalt/20 border border-cobalt/50 rounded-lg flex items-center justify-center font-bold text-xl text-cobalt shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                                {countryData.country}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-widest uppercase">{countryData.name}</h2>
                                <div className="text-xs font-mono text-slate-light flex gap-2 items-center mt-1">
                                    <span className={`w-2 h-2 rounded-full animate-pulse ${countryData.axisScore >= 70 ? 'bg-green-500' : 'bg-red-500'}`} />
                                    SOVEREIGNTY STATUS: <span className="text-foreground font-bold">{countryData.status}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-slate-light hover:text-foreground">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-border px-6 mt-4 gap-6 text-sm font-mono tracking-wider">
                        <button
                            onClick={() => setActiveTab("STRATEGY")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === "STRATEGY" ? "border-cobalt text-cobalt font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <Globe className="w-4 h-4" /> STRATEGY
                        </button>
                        <button
                            onClick={() => setActiveTab("EXPORTS")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === "EXPORTS" ? "border-green-500 text-green-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <BarChart3 className="w-4 h-4" /> EXPORTS
                        </button>
                        <button
                            onClick={() => setActiveTab("FRICTION")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === "FRICTION" ? "border-red-500 text-red-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <ShieldAlert className="w-4 h-4" /> FRICTION
                        </button>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-transparent to-black/5 dark:to-white/5">
                        {activeTab === "STRATEGY" && (
                            <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="space-y-6">
                                    <div className="bg-background/50 border border-border p-5 rounded-lg">
                                        <h3 className="text-xs font-bold text-slate-light mb-4 flex items-center gap-2 font-mono">
                                            <Activity className="w-4 h-4" /> AXIS SCORE BREAKDOWN
                                        </h3>
                                        <div className="flex items-end gap-4 mb-4">
                                            <span className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cobalt to-green-500">
                                                {countryData.axisScore}
                                            </span>
                                            <span className="text-sm font-mono text-slate-light mb-2">/ 100</span>
                                        </div>
                                        <div className="space-y-3 font-mono text-xs">
                                            <div className="flex justify-between"><span>Infrastructure Control</span> <span className={`${countryData.infrastructureControl >= 60 ? 'text-green-500' : countryData.infrastructureControl >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>{countryData.infrastructureControl}/100</span></div>
                                            <div className="flex justify-between"><span>Policy Independence</span> <span className={`${countryData.policyIndependence >= 60 ? 'text-green-500' : countryData.policyIndependence >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>{countryData.policyIndependence}/100</span></div>
                                            <div className="flex justify-between"><span>Currency Stability</span> <span className={`${countryData.currencyStability >= 60 ? 'text-green-500' : countryData.currencyStability >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>{countryData.currencyStability}/100</span></div>
                                        </div>
                                    </div>

                                    <div className="bg-background/50 border border-border p-5 rounded-lg">
                                        <h3 className="text-xs font-bold text-slate-light mb-4 flex items-center gap-2 font-mono">
                                            <Cpu className="w-4 h-4" /> KEY INITIATIVES
                                        </h3>
                                        <div className="space-y-3">
                                            {countryData.keyInitiatives.map((init, i: number) => (
                                                <div key={i} className="flex flex-col border-l-2 border-cobalt pl-3 py-1">
                                                    <span className="text-sm border flex font-bold border-transparent">{init.title.toUpperCase()}</span>
                                                    <span className="text-xs text-slate-light font-mono mt-1">{init.details}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="border border-border rounded-lg bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1)_0%,transparent_70%)] flex items-center justify-center p-8">
                                    {/* Dynamic Radar visual showing resources & vectors mapped around the rings */}
                                    <div className="relative w-full aspect-square border border-cobalt/20 rounded-full flex items-center justify-center">
                                        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.05)_0%,transparent_100%)]" />

                                        {/* Spinning rings */}
                                        <div className="absolute w-[85%] aspect-square border border-cobalt/20 rounded-full" />
                                        <div className="w-[70%] aspect-square border-2 border-dashed border-cobalt/30 rounded-full animate-[spin_120s_linear_infinite]" />
                                        <div className="absolute w-[45%] aspect-square border border-cobalt/40 rounded-full" />

                                        {/* Core */}
                                        <div className="relative flex items-center justify-center">
                                            <Hexagon className="w-16 h-16 text-cobalt stroke-1" />
                                            <span className="absolute text-[10px] font-bold text-cobalt">{countryData.axisScore}</span>
                                        </div>

                                        {/* Render Resources on inner ring */}
                                        {countryData.keyResources.slice(0, 4).map((res, i) => {
                                            const angle = (i * (360 / Math.max(1, countryData.keyResources.slice(0, 4).length))) * (Math.PI / 180);
                                            const radius = 22; // percentage
                                            const top = 50 + radius * Math.sin(angle);
                                            const left = 50 + radius * Math.cos(angle);
                                            return (
                                                <div key={`res-${i}`} className="absolute flex flex-col items-center" style={{ top: `${top}%`, left: `${left}%`, transform: 'translate(-50%, -50%)' }}>
                                                    <div className="w-2.5 h-2.5 bg-amber-500 rounded border border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                                    <span className="text-[8px] font-mono mt-1 text-amber-500 whitespace-nowrap bg-background/80 px-1 rounded">{res.toUpperCase()}</span>
                                                </div>
                                            );
                                        })}

                                        {/* Render Initiatives on middle ring */}
                                        {countryData.keyInitiatives.map((init, i) => {
                                            const angle = (20 + i * (360 / Math.max(1, countryData.keyInitiatives.length))) * (Math.PI / 180);
                                            const radius = 35; // percentage
                                            const top = 50 + radius * Math.sin(angle);
                                            const left = 50 + radius * Math.cos(angle);
                                            return (
                                                <div key={`init-${i}`} className="absolute flex flex-col items-center" style={{ top: `${top}%`, left: `${left}%`, transform: 'translate(-50%, -50%)' }}>
                                                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse" />
                                                    <span className="text-[7px] font-mono mt-1 text-green-400 whitespace-nowrap bg-background/80 px-1 rounded">{init.title.toUpperCase()}</span>
                                                </div>
                                            );
                                        })}

                                        {/* Render Threat Vectors on outer ring */}
                                        {countryData.frictionVectors.map((frict, i) => {
                                            const angle = (45 + i * (360 / Math.max(1, countryData.frictionVectors.length))) * (Math.PI / 180);
                                            const radius = 42; // percentage
                                            const top = 50 + radius * Math.sin(angle);
                                            const left = 50 + radius * Math.cos(angle);
                                            const clr = frict.severity === "HIGH" ? "red-500" : frict.severity === "MEDIUM" ? "orange-500" : "yellow-500";
                                            return (
                                                <div key={`frict-${i}`} className="absolute flex items-center justify-center group" style={{ top: `${top}%`, left: `${left}%`, transform: 'translate(-50%, -50%)' }}>
                                                    <div className={`w-3 h-3 border-2 border-${clr} rotate-45 flex items-center justify-center bg-background`}>
                                                        <div className={`w-1 h-1 bg-${clr}`} />
                                                    </div>
                                                    <div className={`absolute -bottom-4 text-[7px] text-${clr} font-mono whitespace-nowrap bg-background/80 px-1 rounded border border-${clr}/30`}>
                                                        {frict.title.substring(0, 15)}..
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "EXPORTS" && (
                            <div className="grid grid-cols-1 gap-4 animate-in fade-in zoom-in-95 duration-500">
                                <h3 className="text-xs font-bold text-slate-light mb-2 font-mono border-b border-border pb-2">COMMODITY PIPELINE & PARTNERSHIPS</h3>
                                {countryData.exportsData.map((row, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 border border-border/50 bg-background/30 rounded-lg font-mono hover:bg-white/5 transition-colors cursor-default">
                                        <div className="flex flex-col w-1/4">
                                            <span className="text-xs text-slate-light">RESOURCE</span>
                                            <span className="font-bold text-sm text-cobalt">{row.resource.toUpperCase()}</span>
                                        </div>
                                        <div className="flex flex-col w-1/4">
                                            <span className="text-xs text-slate-light">VOLUME</span>
                                            <span className="text-sm">{row.volume}</span>
                                        </div>
                                        <div className="flex flex-col w-1/4">
                                            <span className="text-xs text-slate-light">DESTINATION</span>
                                            <span className="flex items-center gap-1 text-sm bg-black/20 dark:bg-white/10 px-2 py-0.5 rounded w-fit"><ArrowRight className="w-3 h-3" /> {row.destination}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-xs text-slate-light">VALUE (YTD)</span>
                                            <span className={`text-sm font-bold ${row.status.includes('RESTRICTED') ? 'text-orange-500' : 'text-green-500'}`}>{row.value}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === "FRICTION" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                                <h3 className="text-xs font-bold text-red-500 mb-2 font-mono flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4" /> ACTIVE THREAT VECTORS
                                </h3>
                                {countryData.frictionVectors.map((alert, i) => (
                                    <div key={i} className="border-l-4 border-red-500 bg-red-500/5 p-4 rounded-r-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-sm tracking-wide">{alert.title}</h4>
                                            <span className="text-[10px] font-mono px-2 py-1 bg-red-500/20 text-red-500 rounded border border-red-500/30">SEVERITY: {alert.severity}</span>
                                        </div>
                                        <p className="text-sm text-slate-light font-mono leading-relaxed">{alert.details}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
