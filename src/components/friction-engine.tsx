"use client"

import { useEffect, useState } from "react"
import { ShieldAlert, Newspaper, Video } from "lucide-react"

interface Article {
    title: string
    summary: string
    severity: "HIGH" | "MEDIUM" | "LOW"
    category: "SOVEREIGNTY RISK" | "OUTSIDE INFLUENCE"
    isoCode: string
    timeAgo: string
}

export default function FrictionEngine({ mode, filterCountry }: { mode: "SOVEREIGNTY" | "OUTSIDE INFLUENCE"; filterCountry: string | null }) {
    const [alerts, setAlerts] = useState<Article[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<"ALERTS" | "NEWS" | "MEDIA">("ALERTS")

    useEffect(() => {
        async function fetchIntelligence() {
            setLoading(true);
            try {
                const res = await fetch("/api/intelligence");
                const data = await res.json();
                setAlerts(data);
            } catch (e) {
                console.error("Intelligence load failed", e);
            } finally {
                setLoading(false);
            }
        }

        fetchIntelligence();
    }, []);

    const filteredAlerts = alerts.filter(a => {
        const modeMatch = mode === "SOVEREIGNTY"
            ? a.category === "SOVEREIGNTY RISK"
            : a.category === "OUTSIDE INFLUENCE" || a.category === "WESTERN RISK" as string;
        if (!filterCountry) return modeMatch;
        return modeMatch && (
            a.title.toLowerCase().includes(filterCountry.toLowerCase()) ||
            a.summary.toLowerCase().includes(filterCountry.toLowerCase()) ||
            a.isoCode.toLowerCase().includes(filterCountry.substring(0, 3).toLowerCase())
        );
    });

    return (
        <aside className="w-96 border-l border-border bg-panel backdrop-blur-sm flex flex-col shrink-0 transition-colors">

            {/* Panel Tabs Header */}
            <div className="flex border-b border-border text-xs font-bold tracking-wider pt-2 px-2 gap-1">
                <button
                    onClick={() => setActiveTab("ALERTS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "ALERTS" ? "border-orange-500 text-orange-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <ShieldAlert className="w-3.5 h-3.5" /> ALERTS
                </button>
                <button
                    onClick={() => setActiveTab("NEWS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "NEWS" ? "border-cobalt text-cobalt" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Newspaper className="w-3.5 h-3.5" /> NEWS
                </button>
                <button
                    onClick={() => setActiveTab("MEDIA")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "MEDIA" ? "border-red-500 text-red-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Video className="w-3.5 h-3.5" /> MEDIA
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Filter indicator */}
                {filterCountry && (
                    <div className="text-[10px] font-mono px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-500 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        FILTERED: {filterCountry.toUpperCase()}
                    </div>
                )}
                {activeTab === "ALERTS" && (
                    <>
                        {loading && alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-2">
                                <span className="text-xs font-mono animate-pulse">EXTRACTING LIVE INTEL...</span>
                                <div className="text-[10px] text-slate-light text-center px-4">Firecrawl Engine initializing deep scan of geopolitical signals across Africa.</div>
                            </div>
                        ) : filteredAlerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-50">
                                <span className="text-xs font-mono">NO ACTIVE {mode} ALERTS DETECTED.</span>
                            </div>
                        ) : (
                            filteredAlerts.map((alert, idx) => (
                                <div key={idx} className="p-3 border border-orange-500/20 bg-orange-500/5 rounded-md transition-all hover:bg-orange-500/10">
                                    <div className="text-[10px] font-mono text-orange-400 mb-1 flex justify-between">
                                        <span>{alert.title}</span>
                                        <span className="opacity-70">{alert.timeAgo}</span>
                                    </div>
                                    <p className="text-sm text-foreground/90">{alert.summary}</p>
                                    <div className="mt-3 flex gap-2">
                                        <span className={`text-[10px] px-2 py-0.5 bg-background border rounded font-bold ${alert.severity === "HIGH" ? "border-red-500/50 text-red-500" :
                                            alert.severity === "MEDIUM" ? "border-orange-500/50 text-orange-500" :
                                                "border-yellow-500/50 text-yellow-500"
                                            }`}>
                                            {alert.severity} SEVERITY
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 bg-background border border-border rounded opacity-80">
                                            {alert.isoCode}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {activeTab === "NEWS" && (
                    <div className="space-y-4">
                        {[
                            { title: "PAPSS processes over $2.8B in intra-African payments since launch.", source: "African Business", time: "RECENT", iso: "PAN-AFRICA", url: "https://african.business/", icon: "💰" },
                            { title: "DRC mandates domestic cobalt processing, banning raw ore exports.", source: "Mining Weekly", time: "RECENT", iso: "COD", url: "https://www.miningweekly.com/page/africa", icon: "⛏️" },
                            { title: "Kenya's M-PESA processes $314B annually, transforming digital finance.", source: "Al Jazeera Africa", time: "RECENT", iso: "KEN", url: "https://www.aljazeera.com/economy", icon: "📱" },
                            { title: "Ghana's gold refinery PMMC increases local beneficiation by 40%.", source: "Reuters Africa", time: "RECENT", iso: "GHA", url: "https://www.reuters.com/world/africa/", icon: "🥇" },
                            { title: "African Development Bank approves $1.3B for continental rail network.", source: "AfDB News", time: "RECENT", iso: "PAN-AFRICA", url: "https://www.afdb.org/en/news-and-events", icon: "🚄" },
                            { title: "Nigeria's Dangote Refinery reaches 500K bpd, reducing import dependency.", source: "Bloomberg Africa", time: "RECENT", iso: "NGA", url: "https://www.bloomberg.com/africa", icon: "🛢️" }
                        ].map((news, idx) => (
                            <a
                                key={idx}
                                href={news.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-3 border border-border/50 bg-background/30 rounded-md transition-all hover:bg-background/80 hover:border-cobalt/40 group cursor-pointer"
                            >
                                <span className="text-lg mt-0.5 shrink-0">{news.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold mb-1 leading-tight text-foreground/90 group-hover:text-cobalt transition-colors">{news.title}</h3>
                                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-light mt-2">
                                        <span className="text-cobalt">{news.source}</span>
                                        <span>{news.time}</span>
                                    </div>
                                    <div className="mt-2 text-[9px] px-1.5 py-0.5 bg-border/30 rounded border border-border/50 inline-block font-mono bg-white/5 dark:bg-black/20">
                                        TAG: {news.iso}
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                {activeTab === "MEDIA" && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-red-500 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            EXTERNAL OSINT MEDIA SOURCES
                        </div>
                        {[
                            { name: "The New Africa Channel", handle: "@TheNewAfricaChannel", focus: "Geopolitics & Infrastructure", url: "https://www.youtube.com/@TheNewAfricaChannel", icon: "🌍" },
                            { name: "SABC News", handle: "@sabcnews", focus: "South Africa & Continental Politics", url: "https://www.youtube.com/@sabcnews", icon: "📡" },
                            { name: "African Diaspora News", handle: "@AfricanDiasporaNewsChannel", focus: "Global African Affairs", url: "https://www.youtube.com/@AfricanDiasporaNewsChannel", icon: "🗞️" },
                            { name: "Newzroom Afrika", handle: "@Newzroom405", focus: "Live African News Coverage", url: "https://www.youtube.com/@Newzroom405", icon: "🎙️" },
                            { name: "Wode Maya", handle: "@Wodemaya", focus: "Pan-African Enterprise", url: "https://www.youtube.com/@Wodemaya", icon: "🚀" }
                        ].map((channel, idx) => (
                            <a
                                key={idx}
                                href={channel.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-3 border border-red-500/20 bg-red-500/5 rounded-md transition-all hover:bg-red-500/10 hover:border-red-500/40 group cursor-pointer"
                            >
                                <span className="text-xl mt-0.5 shrink-0">{channel.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold leading-tight group-hover:text-red-500 transition-colors mb-0.5">
                                        {channel.name} <span className="text-xs text-red-500/70 inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                                    </h3>
                                    <div className="text-[10px] font-mono text-slate-light mb-2">
                                        {channel.handle}
                                    </div>
                                    <div className="text-[9px] px-1.5 py-0.5 bg-background border border-border/50 rounded font-mono inline-block bg-white/5 dark:bg-black/20">
                                        FOCUS: {channel.focus.toUpperCase()}
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}
