import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, ShieldAlert, BarChart3, ArrowRight, Activity, Cpu, Download, Star, BrainCircuit, Newspaper, TrendingUp, Share2, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { useWatchlist } from "@/lib/use-watchlist";
import { supabase } from "@/lib/supabase";
import SovereigntyTrendlineChart from "./sovereignty-trendline-chart";

export interface CountryData {
    country: string;
    name: string;
    axisScore: number;
    trend: string;
    highlights: string[];
    status: string;
    population: string;
    resourceWealth: number;
    keyResources: string[];
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

export interface IntelligenceAlert {
    id: string;
    created_at: string;
    isoCode: string;
    title: string;
    summary: string;
    details?: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    category: string;
    source: string;
    imageUrl?: string;
    url?: string;
    actor?: string;
}

export interface CountryDossierProps {
    isOpen: boolean;
    onClose: () => void;
    countryData: CountryData | null;
}

export default function CountryDossierModal({ isOpen, onClose, countryData }: CountryDossierProps) {
    const [activeTab, setActiveTab] = useState<"STRATEGY" | "EXPORTS" | "FRICTION" | "INTEL" | "TRAJECTORY">("STRATEGY");
    const [mounted, setMounted] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showEmbed, setShowEmbed] = useState(false);
    const [intelAlerts, setIntelAlerts] = useState<IntelligenceAlert[]>([]);
    const [intelLoading, setIntelLoading] = useState(false);
    const { watchlist, togglePin } = useWatchlist();
    const isPinned = countryData ? watchlist.includes(countryData.country) : false;

    const calculateSmartMetrics = () => {
        if (!countryData) return null;

        const safeExports = countryData.exportsData || [];
        const uniqueDestinations = new Set(safeExports.map(e => e.destination)).size;
        const topDest = safeExports[0]?.destination || "Unknown";
        const fdiRiskLevel = uniqueDestinations <= 1 ? "HIGH RISK" : "DIVERSIFIED";
        const fdiColor = uniqueDestinations <= 1 ? "text-red-500 bg-red-500/10 border-red-500/30" : "text-green-500 bg-green-500/10 border-green-500/30";
        const fdiDetail = uniqueDestinations <= 1 ? `Heavily reliant on ${topDest.toUpperCase()}` : `Exports distributed across ${uniqueDestinations} regions`;

        const safeResources = countryData.keyResources || [];
        const resCount = safeResources.length;
        const diversityLevel = resCount >= 4 ? "RESILIENT" : resCount === 3 ? "EMERGING" : "VULNERABLE";
        const diversityColor = resCount >= 4 ? "text-green-500 bg-green-500/10 border-green-500/30" : resCount === 3 ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" : "text-red-500 bg-red-500/10 border-red-500/30";
        const diversityDetail = `Controls ${resCount} strategic ${resCount === 1 ? 'resource' : 'resources'}`;

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

    useEffect(() => {
        if (!countryData?.country) return;
        setIntelAlerts([]);
        setIntelLoading(true);

        supabase
            .from('intelligence_alerts')
            .select('*')
            .eq('isoCode', countryData.country)
            .order('created_at', { ascending: false })
            .limit(25)
            .then(({ data, error }) => {
                if (!error && data) setIntelAlerts(data);
                setIntelLoading(false);
            });
    }, [countryData?.country]);

    const getTimeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(mins / 60);
        const days = Math.floor(hrs / 24);
        if (mins < 1) return "JUST NOW";
        if (mins < 60) return `${mins}m ago`;
        if (hrs < 24) return `${hrs}h ago`;
        return `${days}d ago`;
    };

