"use client"

import { useEffect, useState, useRef } from "react"
import { ShieldAlert, Newspaper, Video, BookOpen, Lightbulb, Globe, Play, Square, Pause, Star, ChevronRight, ArrowUpRight, Users } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "@/lib/supabase"
import { useWatchlist } from "@/lib/use-watchlist"

// Brand SVG Icons
const YouTubeIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
)

const AlJazeeraIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
)

const ReutersIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <circle cx="12" cy="12" r="3" /><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" opacity=".3" /><path d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" opacity=".5" />
    </svg>
)

const MiningIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 4l-4 16M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </svg>
)

const BloombergIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
)

const AfDBIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /><rect x="9" y="9" width="2" height="2" fill="currentColor" /><rect x="13" y="9" width="2" height="2" fill="currentColor" />
    </svg>
)

const MediumIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
    </svg>
)

const SafeImage = ({ src, fallbackIcon: Icon, className }: { src?: string; fallbackIcon: any; className?: string }) => {
    const [error, setError] = useState(false);
    if (error || !src) return (
        <div className={`flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10 ${className}`}>
            <Icon className="w-8 h-8 opacity-20" />
        </div>
    );
    return (
        <img
            src={src}
            alt=""
            className={`object-cover ${className}`}
            onError={() => setError(true)}
        />
    );
}

interface Article {
    title: string
    summary: string
    severity: "HIGH" | "MEDIUM" | "LOW"
    category: "SOVEREIGNTY RISK" | "OUTSIDE INFLUENCE"
    isoCode: string
    timeAgo: string
    source?: string
    timestamp?: string
    url?: string
    imageUrl?: string
}

interface BlogPost {
    title: string
    summary: string
    author: string
    tag: string
    url: string
    imageUrl?: string
}

