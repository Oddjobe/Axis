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
                                            <div className="flex justify-between"><span>Infrastructure Control</span> <span className="text-green-500">88/100</span></div>
                                            <div className="flex justify-between"><span>Policy Independence</span> <span className="text-yellow-500">65/100</span></div>
                                            <div className="flex justify-between"><span>Currency Stability</span> <span className="text-red-500">42/100</span></div>
                                        </div>
                                    </div>

                                    <div className="bg-background/50 border border-border p-5 rounded-lg">
                                        <h3 className="text-xs font-bold text-slate-light mb-4 flex items-center gap-2 font-mono">
                                            <Cpu className="w-4 h-4" /> KEY INITIATIVES
                                        </h3>
                                        <div className="space-y-3">
                                            {countryData.highlights.map((h: string, i: number) => (
                                                <div key={i} className="flex flex-col border-l-2 border-cobalt pl-3 py-1">
                                                    <span className="text-sm border flex font-bold">{h}</span>
                                                    <span className="text-xs text-slate-light font-mono mt-1">Accelerating phase implementation, tracking 15% ahead of AfCFTA targets.</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="border border-border rounded-lg bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1)_0%,transparent_70%)] flex items-center justify-center p-8">
                                    {/* Abstract Map/Radar visual placeholder */}
                                    <div className="relative w-full aspect-square border border-cobalt/20 rounded-full flex items-center justify-center">
                                        <div className="w-3/4 aspect-square border-2 border-dashed border-cobalt/30 rounded-full animate-[spin_60s_linear_infinite]" />
                                        <div className="absolute w-1/2 aspect-square border border-cobalt/50 rounded-full" />
                                        <Hexagon className="absolute w-1/4 h-1/4 text-cobalt animate-pulse" />
                                        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,1)] animate-ping" />
                                        <div className="absolute bottom-1/3 right-1/4 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "EXPORTS" && (
                            <div className="grid grid-cols-1 gap-4 animate-in fade-in zoom-in-95 duration-500">
                                <h3 className="text-xs font-bold text-slate-light mb-2 font-mono border-b border-border pb-2">COMMODITY PIPELINE & PARTNERSHIPS</h3>
                                {[
                                    { resource: "REFINED COPPER", volume: "2.4M Tons", destination: "Asia Pacific", value: "$18.2B", status: "ON TRACK" },
                                    { resource: "LITHIUM CONCENTRATE", volume: "180K Tons", destination: "Domestic Processing", value: "$4.1B", status: "RESTRICTED EXPORT" },
                                    { resource: "COBALT SULPHATE", volume: "55K Tons", destination: "EU / Americas", value: "$2.8B", status: "RENEGOTIATING" },
                                ].map((row, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 border border-border/50 bg-background/30 rounded-lg font-mono hover:bg-white/5 transition-colors cursor-default">
                                        <div className="flex flex-col w-1/4">
                                            <span className="text-xs text-slate-light">RESOURCE</span>
                                            <span className="font-bold text-sm text-cobalt">{row.resource}</span>
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
                                {[
                                    { title: "IMF CONDITIONALITY PRESSURE", severty: "HIGH", details: "Pending loan disbursement delayed due to refusal to privatize state energy grid." },
                                    { title: "UNAUTHORIZED MINING LEASES", severty: "MEDIUM", details: "Reviewing legacy contracts signed prior to 2012 sovereign wealth mandate." },
                                    { title: "SUPPLY CHAIN BOTTLENECKS", severty: "LOW", details: "Port infrastructure congestion at primary export terminal causing 4-day delays." }
                                ].map((alert, i) => (
                                    <div key={i} className="border-l-4 border-red-500 bg-red-500/5 p-4 rounded-r-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-sm tracking-wide">{alert.title}</h4>
                                            <span className="text-[10px] font-mono px-2 py-1 bg-red-500/20 text-red-500 rounded border border-red-500/30">SEVERITY: {alert.severty}</span>
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