    const handleShare = async () => {
        if (!countryData) return;
        const shareUrl = `${window.location.origin}?country=${countryData.country}`;
        const shareData = {
            title: `${countryData.name} — AXIS Africa Intelligence`,
            text: `${countryData.name} | Score: ${countryData.axisScore}/100 | Status: ${countryData.status} — AXIS Africa Open Source Intelligence`,
            url: shareUrl,
        };
        
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (e) {
                // User cancelled or share failed
            }
        } else {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleExportPDF = async () => {
        const modalElement = document.getElementById("dossier-modal-content");
        if (!modalElement || !countryData) return;

        try {
            setIsExporting(true);
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(modalElement, {
                scale: 2,
                backgroundColor: "#050A15",
                useCORS: true,
                logging: false,
                windowWidth: modalElement.scrollWidth,
                windowHeight: modalElement.scrollHeight
            });

            if (canvas.width === 0 || canvas.height === 0) {
                throw new Error("Canvas dimensions are zero");
            }

            const imgData = canvas.toDataURL("image/jpeg", 0.95);
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-xl sm:p-6"
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
                            <button
                                onClick={handleShare}
                                className="flex items-center gap-2 px-3 py-1.5 rounded bg-cobalt/10 border border-cobalt/30 text-[10px] font-bold tracking-widest text-cobalt hover:bg-cobalt/20 hover:border-cobalt/50 transition-colors shrink-0"
                                title="Share this country dossier"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                                <span className="whitespace-nowrap hidden sm:inline">{copied ? "COPIED!" : "SHARE"}</span>
                            </button>
                            <button
                                onClick={() => setShowEmbed(!showEmbed)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded bg-cobalt/10 border border-cobalt/30 text-[10px] font-bold tracking-widest text-cobalt hover:bg-cobalt/20 hover:border-cobalt/50 transition-colors shrink-0"
                                title="Embed this country card"
                            >
                                <Cpu className="w-3.5 h-3.5" />
                                <span className="whitespace-nowrap hidden sm:inline">EMBED</span>
                            </button>
                        </div>
                        <button onClick={onClose} className="absolute top-4 right-4 sm:static p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-slate-light hover:text-foreground shrink-0">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    {showEmbed && (
                        <div className="mx-4 sm:mx-6 mt-2 p-3 bg-black/20 border border-cobalt/20 rounded-lg">
                            <p className="text-[9px] font-mono text-slate-light mb-2 tracking-wider">EMBED THIS COUNTRY CARD:</p>
                            <code className="block text-[9px] font-mono text-cobalt bg-black/40 p-2 rounded break-all select-all">
                                {`<iframe src="https://axis-mocha.vercel.app/embed/${countryData.country}" width="400" height="280" frameborder="0" style="border-radius:12px;overflow:hidden"></iframe>`}
                            </code>
                        </div>
                    )}

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
                        <button
                            onClick={() => setActiveTab("INTEL")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 shrink-0 ${activeTab === "INTEL" ? "border-amber-500 text-amber-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <Newspaper className="w-4 h-4" /> LIVE INTEL
                            {intelAlerts.length > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded-full font-bold">{intelAlerts.length}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("TRAJECTORY")}
                            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 shrink-0 ${activeTab === "TRAJECTORY" ? "border-cyan-500 text-cyan-500 font-bold" : "border-transparent text-slate-light hover:text-foreground"}`}
                        >
                            <TrendingUp className="w-4 h-4" /> TRAJECTORY
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
                                <div className="border border-border rounded-lg bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_60%)] flex flex-col items-center justify-center p-4 sm:p-6">
                                    <h3 className="text-xs font-bold text-slate-light mb-4 self-start flex items-center gap-2 font-mono">
                                        <Globe className="w-4 h-4 text-cobalt" /> CAPABILITY RADAR
                                    </h3>
                                    <div className="relative w-full aspect-square max-w-[260px] flex items-center justify-center">
                                        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                                            <defs>
                                                <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                                                    <stop offset="0%" stopColor="rgba(37,99,235,0.35)" />
                                                    <stop offset="100%" stopColor="rgba(37,99,235,0.05)" />
                                                </radialGradient>
                                                <filter id="radarGlow">
                                                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                                </filter>
                                            </defs>
                                            {/* Concentric grid rings */}
                                            {[20, 40, 60, 80, 100].map(r => (
                                                <polygon
                                                    key={`bg-${r}`}
                                                    points={`50,${50 - (r * 0.38)} ${50 + (r * 0.38)},50 50,${50 + (r * 0.38)} ${50 - (r * 0.38)},50`}
                                                    fill="none"
                                                    stroke={r === 100 ? "rgba(37,99,235,0.4)" : "rgba(37,99,235,0.12)"}
                                                    strokeWidth={r === 100 ? "0.8" : "0.4"}
                                                    strokeDasharray={r < 100 ? "1.5,2" : ""}
                                                />
                                            ))}
                                            {/* Ring labels */}
                                            {[25, 50, 75].map(r => (
                                                <text key={`lbl-${r}`} x={50 + (r * 0.38) + 1} y="51" fill="rgba(100,120,160,0.6)" fontSize="2.5" fontFamily="monospace">{r}</text>
                                            ))}
                                            {/* Axis lines */}
                                            <line x1="50" y1="12" x2="50" y2="88" stroke="rgba(37,99,235,0.25)" strokeWidth="0.4" />
                                            <line x1="12" y1="50" x2="88" y2="50" stroke="rgba(37,99,235,0.25)" strokeWidth="0.4" />
                                            {/* Diagonal guides */}
                                            <line x1="23" y1="23" x2="77" y2="77" stroke="rgba(37,99,235,0.08)" strokeWidth="0.3" strokeDasharray="1,3" />
                                            <line x1="77" y1="23" x2="23" y2="77" stroke="rgba(37,99,235,0.08)" strokeWidth="0.3" strokeDasharray="1,3" />

                                            {(() => {
                                                const getPoints = () => {
                                                    const top = 50 - (Math.min(100, Math.max(0, countryData.infrastructureControl)) / 100) * 38;
                                                    const right = 50 + (Math.min(100, Math.max(0, countryData.policyIndependence)) / 100) * 38;
                                                    const bottom = 50 + (Math.min(100, Math.max(0, countryData.resourceWealth)) / 100) * 38;
                                                    const left = 50 - (Math.min(100, Math.max(0, countryData.currencyStability)) / 100) * 38;
                                                    return `50,${top} ${right},50 50,${bottom} ${left},50`;
                                                };
                                                return (
                                                    <>
                                                        {/* Glow layer */}
                                                        <polygon
                                                            points={getPoints()}
                                                            fill="rgba(37,99,235,0.08)"
                                                            stroke="rgba(37,99,235,0.3)"
                                                            strokeWidth="3"
                                                            filter="url(#radarGlow)"
                                                        />
                                                        {/* Main polygon */}
                                                        <polygon
                                                            points={getPoints()}
                                                            fill="url(#radarFill)"
                                                            stroke="rgba(37,99,235,0.9)"
                                                            strokeWidth="1.2"
                                                            className="transition-all duration-1000 ease-out"
                                                        />
                                                    </>
                                                );
                                            })()}

                                            <circle cx="50" cy="50" r="1.5" fill="rgba(37,99,235,0.9)" />

                                            {(() => {
                                                const top = 50 - (Math.min(100, Math.max(0, countryData.infrastructureControl)) / 100) * 38;
                                                const right = 50 + (Math.min(100, Math.max(0, countryData.policyIndependence)) / 100) * 38;
                                                const bottom = 50 + (Math.min(100, Math.max(0, countryData.resourceWealth)) / 100) * 38;
                                                const left = 50 - (Math.min(100, Math.max(0, countryData.currencyStability)) / 100) * 38;
                                                const getValColor = (val: number) => val >= 60 ? '#22c55e' : val >= 40 ? '#eab308' : '#ef4444';

                                                return (
                                                    <>
                                                        {/* Vertex dots */}
                                                        <circle cx="50" cy={top} r="2.5" fill={getValColor(countryData.infrastructureControl)} stroke="white" strokeWidth="0.8" opacity="0.9" />
                                                        <circle cx={right} cy="50" r="2.5" fill={getValColor(countryData.policyIndependence)} stroke="white" strokeWidth="0.8" opacity="0.9" />
                                                        <circle cx="50" cy={bottom} r="2.5" fill={getValColor(countryData.resourceWealth)} stroke="white" strokeWidth="0.8" opacity="0.9" />
                                                        <circle cx={left} cy="50" r="2.5" fill={getValColor(countryData.currencyStability)} stroke="white" strokeWidth="0.8" opacity="0.9" />
                                                        {/* Axis labels */}
                                                        <text x="50" y="5" textAnchor="middle" fill="currentColor" className="text-slate-light dark:text-slate-400" fontSize="3" fontWeight="bold" fontFamily="monospace">INFRA</text>
                                                        <text x="50" y="9.5" textAnchor="middle" fill={getValColor(countryData.infrastructureControl)} fontSize="4.5" fontWeight="900" fontFamily="monospace">{countryData.infrastructureControl}</text>

                                                        <text x="93" y="48" textAnchor="start" fill="currentColor" className="text-slate-light dark:text-slate-400" fontSize="3" fontWeight="bold" fontFamily="monospace">POLICY</text>
                                                        <text x="93" y="53" textAnchor="start" fill={getValColor(countryData.policyIndependence)} fontSize="4.5" fontWeight="900" fontFamily="monospace">{countryData.policyIndependence}</text>

                                                        <text x="50" y="95" textAnchor="middle" fill={getValColor(countryData.resourceWealth)} fontSize="4.5" fontWeight="900" fontFamily="monospace">{countryData.resourceWealth}</text>
                                                        <text x="50" y="100" textAnchor="middle" fill="currentColor" className="text-slate-light dark:text-slate-400" fontSize="3" fontWeight="bold" fontFamily="monospace">RESOURCES</text>

                                                        <text x="7" y="48" textAnchor="end" fill="currentColor" className="text-slate-light dark:text-slate-400" fontSize="3" fontWeight="bold" fontFamily="monospace">CURR</text>
                                                        <text x="7" y="53" textAnchor="end" fill={getValColor(countryData.currencyStability)} fontSize="4.5" fontWeight="900" fontFamily="monospace">{countryData.currencyStability}</text>
                                                    </>
                                                );
                                            })()}
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "EXPORTS" && (() => {
                            const exports = countryData.exportsData || [];
                            // Parse value strings like "$20.6B" or "$6.9B" to numbers for proportion bars
                            const parseVal = (v: string) => {
                                const n = parseFloat(v.replace(/[^0-9.]/g, ''));
                                if (v.includes('B')) return n * 1000;
                                if (v.includes('M')) return n;
                                return n || 0;
                            };
                            const maxVal = Math.max(...exports.map(r => parseVal(r.value)), 1);
                            const commodityIcon: Record<string, string> = {
                                oil: '🛢️', gas: '⚡', gold: '🥇', copper: '🔶', cobalt: '🔵',
                                tin: '⬜', coal: '⬛', iron: '🪨', 'iron ore': '🪨', diamond: '💎',
                                cotton: '🌾', cocoa: '🍫', coffee: '☕', uranium: '☢️',
                                phosphates: '🧪', timber: '🌲', fish: '🐟', rubber: '⚫',
                                bauxite: '🪵', lithium: '🔋', manganese: '🔩',
                            };
                            const getIcon = (res: string) => commodityIcon[res.toLowerCase()] || '📦';
                            return (
                                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="flex items-center justify-between border-b border-border pb-2">
                                        <h3 className="text-xs font-bold text-slate-light font-mono flex items-center gap-2">
                                            <BarChart3 className="w-3.5 h-3.5 text-green-500" /> COMMODITY PIPELINE &amp; PARTNERSHIPS
                                        </h3>
                                        <span className="text-[9px] font-mono text-slate-light">{exports.length} ACTIVE FLOWS</span>
                                    </div>
                                    {exports.map((row, i) => {
                                        const pct = Math.round((parseVal(row.value) / maxVal) * 100);
                                        const isRestricted = row.status.includes('RESTRICTED');
                                        return (
                                            <div key={i} className={`rounded-lg border font-mono transition-all hover:shadow-lg group ${isRestricted
                                                ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10'
                                                : 'border-green-500/20 bg-background/40 hover:bg-green-500/5'
                                                }`}>
                                                {/* Top row: icon + name + value */}
                                                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl leading-none select-none">{getIcon(row.resource)}</span>
                                                        <div>
                                                            <div className="font-black text-sm tracking-wide text-foreground group-hover:text-cobalt transition-colors">{row.resource.toUpperCase()}</div>
                                                            <div className="text-[10px] text-slate-light flex items-center gap-1 mt-0.5">
                                                                <ArrowRight className="w-2.5 h-2.5" /> {row.destination}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-base font-black tabular-nums ${isRestricted ? 'text-orange-500' : 'text-green-500'}`}>{row.value}</div>
                                                        <div className="text-[9px] text-slate-light">{row.volume}</div>
                                                    </div>
                                                </div>
                                                {/* Value proportion bar */}
                                                <div className="px-4 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-1000 ${isRestricted
                                                                    ? 'bg-gradient-to-r from-orange-600 to-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.5)]'
                                                                    : 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                                                                    }`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[9px] font-mono text-slate-light w-8 text-right">{pct}%</span>
                                                        {isRestricted && <span className="text-[8px] font-bold text-orange-500 border border-orange-500/30 px-1 py-0.5 rounded">RESTRICTED</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {activeTab === "FRICTION" && (() => {
                            const liveRisk = intelAlerts.filter(a => a.category === 'SOVEREIGNTY RISK');
                            const alerts = liveRisk.length > 0 ? liveRisk : countryData.frictionVectors;
                            const highCount = alerts.filter((a: IntelligenceAlert | { severity: string }) => a.severity === 'HIGH').length;
                            const medCount = alerts.filter((a: IntelligenceAlert | { severity: string }) => a.severity === 'MEDIUM').length;
                            const riskScore = Math.min(100, (highCount * 30) + (medCount * 15) + (alerts.length * 5));
                            const riskLabel = riskScore >= 60 ? 'CRITICAL' : riskScore >= 35 ? 'ELEVATED' : riskScore >= 15 ? 'MODERATE' : 'STABLE';
                            const riskGradient = riskScore >= 60 ? 'from-red-600 to-red-400' : riskScore >= 35 ? 'from-orange-600 to-orange-400' : riskScore >= 15 ? 'from-yellow-600 to-yellow-400' : 'from-green-600 to-green-400';
                            const riskTextColor = riskScore >= 60 ? 'text-red-500' : riskScore >= 35 ? 'text-orange-500' : riskScore >= 15 ? 'text-yellow-500' : 'text-green-500';
                            return (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                                    {/* Threat Header + Risk Gauge */}
                                    <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-xs font-bold text-red-500 font-mono flex items-center gap-2 uppercase tracking-wider">
                                                <ShieldAlert className="w-4 h-4" /> Threat Matrix
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {liveRisk.length > 0 && (
                                                    <span className="text-[10px] font-mono px-2 py-1 bg-green-500/10 text-green-500 border border-green-500/30 rounded flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                        LIVE · {liveRisk.length}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-black px-2 py-1 rounded border font-mono ${riskTextColor} bg-current/10 border-current/30`} style={{ backgroundColor: 'transparent', borderColor: riskScore >= 60 ? 'rgba(239,68,68,0.3)' : riskScore >= 35 ? 'rgba(249,115,22,0.3)' : riskScore >= 15 ? 'rgba(234,179,8,0.3)' : 'rgba(34,197,94,0.3)' }}>
                                                    {riskLabel}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Risk score bar */}
                                        <div className="flex items-center gap-3">
                                            <span className="text-[9px] font-mono text-slate-light w-16">RISK SCORE</span>
                                            <div className="flex-1 h-2 bg-black/20 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div className={`h-full bg-gradient-to-r ${riskGradient} rounded-full transition-all duration-1000 shadow-sm`} style={{ width: `${riskScore}%` }} />
                                            </div>
                                            <span className={`text-xs font-black tabular-nums ${riskTextColor} w-10 text-right`}>{riskScore}/100</span>
                                        </div>
                                        <div className="flex gap-4 mt-2 text-[9px] font-mono text-slate-light">
                                            <span className="text-red-400">{highCount} HIGH</span>
                                            <span className="text-orange-400">{medCount} MEDIUM</span>
                                            <span className="text-slate-light">{alerts.length - highCount - medCount} LOW</span>
                                        </div>
                                    </div>

                                    {/* Threat vector cards */}
                                    {alerts.map((alert: IntelligenceAlert | { title: string; severity: string; summary?: string; details?: string; created_at?: string; source?: string }, i: number) => {
                                        const isHigh = alert.severity === 'HIGH';
                                        const isMed = alert.severity === 'MEDIUM';
                                        const borderColor = isHigh ? 'border-l-red-500' : isMed ? 'border-l-orange-500' : 'border-l-yellow-500';
                                        const bgColor = isHigh ? 'bg-red-500/5 hover:bg-red-500/10' : isMed ? 'bg-orange-500/5 hover:bg-orange-500/8' : 'bg-yellow-500/5 hover:bg-yellow-500/8';
                                        const badgeColor = isHigh ? 'bg-red-500/15 text-red-400 border-red-500/30' : isMed ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
                                        return (
                                            <div key={i} className={`rounded-lg border border-border/40 border-l-4 ${borderColor} ${bgColor} transition-all hover:shadow-md`}>
                                                <div className="p-4">
                                                    <div className="flex items-start justify-between gap-3 mb-2">
                                                        <h4 className="font-bold text-sm leading-snug flex-1">{alert.title}</h4>
                                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                                            {alert.created_at && <span className="text-[9px] font-mono text-slate-light">{getTimeAgo(alert.created_at)}</span>}
                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${badgeColor}`}>{alert.severity}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-light font-mono leading-relaxed">{alert.summary || alert.details}</p>
                                                    {alert.source && <div className="mt-2 text-[9px] font-mono text-slate-light/60">{alert.source}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {activeTab === "INTEL" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center justify-between border-b border-border pb-2">
                                    <h3 className="text-xs font-bold text-amber-500 font-mono flex items-center gap-2 uppercase tracking-wider">
                                        <Newspaper className="w-4 h-4" /> Live Intelligence Feed
                                    </h3>
                                    {intelAlerts.length > 0 && (
                                        <span className="text-[10px] font-mono px-2 py-1 bg-green-500/10 text-green-500 border border-green-500/30 rounded flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            LIVE · {intelAlerts.length} RECORDS
                                        </span>
                                    )}
                                </div>

                                {intelLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 opacity-50 space-y-2">
                                        <span className="text-xs font-mono animate-pulse">PULLING LIVE INTEL...</span>
                                    </div>
                                ) : intelAlerts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 opacity-50 space-y-2 text-center px-4">
                                        <Newspaper className="w-8 h-8 text-slate-light mb-2" />
                                        <span className="text-xs font-mono">NO ACTIVE INTELLIGENCE FOR THIS STATE.</span>
                                        <span className="text-[10px] text-slate-light">The scraper may not have indexed this country yet. Trigger a manual scrape run from GitHub Actions.</span>
                                    </div>
                                ) : (
                                    intelAlerts.map((alert, i) => (
                                        <div key={i} className={`p-4 border rounded-xl transition-shadow hover:shadow-md ${alert.category === 'OUTSIDE INFLUENCE'
                                            ? 'bg-orange-500/5 border-orange-500/20 dark:border-orange-500/30'
                                            : 'bg-white/40 dark:bg-white/5 border-black/10 dark:border-white/10'
                                            }`}>
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <h4 className="font-bold text-sm leading-tight flex-1">{alert.title}</h4>
                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                    <span className="text-[9px] font-mono text-slate-light">{getTimeAgo(alert.created_at)}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${alert.severity === 'HIGH' ? 'text-red-500 border-red-500/30 bg-red-500/10' :
                                                        alert.severity === 'MEDIUM' ? 'text-orange-500 border-orange-500/30 bg-orange-500/10' :
                                                            'text-yellow-500 border-yellow-500/30 bg-yellow-500/10'
                                                        }`}>{alert.severity}</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-light font-mono leading-relaxed mb-3">{alert.summary}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${alert.category === 'OUTSIDE INFLUENCE'
                                                    ? 'text-orange-500 border-orange-500/30 bg-orange-500/10'
                                                    : 'text-cobalt border-cobalt/30 bg-cobalt/10'
                                                    }`}>{alert.category}</span>
                                                {alert.actor && (
                                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-500">
                                                        ACTOR: {alert.actor}
                                                    </span>
                                                )}
                                                <span className="text-[9px] font-mono text-slate-light ml-auto">{alert.source}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === "TRAJECTORY" && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                <SovereigntyTrendlineChart key={countryData.country} data={[countryData]} />
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
