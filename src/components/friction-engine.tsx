"use client"

import { useEffect, useState } from "react"
import { ShieldAlert, Newspaper, Video } from "lucide-react"

interface Article {
    title: string
    summary: string
    severity: "HIGH" | "MEDIUM" | "LOW"
    category: "SOVEREIGNTY RISK" | "WESTERN RISK"
    isoCode: string
    timeAgo: string
}

export default function FrictionEngine({ mode, filterCountry }: { mode: "SOVEREIGNTY" | "WESTERN RISK"; filterCountry: string | null }) {
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
        const modeMatch = a.category === mode;
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
                            { title: "Pan-African Payment System (PAPSS) processing volumes double.", source: "AfCFTA Monitor", time: "1HR AGO", iso: "PAN-AFRICA" },
                            { title: "Mali and Niger formulate new strategic energy alliance.", source: "Regional Desk", time: "3HRS AGO", iso: "NW-AFRICA" },
                            { title: "New cobalt refinery breaks ground, increasing local beneficiation.", source: "Mining Weekly", time: "4HRS AGO", iso: "COD" },
                            { title: "Port expansion deal finalized outside historical framework.", source: "Geo-Intel", time: "6HRS AGO", iso: "TZA" }
                        ].map((news, idx) => (
                            <div key={idx} className="p-3 border border-border/50 bg-background/30 rounded-md transition-all hover:bg-background/80">
                                <h3 className="text-sm font-bold mb-1 leading-tight text-foreground/90">{news.title}</h3>
                                <div className="flex justify-between items-center text-[10px] font-mono text-slate-light mt-2">
                                    <span className="text-cobalt">{news.source}</span>
                                    <span>{news.time}</span>
                                </div>
                                <div className="mt-2 text-[9px] px-1.5 py-0.5 bg-border/30 rounded border border-border/50 inline-block font-mono bg-white/5 dark:bg-black/20">
                                    TAG: {news.iso}
                                </div>
                            </div>
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
                            { name: "The New Africa Channel", handle: "@TheNewAfricaChannel", focus: "Geopolitics & Infrastructure", url: "https://www.youtube.com/@TheNewAfricaChannel" },
                            { name: "SABC News", handle: "@sabcnews", focus: "South Africa & Continental Politics", url: "https://www.youtube.com/@sabcnews" },
                            { name: "African Diaspora News", handle: "@AfricanDiasporaNewsChannel", focus: "Global African Affairs", url: "https://www.youtube.com/@AfricanDiasporaNewsChannel" },
                            { name: "Newzroom Afrika", handle: "@Newzroom405", focus: "Live African News Coverage", url: "https://www.youtube.com/@Newzroom405" },
                            { name: "Wode Maya", handle: "@Wodemaya", focus: "Pan-African Enterprise", url: "https://www.youtube.com/@Wodemaya" }
                        ].map((channel, idx) => (
                            <a
                                key={idx}
                                href={channel.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3 border border-red-500/20 bg-red-500/5 rounded-md transition-all hover:bg-red-500/10 hover:border-red-500/40 group cursor-pointer"
                            >
                                <h3 className="text-sm font-bold leading-tight group-hover:text-red-500 transition-colors mb-1">
                                    {channel.name} <span className="text-xs text-red-500/70 inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                                </h3>
                                <div className="text-[10px] font-mono text-slate-light mb-2">
                                    {channel.handle}
                                </div>
                                <div className="text-[9px] px-1.5 py-0.5 bg-background border border-border/50 rounded font-mono inline-block bg-white/5 dark:bg-black/20">
                                    FOCUS: {channel.focus.toUpperCase()}
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}