export default function FrictionEngine({ mode, filterCountries }: { mode: "SOVEREIGNTY" | "OUTSIDE INFLUENCE"; filterCountries: string[] | null }) {
    const [alerts, setAlerts] = useState<Article[]>([])
    const [blogs, setBlogs] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(true)
    const [blogsLoading, setBlogsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<"ALERTS" | "NEWS" | "MEDIA" | "BLOGS">("ALERTS")
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [audioPaused, setAudioPaused] = useState(false);
    const [isDownloadingModel, setIsDownloadingModel] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const { watchlist } = useWatchlist();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Hook into the custom DOM event to force a re-render when the modal changes the watchlist
    const [, setDummy] = useState(0);
    useEffect(() => {
        const handleWatchlistChange = () => setDummy(n => n + 1);
        window.addEventListener("watchlistUpdated", handleWatchlistChange);
        return () => window.removeEventListener("watchlistUpdated", handleWatchlistChange);
    }, []);

    // Kokoro TTS Refs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttsRef = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function fetchIntelligence() {
            if (alerts.length === 0) setLoading(true);
            try {
                const res = await fetch("/api/intelligence");
                const data = await res.json();
                if (!data) return;

                // Calculate an exact date/time from the relative "timeAgo" string
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const enhancedData = data.map((alert: any) => {
                    const exactDate = alert.created_at ? new Date(alert.created_at) : new Date(); // Use current date for fallback data if created_at is missing
                    return { ...alert, timestamp: exactDate.toISOString() };
                });

                // If we already have alerts, merge them to keep their anchored timestamps
                setAlerts((prev) => {
                    if (prev.length === 0) return enhancedData;
                    // Deduplicate based on title, preserving the oldest timestamp
                    const merged = [...prev];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    enhancedData.forEach((newAlert: any) => {
                        const existingIdx = merged.findIndex(a => a.title === newAlert.title);
                        if (existingIdx === -1) {
                            merged.unshift(newAlert); // Add new alerts to the top
                        }
                    });
                    return merged;
                });
            } catch (e) {
                console.error("Intelligence load failed", e);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        async function fetchBlogs() {
            if (blogs.length === 0) setBlogsLoading(true);
            try {
                const res = await fetch("/api/blogs");
                const data = await res.json();
                if (isMounted) setBlogs(data);
            } catch (e) {
                console.error("Blog scrape failed", e);
            } finally {
                if (isMounted) setBlogsLoading(false);
            }
        }

        // Initial fetch
        fetchIntelligence();
        fetchBlogs();
        setNow(Date.now());

        // Real-time polling every 5 minutes (300000 ms)
        const intervalId = setInterval(() => {
            fetchIntelligence();
            fetchBlogs();
        }, 5 * 60 * 1000);

        // UI Time Tick every 1 minute to keep "time ago" live
        const tickId = setInterval(() => {
            if (isMounted) setNow(Date.now());
        }, 60000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            clearInterval(tickId);
        };
    }, []);

    // Helper to calculate live time ago
    const getLiveTimeAgo = (isoString?: string) => {
        if (!now || !isoString) return "JUST NOW";
        const diffMs = now - new Date(isoString).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHrs / 24);

        if (diffMins < 1) return "JUST NOW";
        if (diffMins < 60) return `${diffMins} MINS AGO`;
        if (diffHrs < 24) return `${diffHrs} HRS AGO`;
        return `${diffDays} DAYS AGO`;
    };

    const filteredAlerts = (alerts || []).filter(a => {
        const cat = a.category ? a.category.toUpperCase() : "";
        const modeMatch = mode === "SOVEREIGNTY"
            ? cat.includes("SOVEREIGNTY") || cat.includes("RISK")
            : cat.includes("OUTSIDE") || cat.includes("FOREIGN") || cat.includes("WESTERN") || cat.includes("INFLUENCE");

        if (!filterCountries || filterCountries.length === 0) return modeMatch;
        return modeMatch && filterCountries.some(countryIsoCode =>
            a.isoCode.toLowerCase() === countryIsoCode.toLowerCase()
        );
    });

    const stopAudio = () => {
        setIsPlayingAudio(false);
        setAudioPaused(false);
        if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch (e) { }
            currentSourceRef.current.disconnect();
            currentSourceRef.current = null;
        }
        if (audioCtxRef.current) {
            try { audioCtxRef.current.close(); } catch (e) { }
            audioCtxRef.current = null;
        }
    };

    const toggleAudioBrief = async () => {
        if (isDownloadingModel) return;

        const topAlerts = (filteredAlerts || []).slice(0, 5);
        if (topAlerts.length === 0) return;

        if (isPlayingAudio && !audioPaused) {
            if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
                audioCtxRef.current.suspend();
                setAudioPaused(true);
            }
            return;
        }

        if (isPlayingAudio && audioPaused) {
            if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume();
                setAudioPaused(false);
            }
            return;
        }

        setIsPlayingAudio(true);
        setAudioPaused(false);

        try {
            if (!ttsRef.current) {
                setIsDownloadingModel(true);
                // Dynamic import to prevent SSR issues
                const { KokoroTTS } = await import("kokoro-js");
                ttsRef.current = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                    dtype: "q8",
                });
                setIsDownloadingModel(false);
            }

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            if (audioCtxRef.current.state === 'suspended') {
                await audioCtxRef.current.resume();
            }

            const introText = `Commencing Axis Intelligence Briefing for ${mode} events.`;
            const textsToSpeak = [introText];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topAlerts.forEach((alert: any, index: number) => {
                textsToSpeak.push(`Alert ${index + 1}. ${alert.title}. ${alert.summary}`);
            });

            for (let i = 0; i < textsToSpeak.length; i++) {
                if (!audioCtxRef.current) break; // User stopped

                const text = textsToSpeak[i];
                const audio = await ttsRef.current.generate(text, {
                    voice: 'af_heart', // af_heart is English
                });

                if (!audioCtxRef.current) break; // User stopped during generation

                await new Promise<void>((resolve) => {
                    if (!audioCtxRef.current) return resolve();

                    const buffer = audioCtxRef.current.createBuffer(1, audio.audio.length, audio.sampling_rate);
                    buffer.getChannelData(0).set(audio.audio);

                    const source = audioCtxRef.current.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioCtxRef.current.destination);

                    source.onended = () => {
                        currentSourceRef.current = null;
                        resolve();
                    };

                    currentSourceRef.current = source;
                    source.start();
                });
            }
        } catch (error) {
            console.error("TTS Error:", error);
            setIsDownloadingModel(false);
        } finally {
            if (audioCtxRef.current) {
                // If it wasn't destroyed by stopAudio, that means the sequence finished normally
                setIsPlayingAudio(false);
                setAudioPaused(false);
            }
        }
    };

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, []);

    return (
        <aside className="w-full lg:w-96 border-l border-border bg-panel backdrop-blur-sm flex flex-col shrink-0 transition-colors overflow-hidden">

            {/* Panel Tabs Header */}
            <div className="flex border-b border-border text-xs font-bold tracking-wider pt-2 px-1 gap-0.5">
                <button
                    onClick={() => setActiveTab("ALERTS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-1.5 border-b-2 transition-all text-[10px] ${activeTab === "ALERTS" ? "border-orange-500 text-orange-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <ShieldAlert className="w-3 h-3" /> ALERTS
                </button>
                <button
                    onClick={() => setActiveTab("NEWS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-1.5 border-b-2 transition-all text-[10px] ${activeTab === "NEWS" ? "border-cobalt text-cobalt" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Newspaper className="w-3 h-3" /> NEWS
                </button>
                <button
                    onClick={() => setActiveTab("BLOGS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-1.5 border-b-2 transition-all text-[10px] ${activeTab === "BLOGS" ? "border-green-500 text-green-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <BookOpen className="w-3 h-3" /> BLOGS
                </button>
                <button
                    onClick={() => setActiveTab("MEDIA")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-1.5 border-b-2 transition-all text-[10px] ${activeTab === "MEDIA" ? "border-red-500 text-red-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Video className="w-3 h-3" /> MEDIA
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Filter indicator */}
                {filterCountries && filterCountries.length > 0 && (
                    <div className="text-[10px] font-mono px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-500 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        FILTERED: {filterCountries.length === 1 ? filterCountries[0].toUpperCase() : `${filterCountries.length} COUNTRIES`}
                    </div>
                )}
                {activeTab === "ALERTS" && (
                    <>
                        <div className="flex justify-end mb-2">
                            <button
                                onClick={filteredAlerts.length > 0 ? (isPlayingAudio && !audioPaused ? stopAudio : toggleAudioBrief) : undefined}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${filteredAlerts.length === 0 ? "opacity-30 cursor-not-allowed border border-border bg-background" :
                                    isPlayingAudio && !audioPaused ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20" :
                                        isPlayingAudio && audioPaused ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/20" :
                                            isDownloadingModel ? "bg-cobalt/10 text-cobalt border border-cobalt/30 hover:bg-cobalt/20 opacity-80 cursor-wait" :
                                                "bg-orange-500/10 text-orange-500 border border-orange-500/30 hover:bg-orange-500/20"
                                    }`}
                            >
                                {isDownloadingModel ? <Globe className="w-3.5 h-3.5 animate-spin" /> : isPlayingAudio && !audioPaused ? <Square className="w-3.5 h-3.5" /> : isPlayingAudio && audioPaused ? <Play className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                {isDownloadingModel ? "INITIALIZING AI VOICE..." : isPlayingAudio && !audioPaused ? "STOP BRIEFING" : isPlayingAudio && audioPaused ? "RESUME BRIEFING" : "PLAY AUDIO BRIEF"}
                            </button>
                        </div>
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
                            <AnimatePresence>
                                {/* Advanced Sort: Bubbles Pinned countries to the top ONLY after hydration */}
                                {(isMounted ? [...(filteredAlerts || [])].sort((a, b) => {
                                    const aPinned = watchlist.includes(a.isoCode);
                                    const bPinned = watchlist.includes(b.isoCode);
                                    if (aPinned && !bPinned) return -1;
                                    if (!aPinned && bPinned) return 1;
                                    return 0; // Maintain original chronological order
                                }).map((alert, idx) => {
                                    return (
                                        <motion.a
                                            key={`${alert.title}-${idx}`}
                                            href={alert.url || "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.1, duration: 0.3 }}
                                            className="flex items-center w-full h-[85px] bg-[#252525] hover:bg-[#353535] border border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden p-2"
                                        >
                                            <div className="w-[65px] h-[65px] shrink-0 rounded-[15px] overflow-hidden border border-orange-500/20 group-hover:border-orange-500/40 transition-colors">
                                                <SafeImage src={alert.imageUrl} fallbackIcon={ShieldAlert} className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500 scale-110 group-hover:scale-100" />
                                            </div>
                                            <div className="flex-1 ml-3 min-w-0 pr-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-[13px] font-bold text-white truncate uppercase tracking-tight">{alert.title}</h3>
                                                    <span className="text-[9px] text-orange-500/80 font-mono whitespace-nowrap ml-2">
                                                        {getLiveTimeAgo((alert as any).timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                                    {alert.summary}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${alert.severity === "HIGH" ? "bg-red-500/20 text-red-500" :
                                                        alert.severity === "MEDIUM" ? "bg-orange-500/20 text-orange-500" :
                                                            "bg-emerald-500/20 text-emerald-500"
                                                        }`}>
                                                        {alert.severity}
                                                    </span>
                                                    <span className="text-[8px] text-slate-light/40 uppercase tracking-widest">{alert.isoCode}</span>
                                                </div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                                <ArrowUpRight className="w-4 h-4 text-orange-500" />
                                            </div>
                                        </motion.a>
                                    );
                                }) : (filteredAlerts || []).map((alert, idx) => {
                                    return (
                                        <motion.a
                                            key={`${alert.title}-${idx}`}
                                            href={alert.url || "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.1, duration: 0.3 }}
                                            className="flex items-center w-full h-[85px] bg-[#252525] hover:bg-[#353535] border border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden p-2"
                                        >
                                            <div className="w-[65px] h-[65px] shrink-0 rounded-[15px] bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center transition-all duration-500 group-hover:from-orange-500/40 group-hover:to-orange-500/10">
                                                <ShieldAlert className="w-8 h-8 text-orange-500 group-hover:scale-110 transition-transform" />
                                            </div>
                                            <div className="flex-1 ml-3 min-w-0 pr-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-[13px] font-bold text-white truncate uppercase tracking-tight">{alert.title}</h3>
                                                    <span className="text-[9px] text-orange-500/80 font-mono whitespace-nowrap ml-2">
                                                        {getLiveTimeAgo((alert as any).timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                                    {alert.summary}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${alert.severity === "HIGH" ? "bg-red-500/20 text-red-500" :
                                                        alert.severity === "MEDIUM" ? "bg-orange-500/20 text-orange-500" :
                                                            "bg-emerald-500/20 text-emerald-500"
                                                        }`}>
                                                        {alert.severity}
                                                    </span>
                                                    <span className="text-[8px] text-slate-light/40 uppercase tracking-widest">{alert.isoCode}</span>
                                                </div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                                <ArrowUpRight className="w-4 h-4 text-orange-500" />
                                            </div>
                                        </motion.a>
                                    );
                                }))}
                            </AnimatePresence>
                        )}
                    </>
                )}

                {activeTab === "NEWS" && (
                    <div className="space-y-4 cursor-default">
                        {/* Top Story Feature Card */}
                        {filteredAlerts.length > 0 ? (
                            <motion.a
                                href={filteredAlerts[0].url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="block group relative rounded-[24px] overflow-hidden border border-white/10 h-[220px] mb-6 shadow-2xl transition-all duration-500 hover:scale-[1.01]"
                            >
                                {/* Background Image with Overlay */}
                                <div className="absolute inset-0 z-0">
                                    <SafeImage
                                        src={filteredAlerts[0].imageUrl}
                                        fallbackIcon={Globe}
                                        className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-1000 scale-110 group-hover:scale-100 opacity-60 group-hover:opacity-80"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#151515] via-[#151515]/80 to-transparent" />
                                </div>

                                {/* Content */}
                                <div className="absolute inset-0 z-10 p-6 flex flex-col justify-end">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="flex items-center gap-1.5 bg-cobalt px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-lg animate-pulse">
                                            <Newspaper className="w-3 h-3" /> FEATURED STORY
                                        </span>
                                        <span className="text-[10px] text-white/60 font-mono uppercase tracking-[0.2em]">
                                            {filteredAlerts[0].source || "INTEL"} • {getLiveTimeAgo((filteredAlerts[0] as any).timestamp)}
                                        </span>
                                    </div>
                                    <h2 className="text-xl md:text-2xl font-black text-white leading-tight mb-2 group-hover:text-cobalt transition-colors duration-300">
                                        {filteredAlerts[0].title}
                                    </h2>
                                    <p className="text-xs md:text-sm text-white/70 font-light line-clamp-2 max-w-[90%] leading-relaxed mb-4">
                                        {filteredAlerts[0].summary}
                                    </p>
                                    <div className="flex items-center text-cobalt text-[10px] font-bold uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        SECURE ACCESS TO FULL REPORT <ArrowUpRight className="ml-1 w-3 h-3" />
                                    </div>
                                </div>
                            </motion.a>
                        ) : (
                            <div className="p-4 border border-white/5 border-dashed rounded-[20px] text-center opacity-30 h-[100px] flex items-center justify-center">
                                <span className="text-[10px] font-mono tracking-widest text-white">NO TOP STORIES DETECTED</span>
                            </div>
                        )}

                        <div className="text-[10px] font-mono text-slate-light border-b border-border pb-1 mt-6 mb-2">MACROECONOMIC CONTEXT & FORESIGHT</div>

                        {filteredAlerts.slice(1, 8).map((news, idx) => (
                            <a
                                key={idx}
                                href={news.url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center w-full h-[85px] bg-[#252525] hover:bg-[#353535] border border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden p-2"
                            >
                                <div className="w-[65px] h-[65px] shrink-0 rounded-[15px] overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                                    <SafeImage src={news.imageUrl} fallbackIcon={Newspaper} className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500 scale-110 group-hover:scale-100" />
                                </div>
                                <div className="flex-1 ml-3 min-w-0 pr-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-[13px] font-bold text-white truncate uppercase tracking-tight">{news.title}</h3>
                                        <span className="text-[9px] text-cobalt/80 font-mono whitespace-nowrap ml-2">{getLiveTimeAgo((news as any).timestamp)}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                        {news.summary}
                                    </p>
                                    <div className="mt-1">
                                        <span className="text-[8px] font-bold text-cobalt uppercase tracking-widest">{news.source || "OSINT WIRE"}</span>
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                    <ArrowUpRight className="w-4 h-4 text-cobalt" />
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                {activeTab === "BLOGS" && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-green-500 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            MEDIUM GEOPOLITICAL ANALYSIS
                        </div>
                        {blogsLoading && blogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 opacity-50 space-y-2">
                                <span className="text-xs font-mono animate-pulse">SCRAPING MEDIUM BLOGS...</span>
                                <div className="text-[10px] text-slate-light text-center px-4">Firecrawl extracting geopolitical analysis from Medium publications.</div>
                            </div>
                        ) : blogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 opacity-50">
                                <span className="text-xs font-mono">NO BLOG POSTS AVAILABLE.</span>
                            </div>
                        ) : (
                            blogs.map((post, idx) => (
                                <a
                                    key={idx}
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center w-full h-[85px] bg-[#252525] hover:bg-[#353535] border border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden p-2"
                                >
                                    <div className="w-[65px] h-[65px] shrink-0 rounded-[15px] overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                                        <SafeImage src={post.imageUrl} fallbackIcon={BookOpen} className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500 scale-110 group-hover:scale-100" />
                                    </div>
                                    <div className="flex-1 ml-3 min-w-0 pr-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className="text-[13px] font-bold text-white truncate uppercase tracking-tight">{post.title}</h3>
                                            <span className="text-[9px] text-green-500/80 font-mono whitespace-nowrap ml-2 uppercase">{post.tag}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                            {post.summary}
                                        </p>
                                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[8px] text-green-500/60 font-bold uppercase tracking-wider">
                                            <Users className="w-2.5 h-2.5" /> {post.author}
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                                    </div>
                                </a>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "MEDIA" && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-red-500 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            EXTERNAL OSINT MEDIA SOURCES
                        </div>
                        {[
                            { name: "Into Africa (CSIS)", handle: "@csis", focus: "African Political, Economic & Security Issues", url: "https://www.youtube.com/@csis" },
                            { name: "African Geopolitics in Action", handle: "#Geopolitics", focus: "Policy & Strategic Shifts", url: "https://www.youtube.com/results?search_query=African+Geopolitics+in+Action" },
                            { name: "Africa World Hour", handle: "@sabcnews", focus: "African Perspectives on Regional Developments", url: "https://www.youtube.com/results?search_query=Africa+World+Hour" },
                            { name: "Geopolitical Monitor", handle: "Geopolitics", focus: "Security, Resources & Strategic Developments", url: "https://www.youtube.com/results?search_query=Geopolitical+Monitor+Africa" },
                            { name: "Peter Zeihan", handle: "@ZeihanOnGeopolitics", focus: "Data-Driven Analysis on African Infrastructure & Resources", url: "https://www.youtube.com/@ZeihanOnGeopolitics" }
                        ].map((channel, idx) => (
                            <a
                                key={idx}
                                href={channel.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-4 p-4 bg-[#252525] hover:bg-[#353535] border border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden"
                            >
                                <div className="w-12 h-12 shrink-0 rounded-[12px] bg-red-500/10 border border-red-500/20 flex items-center justify-center transition-all duration-500 group-hover:bg-red-500/20">
                                    <div className="text-red-500"><YouTubeIcon /></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[14px] font-bold text-white mb-1 group-hover:text-red-500 transition-colors">
                                        {channel.name}
                                    </h3>
                                    <div className="text-[10px] font-mono text-red-500/60 mb-2 uppercase tracking-tight">
                                        {channel.handle}
                                    </div>
                                    <div className="text-[9px] text-slate-light/60 font-mono leading-tight">
                                        {channel.focus.toUpperCase()}
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                {/* Suggestions Section */}
                <div className="mt-6 border-t border-border pt-4">
                    <div className="text-[10px] font-mono text-cobalt flex items-center gap-2 mb-3">
                        <Lightbulb className="w-3 h-3" /> PLATFORM SUGGESTIONS
                    </div>
                    <div className="space-y-2">
                        {[
                            "Track Dangote Refinery output vs OPEC quotas for Nigeria",
                            "Monitor PAPSS transaction volume growth quarter-over-quarter",
                            "Compare DRC cobalt policy to Indonesia's nickel export ban model",
                            "Map Belt & Road debt exposure across East African corridor",
                            "Analyze AfCFTA tariff reduction timelines by member state"
                        ].map((suggestion, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-[#1d1d1d] hover:bg-[#252525] border border-white/5 rounded-[15px] transition-all duration-300 group cursor-default">
                                <div className="w-6 h-6 shrink-0 rounded-full bg-cobalt/10 border border-cobalt/20 flex items-center justify-center group-hover:bg-cobalt/20 transition-colors">
                                    <span className="text-cobalt text-[10px] font-bold">→</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-light leading-snug group-hover:text-white transition-colors">
                                    {suggestion}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
}
