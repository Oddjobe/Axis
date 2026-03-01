import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, ShieldAlert, BarChart3, ArrowRight, Activity, Cpu, Hexagon, Download, Star, BrainCircuit } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { useWatchlist } from "@/lib/use-watchlist";

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
    gdp?: number | string;
    topExport?: string;
    fdiClimate?: string;
    strategicFocus?: string;
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
    const [isExporting, setIsExporting] = useState(false);
    const { watchlist, togglePin } = useWatchlist();
    const isPinned = countryData ? watchlist.includes(countryData.country) : false;

    const calculateSmartMetrics = () => {
        if (!countryData) return null;

        // FDI Dependency
        const safeExports = countryData.exportsData || [];
        const uniqueDestinations = new Set(safeExports.map(e => e.destination)).size;
        const topDest = safeExports[0]?.destination || "Unknown";
        const fdiRiskLevel = uniqueDestinations <= 1 ? "HIGH RISK" : "DIVERSIFIED";
        const fdiColor = uniqueDestinations <= 1 ? "text-red-500 bg-red-500/10 border-red-500/30" : "text-green-500 bg-green-500/10 border-green-500/30";
        const fdiDetail = uniqueDestinations <= 1 ? `Heavily reliant on ${topDest.toUpperCase()}` : `Exports distributed across ${uniqueDestinations} regions`;

        // Resource Monopoly
        const safeResources = countryData.keyResources || [];
        const resCount = safeResources.length;
        const diversityLevel = resCount >= 4 ? "RESILIENT" : resCount === 3 ? "EMERGING" : "VULNERABLE";
        const diversityColor = resCount >= 4 ? "text-green-500 bg-green-500/10 border-green-500/30" : resCount === 3 ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" : "text-red-500 bg-red-500/10 border-red-500/30";
        const diversityDetail = `Controls ${resCount} strategic ${resCount === 1 ? 'resource' : 'resources'}`;

        // Geopolitical Heat
        const safeFriction = countryData.frictionVectors || [];
        const highFrictionCount = safeFriction.filter(v => v.severity === "HIGH").length;
        const medFrictionCount = safeFriction.filter(v => v.severity === "MEDIUM").length;
        const heatScore = (highFrictionCount * 10) + (medFrictionCount * 5) + (safeFriction.length * 2);
        const heatLevel = heatScore >= 15 ? "ELEVATED" : heatScore >= 10 ? "MODERATE" : "STABLE";
        const heatColor = heatScore >= 15 ? "text-red-500 bg-red-500/10 border-red-500/30" : heatScore >= 10 ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" : "text-green-500 bg-green-500/10 border-green-500/30";
        const heatDetail = `Calculated friction severity score: ${heatScore}/30`;

        return { fdiRiskLevel, fdiColor, fdiDetail, diversityLevel, diversityColor, diversityDetail, heatLevel, heatColor, heatDetail };
    };
    const metrics = calculateSmartMetrics();

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleExportPDF = async () => {
        const modalElement = document.getElementById("dossier-modal-content");
        if (!modalElement || !countryData) return;

        try {
            setIsExporting(true);

            // Wait for React to process state
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(modalElement, {
                scale: 2,
                backgroundColor: "#050A15", // Force dark dashboard background
                useCORS: true,
                logging: false,
                windowWidth: modalElement.scrollWidth,
                windowHeight: modalElement.scrollHeight
            });

            // Ensure dimensions are valid
            if (canvas.width === 0 || canvas.height === 0) {
                throw new Error("Canvas dimensions are zero");
            }

            const imgData = canvas.toDataURL("image/jpeg", 0.95);

            // Calculate format correctly for pt
            const pdfWidth = canvas.width / 2;
            const pdfHeight = canvas.height / 2;

            const pdf = new jsPDF({
                orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
                unit: "px",
                format: [pdfWidth, pdfHeight],
            });

            pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
            pdf.save(`AXIS_DOSSIER_${countryData.country}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("PDF Export failed:", error);
            alert("Error generating PDF dossier. Check console for details.");
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen || !countryData || !mounted) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl sm:p-6"
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="w-full h-full sm:h-auto max-w-4xl sm:max-h-[85vh] bg-panel sm:border border-border sm:rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative sm:my-auto"
                    id="dossier-modal-content"
                >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-border bg-gradient-to-b from-black/5 to-transparent dark:from-white/5 gap-4 sm:gap-0 relative">
                        <div className="flex items-center gap-3 sm:gap-4 pr-10 sm:pr-0">
                            <div className="w-14 h-14 bg-cobalt/20 border-2 border-cobalt/50 rounded-full flex items-center justify-center font-bold text-xl text-cobalt shadow-[0_0_20px_rgba(37,99,235,0.4)] shrink-0">
                                {countryData.country}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1 mt-0.5">
                                    <h2 className="text-2xl sm:text-3xl font-black tracking-widest uppercase">{countryData.name}</h2>
                                    <span className={`text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full border tracking-wide whitespace-nowrap ${countryData.status === 'OPTIMAL' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30' :
                                        countryData.status === 'EXTRACTIVE' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' :
                                            'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
                                        }`}>
                                        STATUS: {countryData.status}
                                    </span>
                                </div>
                                <div className="text-[10px] sm:text-xs font-mono text-slate-light flex gap-2 items-center">
                                    POPULATION: <span className="font-bold text-foreground">{countryData.population}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto hide-scrollbar pb-2 sm:pb-0">
                            <button
                                onClick={() => countryData && togglePin(countryData.country)}
                                className={`flex items-center justify-center p-2 rounded border transition-colors shrink-0 ${isPinned
                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                    : "bg-black/10 dark:bg-white/5 border-transparent text-slate-light hover:text-amber-500/80 hover:bg-amber-500/10"
                                    }`}
                                title={isPinned ? "Remove from Watchlist" : "Pin to Watchlist"}
                            >
                                <Star className={`w-4 h-4 ${isPinned ? "fill-amber-500" : ""}`} />
                            </button>
                            <button
                                onClick={handleExportPDF}
                                disabled={isExporting}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded bg-cobalt/10 border border-cobalt/30 text-[10px] font-bold tracking-widest transition-colors shrink-0 ${isExporting ? "opacity-50 cursor-not-allowed text-cobalt/50" : "text-cobalt hover:bg-cobalt/20 hover:border-cobalt/50"}`}
                            >
                                <Download className="w-3.5 h-3.5" /> <span className="whitespace-nowrap">{isExporting ? "ENCRYPTING PDF..." : "EXPORT DOSSIER"}</span>
                            </button>
                        </div>
                        <button onClick={onClose} className="absolute top-4 right-4 sm:static p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-slate-light hover:text-foreground shrink-0">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-border px-4 sm:px-6 mt-4 gap-6 text-sm font-mono tracking-wider overflow-x-auto hide-scrollbar whitespace-nowrap">
                        <button
                            onClick={() => setActiveTab("STRATEGY")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 shrink-0 ${activeTab === "STRATEGY" ? "border-cobalt text-cobalt font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <Globe className="w-4 h-4" /> STRATEGY
                        </button>
                        <button
                            onClick={() => setActiveTab("EXPORTS")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 shrink-0 ${activeTab === "EXPORTS" ? "border-green-500 text-green-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <BarChart3 className="w-4 h-4" /> EXPORTS
                        </button>
                        <button
                            onClick={() => setActiveTab("FRICTION")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 shrink-0 ${activeTab === "FRICTION" ? "border-red-500 text-red-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <ShieldAlert className="w-4 h-4" /> FRICTION
                        </button>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gradient-to-b from-transparent to-black/5 dark:to-white/5">
                        {activeTab === "STRATEGY" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="space-y-6">
                                    <div className="bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 rounded-2xl relative shadow-sm hover:shadow-md transition-shadow">
                                        <div className="absolute top-4 right-4">
                                            <span className="text-[10px] font-bold px-2 py-1 bg-cobalt/10 text-cobalt rounded-full border border-cobalt/20">Live Sync</span>
                                        </div>
                                        <h3 className="text-xs font-bold text-slate-light mb-2 flex items-center gap-2 font-mono uppercase tracking-wider">
                                            <Activity className="w-4 h-4 text-cobalt" /> Composite Capability
                                        </h3>
                                        <div className="flex flex-col items-center justify-center my-6 relative">
                                            <span className="text-7xl sm:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-br from-black to-slate-500 dark:from-white dark:to-zinc-500">
                                                {countryData.axisScore}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-light font-bold mt-1 tracking-widest uppercase">/ 100 Axis Score</span>
                                        </div>
                                        <div className="space-y-4 font-mono text-[11px] border-t border-black/5 dark:border-white/5 pt-4">
                                            <div className="flex justify-between items-center group"><span className="text-slate-light group-hover:text-foreground transition-colors">Infrastructure Control</span> <span className={`font-bold ${countryData.infrastructureControl >= 60 ? 'text-green-600 dark:text-green-400' : countryData.infrastructureControl >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{countryData.infrastructureControl}/100</span></div>
                                            <div className="flex justify-between items-center group"><span className="text-slate-light group-hover:text-foreground transition-colors">Policy Independence</span> <span className={`font-bold ${countryData.policyIndependence >= 60 ? 'text-green-600 dark:text-green-400' : countryData.policyIndependence >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{countryData.policyIndependence}/100</span></div>
                                            <div className="flex justify-between items-center group"><span className="text-slate-light group-hover:text-foreground transition-colors">Currency Stability</span> <span className={`font-bold ${countryData.currencyStability >= 60 ? 'text-green-600 dark:text-green-400' : countryData.currencyStability >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>{countryData.currencyStability}/100</span></div>
                                        </div>
                                    </div>

                                    <div className="bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 rounded-2xl relative shadow-sm hover:shadow-md transition-shadow">
                                        <div className="absolute top-4 right-4">
                                            <span className="text-[10px] font-bold px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full border border-green-500/20">Verified</span>
                                        </div>
                                        <h3 className="text-xs font-bold text-slate-light mb-4 flex items-center gap-2 font-mono uppercase tracking-wider">
                                            <Cpu className="w-4 h-4" /> Key Initiatives
                                        </h3>
                                        <div className="space-y-4">
                                            {(countryData.keyInitiatives || []).map((init, i: number) => (
                                                <div key={i} className="flex flex-col border-l-2 border-cobalt/50 pl-3 py-1 bg-white/30 dark:bg-transparent rounded-r pr-2">
                                                    <span className="text-sm font-bold text-foreground">{init.title.toUpperCase()}</span>
                                                    <span className="text-xs text-slate-light font-mono mt-1 leading-relaxed">{init.details}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {metrics && (
                                        <div className="bg-background/50 border border-border p-5 rounded-lg">
                                            <h3 className="text-xs font-bold text-slate-light mb-4 flex items-center gap-2 font-mono">
                                                <BrainCircuit className="w-4 h-4 text-purple-500" /> AI SMART METRICS
                                            </h3>
                                            <div className="space-y-4 font-mono text-xs">
                                                <div className="flex flex-col">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-slate-light">FDI Dependency</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${metrics.fdiColor}`}>{metrics.fdiRiskLevel}</span>
                                                    </div>
                                                    <div className="text-[9px] text-slate-500 tracking-wide">{metrics.fdiDetail}</div>
                                                </div>

                                                <div className="flex flex-col">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-slate-light">Resource Monopoly</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${metrics.diversityColor}`}>{metrics.diversityLevel}</span>
                                                    </div>
                                                    <div className="text-[9px] text-slate-500 tracking-wide">{metrics.diversityDetail}</div>
                                                </div>

                                                <div className="flex flex-col">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-slate-light">Geopolitical Heat</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${metrics.heatColor}`}>{metrics.heatLevel}</span>
                                                    </div>
                                                    <div className="text-[9px] text-slate-500 tracking-wide">{metrics.heatDetail}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="border border-border rounded-lg bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.05)_0%,transparent_70%)] flex flex-col items-center justify-center p-6 sm:p-8">
                                    <h3 className="text-xs font-bold text-slate-light mb-6 self-start flex items-center gap-2 font-mono">
                                        <Globe className="w-4 h-4" /> CAPABILITY RADAR
                                    </h3>
                                    {/* Quantitative Radar Chart */}
                                    <div className="relative w-full aspect-square max-w-[280px] flex items-center justify-center">
                                        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                                            {/* Background concentric rings (25, 50, 75, 100) */}
                                            {[25, 50, 75, 100].map(r => (
                                                <polygon
                                                    key={`bg-${r}`}
                                                    points={`50,${50 - (r * 0.4)} ${50 + (r * 0.4)},50 50,${50 + (r * 0.4)} ${50 - (r * 0.4)},50`}
                                                    fill="none"
                                                    stroke="rgba(37, 99, 235, 0.15)"
                                                    strokeWidth={r === 100 ? "1" : "0.5"}
                                                    strokeDasharray={r === 100 ? "" : "2,2"}
                                                />
                                            ))}

                                            {/* Axis Lines (Vertical and Horizontal) */}
                                            <line x1="50" y1="10" x2="50" y2="90" stroke="rgba(37, 99, 235, 0.3)" strokeWidth="0.5" />
                                            <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(37, 99, 235, 0.3)" strokeWidth="0.5" />

                                            {/* Rendered Data Polygon */}
                                            {(() => {
                                                // Function to scale a 0-100 score to SVG coordinates on a rhombus
                                                // Max radius is 40. Top is 10, Bottom is 90, Left is 10, Right is 90
                                                const getPoints = () => {
                                                    const top = 50 - (Math.min(100, Math.max(0, countryData.infrastructureControl)) / 100) * 40;
                                                    const right = 50 + (Math.min(100, Math.max(0, countryData.policyIndependence)) / 100) * 40;
                                                    const bottom = 50 + (Math.min(100, Math.max(0, countryData.resourceWealth)) / 100) * 40;
                                                    const left = 50 - (Math.min(100, Math.max(0, countryData.currencyStability)) / 100) * 40;
                                                    return `50,${top} ${right},50 50,${bottom} ${left},50`;
                                                };
                                                return (
                                                    <polygon
                                                        points={getPoints()}
                                                        fill="rgba(37, 99, 235, 0.2)"
                                                        stroke="rgba(37, 99, 235, 0.8)"
                                                        strokeWidth="1.5"
                                                        className="transition-all duration-1000 ease-out"
                                                    />
                                                );
                                            })()}

                                            {/* Central Dot */}
                                            <circle cx="50" cy="50" r="1.5" fill="rgba(37, 99, 235, 0.8)" />

                                            {/* Data Points (Knots) */}
                                            {(() => {
                                                const top = 50 - (Math.min(100, Math.max(0, countryData.infrastructureControl)) / 100) * 40;
                                                const right = 50 + (Math.min(100, Math.max(0, countryData.policyIndependence)) / 100) * 40;
                                                const bottom = 50 + (Math.min(100, Math.max(0, countryData.resourceWealth)) / 100) * 40;
                                                const left = 50 - (Math.min(100, Math.max(0, countryData.currencyStability)) / 100) * 40;

                                                const getColor = (val: number) => val >= 60 ? 'text-green-500' : val >= 40 ? 'text-yellow-500' : 'text-red-500';

                                                return (
                                                    <>
                                                        <circle cx="50" cy={top} r="2" fill="white" stroke="rgba(37, 99, 235, 1)" strokeWidth="1" />
                                                        <circle cx={right} cy="50" r="2" fill="white" stroke="rgba(37, 99, 235, 1)" strokeWidth="1" />
                                                        <circle cx="50" cy={bottom} r="2" fill="white" stroke="rgba(37, 99, 235, 1)" strokeWidth="1" />
                                                        <circle cx={left} cy="50" r="2" fill="white" stroke="rgba(37, 99, 235, 1)" strokeWidth="1" />

                                                        {/* Animated Score Tooltips/Labels next to the knots could go here, but fixed labels are better for clarity */}
                                                    </>
                                                )
                                            })()}

                                            {/* Axis Labels with Scores */}
                                            {(() => {
                                                const getColor = (val: number) => val >= 60 ? 'text-green-500 font-bold' : val >= 40 ? 'text-yellow-500 font-bold' : 'text-red-500 font-bold';

                                                return (
                                                    <>
                                                        {/* Top: INFRA */}
                                                        <text x="50" y="2" textAnchor="middle" fill="currentColor" className="text-[4px] font-mono font-bold text-slate-400">INFRA</text>
                                                        <text x="50" y="8" textAnchor="middle" fill="currentColor" className={`text-[6px] font-mono ${getColor(countryData.infrastructureControl)}`}>{countryData.infrastructureControl}</text>

                                                        {/* Right: POLICY */}
                                                        <text x="96" y="48" textAnchor="start" fill="currentColor" className="text-[4px] font-mono font-bold text-slate-400">POLICY</text>
                                                        <text x="96" y="54" textAnchor="start" fill="currentColor" className={`text-[6px] font-mono ${getColor(countryData.policyIndependence)}`}>{countryData.policyIndependence}</text>

                                                        {/* Bottom: RESOURCES */}
                                                        <text x="50" y="96" textAnchor="middle" fill="currentColor" className={`text-[6px] font-mono ${getColor(countryData.resourceWealth)}`}>{countryData.resourceWealth}</text>
                                                        <text x="50" y="101" textAnchor="middle" fill="currentColor" className="text-[4px] font-mono font-bold text-slate-400">RESOURCES</text>

                                                        {/* Left: CURRENCY */}
                                                        <text x="4" y="48" textAnchor="end" fill="currentColor" className="text-[4px] font-mono font-bold text-slate-400">CURRENCY</text>
                                                        <text x="4" y="54" textAnchor="end" fill="currentColor" className={`text-[6px] font-mono ${getColor(countryData.currencyStability)}`}>{countryData.currencyStability}</text>
                                                    </>
                                                );
                                            })()}
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "EXPORTS" && (
                            <div className="grid grid-cols-1 gap-4 animate-in fade-in zoom-in-95 duration-500">
                                <h3 className="text-xs font-bold text-slate-light mb-2 font-mono border-b border-border pb-2">COMMODITY PIPELINE & PARTNERSHIPS</h3>
                                {(countryData.exportsData || []).map((row, i) => (
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
                                <h3 className="text-xs font-bold text-red-500 mb-2 font-mono flex items-center gap-2 uppercase tracking-wider border-b border-border pb-2">
                                    <ShieldAlert className="w-4 h-4" /> Active Threat Vectors
                                </h3>
                                {countryData.frictionVectors.map((alert, i) => (
                                    <div key={i} className="bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 p-5 rounded-xl relative shadow-sm hover:shadow-md transition-shadow">
                                        <div className="absolute top-4 right-4">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${alert.severity === "HIGH" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                                                "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                                                }`}>
                                                {alert.severity} Risk
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-sm tracking-wide mb-2 pr-20">{alert.title}</h4>
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
