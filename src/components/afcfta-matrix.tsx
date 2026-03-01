import { Activity, TrendingUp, Pickaxe, ChevronDown, Info, Search, Filter, Star } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import CountryDossierModal, { CountryData } from "./country-dossier-modal";

import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

interface AfcftaMatrixProps {
    selectedCodes: string[];
}

export default function AfcftaMatrix({ selectedCodes }: AfcftaMatrixProps) {
    const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);
    const [legendOpen, setLegendOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "score" | "wealth">("name");
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [watchlist, setWatchlist] = useState<string[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem("axisWatchlist");
        if (saved) {
            try { setWatchlist(JSON.parse(saved)); } catch (e) { }
        }
    }, []);

    const toggleWatchlist = (e: React.MouseEvent, countryCode: string) => {
        e.stopPropagation();
        setWatchlist(prev => {
            const newWatchlist = prev.includes(countryCode)
                ? prev.filter(c => c !== countryCode)
                : [...prev, countryCode];
            localStorage.setItem("axisWatchlist", JSON.stringify(newWatchlist));
            return newWatchlist;
        });
    };

    const filterOptions = ["ALL", "OPTIMAL", "STABLE", "IMPROVING", "EXTRACTIVE"];
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: ALL_SOVEREIGN_DATA.length, OPTIMAL: 0, STABLE: 0, IMPROVING: 0, EXTRACTIVE: 0 };
        ALL_SOVEREIGN_DATA.forEach(c => {
            if (counts[c.status] !== undefined) {
                counts[c.status]++;
            }
        });
        return counts;
    }, []);

    const sortedAndFilteredData = useMemo(() => {
        let result = ALL_SOVEREIGN_DATA;

        // If one or more countries are selected (e.g. from the map), filter to only show those countries
        if (selectedCodes && selectedCodes.length > 0) {
            result = result.filter(c => selectedCodes.includes(c.country));
        } else {
            // Otherwise apply normal search and status filters
            if (searchQuery) {
                result = result.filter(c =>
                    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.country.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }

            if (filterStatus !== "ALL") {
                result = result.filter(c => c.status === filterStatus);
            }
        }

        return [...result].sort((a, b) => {
            // Always prioritize watched countries first when not explicitly sorting by score/wealth
            if (sortBy === "name") {
                const aWatched = watchlist.includes(a.country);
                const bWatched = watchlist.includes(b.country);
                if (aWatched && !bWatched) return -1;
                if (!aWatched && bWatched) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sortBy === "score") return b.axisScore - a.axisScore;
            if (sortBy === "wealth") return b.resourceWealth - a.resourceWealth;
            return 0;
        });
    }, [searchQuery, sortBy, filterStatus, selectedCodes, watchlist]);

    const getScoreColor = (score: number) => {
        if (score >= 75) return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]";
        if (score >= 60) return "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]";
        return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "OPTIMAL": return "text-green-500 border-green-500/30 bg-green-500/10";
            case "STABLE": return "text-cobalt border-cobalt/30 bg-cobalt/10";
            case "IMPROVING": return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
            case "EXTRACTIVE": return "text-red-500 border-red-500/30 bg-red-500/10";
            default: return "text-slate-light border-slate-light/30 bg-slate-light/10";
        }
    };



    return (
        <aside className="w-full lg:w-80 border-r border-border bg-panel backdrop-blur-sm flex flex-col shrink-0">
            <div className="p-4 border-b border-border">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cobalt" />
                    Sovereignty Index
                </h2>
                <p className="text-[10px] text-slate-light mt-1 font-mono">
                    AGGREGATING RESOURCE BENEFICIATION
                </p>
            </div>

            {/* Collapsible Legend */}
            <div className="border-b border-border">
                <button
                    onClick={() => setLegendOpen(!legendOpen)}
                    className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-mono text-cobalt hover:bg-background/50 transition-colors"
                >
                    <span className="flex items-center gap-1.5"><Info className="w-3 h-3" /> HOW TO READ THIS INDEX</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${legendOpen ? 'rotate-180' : ''}`} />
                </button>
                {legendOpen && (
                    <div className="px-4 pb-3 space-y-3 text-[9px] font-mono animate-in fade-in slide-in-from-top-2 duration-300">
                        <div>
                            <span className="text-foreground font-bold">AXIS SCORE</span>
                            <p className="text-slate-light mt-0.5 leading-relaxed">Composite 0–100 metric measuring a nation's control over its own resources, policy independence, infrastructure ownership, and financial sovereignty.</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-foreground font-bold">STATUS TAGS</span>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> <span className="text-green-500">OPTIMAL</span> <span className="text-slate-light">— Score 75+. Strong sovereignty trajectory.</span></div>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> <span className="text-cobalt">STABLE</span> <span className="text-slate-light">— Consistent metrics, no major risks.</span></div>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> <span className="text-yellow-500">IMPROVING</span> <span className="text-slate-light">— Positive reform trend underway.</span></div>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> <span className="text-red-500">EXTRACTIVE</span> <span className="text-slate-light">— Score ≤50. Resources leaving without value capture.</span></div>
                        </div>
                        <div>
                            <span className="text-foreground font-bold">HIGHLIGHT TAGS</span>
                            <div className="flex items-center gap-2 mt-0.5"><Pickaxe className="w-2.5 h-2.5 text-slate-light" /> <span className="text-slate-light">Primary strategic resource or sector.</span></div>
                            <div className="flex items-center gap-2"><TrendingUp className="w-2.5 h-2.5 text-slate-light" /> <span className="text-slate-light">Key growth initiative or policy direction.</span></div>
                        </div>
                        <div>
                            <span className="text-foreground font-bold">TREND %</span>
                            <p className="text-slate-light mt-0.5"><span className="text-green-500">+</span> Quarter-over-quarter sovereignty improvement. <span className="text-red-500">−</span> Declining score.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-3 border-b border-border bg-black/5 dark:bg-white/5 space-y-3 shrink-0">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-light" />
                        <input
                            type="text"
                            placeholder="SEARCH NATION..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-cobalt/50 transition-colors"
                        />
                    </div>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-background border border-border rounded-md px-2 py-1.5 text-xs font-mono text-slate-light focus:outline-none cursor-pointer hover:bg-white/5 transition-colors"
                    >
                        <option value="name">SORT: A-Z</option>
                        <option value="score">SCORE</option>
                        <option value="wealth">WEALTH</option>
                    </select>
                </div>

                {/* Status Filter Chips */}
                <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar scroll-smooth">
                    {filterOptions.map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold font-mono transition-all border ${filterStatus === status
                                ? (status === 'OPTIMAL' ? 'bg-green-500 text-white border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' :
                                    status === 'EXTRACTIVE' ? 'bg-red-500 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]' :
                                        status === 'IMPROVING' ? 'bg-yellow-500 text-white border-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.3)]' :
                                            status === 'STABLE' ? 'bg-cobalt text-white border-cobalt shadow-[0_0_8px_rgba(37,99,235,0.3)]' :
                                                'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600')
                                : 'bg-background hover:bg-white/5 border-border text-slate-light'
                                }`}
                        >
                            {status} <span className={`ml-1 font-normal ${filterStatus === status ? 'text-white/80' : 'opacity-50'}`}>({statusCounts[status]})</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
                {sortedAndFilteredData.map((data, i) => (
                    <div
                        key={i}
                        onClick={() => {
                            setSelectedCountry(data);
                        }}
                        className={`p-3 border rounded-md transition-colors cursor-pointer group ${selectedCodes.includes(data.country)
                            ? "border-green-500 bg-green-50 dark:border-green-500/60 dark:bg-green-500/10"
                            : "border-border bg-white hover:bg-slate-50 dark:border-border/50 dark:bg-background/50 dark:hover:bg-background/80"
                            }`}
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold flex items-center gap-2">
                                <button
                                    onClick={(e) => toggleWatchlist(e, data.country)}
                                    className={`transition-colors hover:scale-110 ${watchlist.includes(data.country) ? 'text-yellow-500' : 'text-slate-light/30 hover:text-yellow-500/50'}`}
                                >
                                    <Star className="w-3.5 h-3.5" fill={watchlist.includes(data.country) ? "currentColor" : "none"} />
                                </button>
                                {data.country}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getStatusColor(data.status)}`}>
                                    {data.status}
                                </span>
                            </span>
                            <span className={`text-xs ${data.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                                {data.trend}
                            </span>
                        </div>

                        <div className="text-[10px] text-slate-light mb-3 tracking-wide">
                            {data.name.toUpperCase()}
                        </div>

                        <div className="flex justify-between items-center text-[10px] mb-1">
                            <span>AXIS SCORE</span>
                            <span>{data.axisScore}/100</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
                            <div
                                className={`h-full transition-all duration-1000 ${getScoreColor(data.axisScore)}`}
                                style={{ width: `${data.axisScore}%` }}
                            ></div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] mb-1">
                            <span>RESOURCE WEALTH</span>
                            <span>{data.resourceWealth}/100</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
                            <div
                                className="h-full transition-all duration-1000 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                                style={{ width: `${data.resourceWealth}%` }}
                            ></div>
                        </div>

                        <div className="flex flex-wrap gap-1 mb-1">
                            {(data.keyResources || []).slice(0, 3).map((res, idx) => (
                                <span key={idx} className="text-[8px] px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-500">
                                    {res.toUpperCase()}
                                </span>
                            ))}
                        </div>

                        <div className="flex gap-2 mt-2">
                            {(data.highlights || []).map((highlight, idx) => (
                                <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-white/5 dark:bg-black/20 border border-border/50 rounded flex items-center gap-1 text-slate-light">
                                    {idx === 0 ? <Pickaxe className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                                    {highlight.toUpperCase()}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal Overlay */}
            <CountryDossierModal
                isOpen={!!selectedCountry}
                onClose={() => setSelectedCountry(null)}
                countryData={selectedCountry}
            />
        </aside>
    );
}
