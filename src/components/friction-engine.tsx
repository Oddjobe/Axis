"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Image from "next/image"
import { ShieldAlert, Newspaper, Video, BookOpen, Lightbulb, Globe, Play, Square, ArrowUpRight, Users, Radio, Wifi, WifiOff } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useWatchlist } from "@/lib/use-watchlist"
import type { IntelligenceAlert } from "./country-dossier-modal"

export interface BlogPost {
    id: string;
    created_at: string;
    title: string;
    summary: string;
    content?: string;
    imageUrl?: string;
    url: string;
    source: string;
    category?: string;
    readingTime?: string;
    author?: string;
    tag?: string;
}

interface Article {
    category: string
    title: string
    summary: string
    timeAgo: string
    isoCode: string
    actor?: string
    timestamp?: string
    url?: string
    imageUrl?: string
    severity: "HIGH" | "MEDIUM" | "LOW"
    source?: string
}

// Brand SVG Icons
const YouTubeIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
)

const SafeImage = ({ src, fallbackIcon: Icon, className, width, height, fill }: { src?: string; fallbackIcon: React.ComponentType<{ className?: string }>; className?: string; width?: number; height?: number; fill?: boolean }) => {
    const [error, setError] = useState(false);
    if (error || !src) return (
        <div className={`flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10 ${className}`}>
            <Icon className="w-8 h-8 opacity-20" />
        </div>
    );
    return (
        <Image
            src={src}
            alt=""
            className={`object-cover ${className}`}
            onError={() => setError(true)}
            width={width}
            height={height}
            fill={fill}
            unoptimized={src.startsWith('http')}
        />
    );
}

// ISO → flag emoji helper
const isoToFlag = (iso: string) => {
    const map: Record<string, string> = {
        NGA: "🇳🇬", ETH: "🇪🇹", EGY: "🇪🇬", COD: "🇨🇩", TZA: "🇹🇿", ZAF: "🇿🇦", KEN: "🇰🇪",
        UGA: "🇺🇬", SDN: "🇸🇩", DZA: "🇩🇿", MAR: "🇲🇦", AGO: "🇦🇴", GHA: "🇬🇭", MOZ: "🇲🇿",
        MDG: "🇲🇬", CIV: "🇨🇮", CMR: "🇨🇲", NER: "🇳🇪", BFA: "🇧🇫", MLI: "🇲🇱", MWI: "🇲🇼",
        ZMB: "🇿🇲", TCD: "🇹🇩", SOM: "🇸🇴", SEN: "🇸🇳", ZWE: "🇿🇼", GIN: "🇬🇳", RWA: "🇷🇼",
        BEN: "🇧🇯", BDI: "🇧🇮", TUN: "🇹🇳", SSD: "🇸🇸", TGO: "🇹🇬", SLE: "🇸🇱", LBY: "🇱🇾",
        COG: "🇨🇬", CAF: "🇨🇫", LBR: "🇱🇷", MRT: "🇲🇷", ERI: "🇪🇷", GMB: "🇬🇲", BWA: "🇧🇼",
        NAM: "🇳🇦", GNB: "🇬🇼", LSO: "🇱🇸", GNQ: "🇬🇶", MUS: "🇲🇺", SWZ: "🇸🇿", DJI: "🇩🇯",
        COM: "🇰🇲", CPV: "🇨🇻", STP: "🇸🇹", SYC: "🇸🇨"
    };
    return map[iso?.toUpperCase()] || "🌍";
};

// Reading time estimate
const estimateReadTime = (text?: string) => {
    if (!text) return "1 MIN";
    const words = text.split(/\s+/).length;
    return `${Math.max(1, Math.ceil(words / 120))} MIN`;
};

// Skeleton loading components
const FeedCardSkeleton = () => (
    <div className="flex items-center w-full min-h-[75px] sm:min-h-[85px] bg-background/40 dark:bg-onyx/20 border border-border/20 dark:border-white/5 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 animate-pulse">
        <div className="w-[45px] h-[45px] sm:w-[60px] sm:h-[60px] shrink-0 rounded-lg sm:rounded-xl bg-white/5" />
        <div className="flex-1 ml-2.5 sm:ml-3 space-y-2">
            <div className="h-3 bg-white/5 rounded w-3/4" />
            <div className="h-2 bg-white/5 rounded w-full" />
            <div className="h-2 bg-white/5 rounded w-1/3" />
        </div>
    </div>
);

const HeroCardSkeleton = () => (
    <div className="rounded-[24px] overflow-hidden border border-border/20 dark:border-white/5 h-[220px] mb-6 animate-pulse bg-white/5">
        <div className="h-full p-4 lg:p-6 flex flex-col justify-end">
            <div className="h-3 bg-white/5 rounded w-24 mb-3" />
            <div className="h-5 bg-white/5 rounded w-3/4 mb-2" />
            <div className="h-3 bg-white/5 rounded w-full mb-2" />
            <div className="h-2 bg-white/5 rounded w-20" />
        </div>
    </div>
);

const EmptyState = ({ icon: Icon, message, sub }: { icon: React.ComponentType<{ className?: string }>; message: string; sub: string }) => (
    <div className="flex flex-col items-center justify-center py-16 opacity-60 space-y-3">
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-slate-light/50" />
        </div>
        <span className="text-xs font-mono font-bold tracking-widest">{message}</span>
        <span className="text-[10px] text-slate-light/40 text-center px-6 max-w-[240px]">{sub}</span>
    </div>
);

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

    const [, setDummy] = useState(0);
    useEffect(() => {
        const handleWatchlistChange = () => setDummy(n => n + 1);
        window.addEventListener("watchlistUpdated", handleWatchlistChange);
        return () => window.removeEventListener("watchlistUpdated", handleWatchlistChange);
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttsRef = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const [now, setNow] = useState<number | null>(null);

    const fetchIntelligence = useCallback(async (isMounted: boolean) => {
        try {
            const res = await fetch("/api/intelligence");
            const data = await res.json();
            if (!data) return;

            const enhancedData = data.map((alert: IntelligenceAlert) => {
                const exactDate = alert.created_at ? new Date(alert.created_at) : new Date();
                return {
                    ...alert,
                    timestamp: exactDate.toISOString(),
                    timeAgo: ""
                } as Article;
            });

            setAlerts((prev) => {
                if (prev.length === 0) return enhancedData;
                const merged = [...prev];
                enhancedData.forEach((newAlert: Article) => {
                    const existingIdx = merged.findIndex(a => a.title === newAlert.title);
                    if (existingIdx === -1) {
                        merged.unshift(newAlert);
                    }
                });
                return merged;
            });
        } catch (e) {
            console.error("Intelligence load failed", e);
        } finally {
            if (isMounted) setLoading(false);
        }
    }, []);

    const fetchBlogs = useCallback(async (isMounted: boolean) => {
        try {
            const res = await fetch("/api/blogs");
            const data = await res.json();
            if (isMounted) setBlogs(data);
        } catch (e) {
            console.error("Blog load failed", e);
        } finally {
            if (isMounted) setBlogsLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMountedInternal = true;

        fetchIntelligence(isMountedInternal);
        fetchBlogs(isMountedInternal);
        setNow(Date.now());

        const intervalId = setInterval(() => {
            fetchIntelligence(isMountedInternal);
            fetchBlogs(isMountedInternal);
        }, 5 * 60 * 1000);

        const tickId = setInterval(() => {
            if (isMountedInternal) setNow(Date.now());
        }, 60000);

        return () => {
            isMountedInternal = false;
            clearInterval(intervalId);
            clearInterval(tickId);
        };
    }, [fetchIntelligence, fetchBlogs]);

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

    const toggleAudioBrief = useCallback(async () => {
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
                const { KokoroTTS } = await import("kokoro-js");
                ttsRef.current = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                    dtype: 'q8',
                    device: 'webgpu'
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
            topAlerts.forEach((alert, index) => {
                textsToSpeak.push(`Alert ${index + 1}. ${alert.title}. ${alert.summary}`);
            });

            for (let i = 0; i < textsToSpeak.length; i++) {
                if (!audioCtxRef.current) break;

                const text = textsToSpeak[i];
                const audio = await ttsRef.current.generate(text, {
                    voice: 'af_heart',
                });

                if (!audioCtxRef.current) break;

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
                setIsPlayingAudio(false);
                setAudioPaused(false);
            }
        }
    }, [isDownloadingModel, filteredAlerts, isPlayingAudio, audioPaused, mode]);

    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, []);

    return (
        <aside className="w-full lg:w-96 border-l border-border bg-panel backdrop-blur-sm flex flex-col shrink-0 transition-colors overflow-hidden">
            <div className="flex border-b border-border text-xs font-bold tracking-wider pt-2 px-1 gap-0.5">
                <button
                    onClick={() => setActiveTab("ALERTS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "ALERTS" ? "border-orange-500 text-orange-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px]">ALERTS</span>
                </button>
                <button
                    onClick={() => setActiveTab("NEWS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "NEWS" ? "border-cobalt text-cobalt" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Newspaper className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px]">NEWS</span>
                </button>
                <button
                    onClick={() => setActiveTab("BLOGS")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "BLOGS" ? "border-green-500 text-green-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <BookOpen className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px]">BLOGS</span>
                </button>
                <button
                    onClick={() => setActiveTab("MEDIA")}
                    className={`flex-1 pb-2 flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === "MEDIA" ? "border-red-500 text-red-500" : "border-transparent text-slate-light hover:text-foreground"}`}
                >
                    <Video className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px]">MEDIA</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {filterCountries && filterCountries.length > 0 && (
                    <div className="text-[10px] font-mono px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-500 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        FILTERED: {filterCountries.length === 1 ? filterCountries[0].toUpperCase() : `${filterCountries.length} COUNTRIES`}
                    </div>
                )}
                {activeTab === "ALERTS" && (
                    <>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[10px] font-mono text-slate-light/60 uppercase tracking-widest">Live Signals</span>
                            <button
                                onClick={filteredAlerts.length > 0 ? (isPlayingAudio && !audioPaused ? stopAudio : toggleAudioBrief) : undefined}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold tracking-widest transition-all ${filteredAlerts.length === 0 ? "opacity-30 cursor-not-allowed border border-border bg-background" :
                                    isPlayingAudio && !audioPaused ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20" :
                                        isPlayingAudio && audioPaused ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/20" :
                                            isDownloadingModel ? "bg-cobalt/10 text-cobalt border border-cobalt/30 hover:bg-cobalt/20 opacity-80 cursor-wait" :
                                                "bg-orange-500/10 text-orange-500 border border-orange-500/30 hover:bg-orange-500/20 shadow-sm"
                                    }`}
                            >
                                {isDownloadingModel ? <Globe className="w-3 h-3 animate-spin" /> : isPlayingAudio && !audioPaused ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                <span className="hidden xs:inline">{isDownloadingModel ? "INITIALIZING..." : isPlayingAudio && !audioPaused ? "STOP BRIEF" : isPlayingAudio && audioPaused ? "RESUME" : "AUDIO BRIEF"}</span>
                                <span className="xs:hidden">{isPlayingAudio && !audioPaused ? "STOP" : "PLAY"}</span>
                            </button>
                        </div>
                        {loading && alerts.length === 0 ? (
                            <div className="space-y-3">
                                {[...Array(5)].map((_, i) => <FeedCardSkeleton key={i} />)}
                            </div>
                        ) : filteredAlerts.length === 0 ? (
                            <EmptyState icon={ShieldAlert} message={`NO ${mode} SIGNALS`} sub="No active intelligence signals match your current filter criteria." />
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {(isMounted ? [...(filteredAlerts || [])].sort((a, b) => {
                                    const aPinned = watchlist.includes(a.isoCode);
                                    const bPinned = watchlist.includes(b.isoCode);
                                    if (aPinned && !bPinned) return -1;
                                    if (!aPinned && bPinned) return 1;
                                    return 0;
                                }).map((alert, idx) => (
                                    <motion.a
                                        key={`${alert.title}-${idx}`}
                                        href={alert.url || "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        layout
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ delay: idx * 0.08, duration: 0.3 }}
                                        className={`relative flex items-start sm:items-center w-full min-h-[75px] sm:min-h-[85px] bg-background/60 dark:bg-onyx/40 hover:bg-background/80 dark:hover:bg-onyx/60 border border-border/40 dark:border-white/5 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all duration-300 hover:scale-[1.01] group cursor-pointer overflow-hidden p-2 sm:p-2.5 ${alert.severity === "HIGH" ? "border-l-4 border-l-red-500" : alert.severity === "MEDIUM" ? "border-l-4 border-l-orange-500" : "border-l-4 border-l-emerald-500"}`}
                                    >
                                        {alert.severity === "HIGH" && (
                                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                        )}
                                        <div className="w-[45px] h-[45px] sm:w-[60px] sm:h-[60px] lg:w-[65px] lg:h-[65px] shrink-0 rounded-lg sm:rounded-xl overflow-hidden border border-orange-500/20 group-hover:border-orange-500/40 transition-colors mt-0.5 sm:mt-0">
                                            <SafeImage src={alert.imageUrl} fallbackIcon={ShieldAlert} className="w-full h-full grayscale group-hover:grayscale-0 transition-opacity duration-500 scale-105 group-hover:scale-100" width={65} height={65} />
                                        </div>
                                        <div className="flex-1 ml-2.5 sm:ml-3 min-w-0 pr-1 sm:pr-2">
                                            <h3 className="text-[13px] sm:text-sm font-semibold text-foreground dark:text-white line-clamp-2 leading-snug mb-1">{alert.title}</h3>
                                            <p className="text-[10px] sm:text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                                {alert.summary}
                                            </p>
                                            <div className="mt-1 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                <span className={`text-[7px] sm:text-[8px] font-bold px-1.5 py-0.5 rounded-sm sm:rounded uppercase ${alert.severity === "HIGH" ? "bg-red-500/20 text-red-500" :
                                                    alert.severity === "MEDIUM" ? "bg-orange-500/20 text-orange-500" :
                                                        "bg-emerald-500/20 text-emerald-500"
                                                    }`}>
                                                    {alert.severity}
                                                </span>
                                                <span className="text-[9px]">{isoToFlag(alert.isoCode)}</span>
                                                <span className="text-[7px] sm:text-[8px] text-slate-light/40 uppercase tracking-widest">{alert.isoCode}</span>
                                                <span className="text-[8px] sm:text-[9px] text-orange-500/60 font-mono ml-auto">
                                                    {getLiveTimeAgo(alert.timestamp)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                            <ArrowUpRight className="w-4 h-4 text-orange-500" />
                                        </div>
                                    </motion.a>
                                )) : null)}
                            </AnimatePresence>
                        )}
                    </>
                )}

                {activeTab === "NEWS" && (
                    <div className="space-y-4">
                        {loading && filteredAlerts.length === 0 ? (
                            <>
                                <HeroCardSkeleton />
                                {[...Array(3)].map((_, i) => <FeedCardSkeleton key={i} />)}
                            </>
                        ) : filteredAlerts.length > 0 ? (
                            <motion.a
                                href={filteredAlerts[0].url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="block group relative rounded-[24px] overflow-hidden border border-border/40 dark:border-white/10 h-[220px] mb-6 shadow-2xl transition-all duration-500 hover:scale-[1.01]"
                            >
                                <div className="absolute inset-0 z-0">
                                    <SafeImage
                                        src={filteredAlerts[0].imageUrl}
                                        fallbackIcon={Globe}
                                        className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-1000 scale-105 group-hover:scale-100 opacity-50 group-hover:opacity-70"
                                        fill
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-onyx via-onyx/70 to-transparent" />
                                </div>

                                <div className="absolute inset-0 z-10 p-4 lg:p-6 flex flex-col justify-end">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="flex items-center gap-1 bg-cobalt px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow-lg">
                                            <Newspaper className="w-2.5 h-2.5" /> FEATURED
                                        </span>
                                        <span className="text-[9px] text-white/50 font-mono uppercase tracking-widest truncate">
                                            {filteredAlerts[0].source || "INTEL"} • {getLiveTimeAgo(filteredAlerts[0].timestamp)}
                                        </span>
                                    </div>
                                    <h2 className="text-lg lg:text-xl font-bold text-white leading-snug mb-1.5 group-hover:text-cobalt transition-colors duration-300 line-clamp-2">
                                        {filteredAlerts[0].title}
                                    </h2>
                                    <p className="text-[10px] lg:text-sm text-white/60 font-light line-clamp-2 max-w-[95%] leading-relaxed mb-3 lg:mb-4">
                                        {filteredAlerts[0].summary}
                                    </p>
                                    <div className="flex items-center text-cobalt text-[9px] font-bold uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        ACCESS REPORT <ArrowUpRight className="ml-1 w-2.5 h-2.5" />
                                    </div>
                                </div>
                            </motion.a>
                        ) : (
                            <EmptyState icon={Newspaper} message="NO TOP STORIES" sub="Intelligence feeds are being scanned. Check back shortly for macroeconomic updates." />
                        )}

                        {filteredAlerts.length > 0 && (
                        <>
                        <div className="text-[10px] font-mono text-slate-light border-b border-border pb-1 mt-6 mb-2">MACROECONOMIC CONTEXT & FORESIGHT</div>

                        {filteredAlerts.slice(1, 8).map((news, idx) => (
                            <a
                                key={idx}
                                href={news.url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start sm:items-center w-full min-h-[75px] sm:min-h-[85px] bg-background/60 dark:bg-onyx/40 hover:bg-background/80 dark:hover:bg-onyx/60 border border-border/40 dark:border-white/5 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all duration-300 hover:scale-[1.01] group cursor-pointer overflow-hidden p-2 sm:p-2.5"
                            >
                                <div className="w-[28px] h-[28px] sm:w-[32px] sm:h-[32px] shrink-0 rounded-lg bg-cobalt/10 border border-cobalt/20 flex items-center justify-center mr-2 mt-0.5 sm:mt-0">
                                    <span className="text-cobalt font-mono font-black text-[11px] sm:text-[13px]">{String(idx + 1).padStart(2, '0')}</span>
                                </div>
                                <div className="w-[45px] h-[45px] sm:w-[55px] sm:h-[55px] shrink-0 rounded-lg sm:rounded-xl overflow-hidden border border-border/40 dark:border-white/10 group-hover:border-cobalt/40 transition-colors mt-0.5 sm:mt-0">
                                    <SafeImage src={news.imageUrl} fallbackIcon={Newspaper} className="w-full h-full grayscale group-hover:grayscale-0 transition-opacity duration-500 scale-105 group-hover:scale-100" width={55} height={55} />
                                </div>
                                <div className="flex-1 ml-2.5 sm:ml-3 min-w-0 pr-1 sm:pr-2">
                                    <h3 className="text-[13px] sm:text-sm font-semibold text-foreground dark:text-white line-clamp-2 leading-snug mb-1">{news.title}</h3>
                                    <p className="text-[10px] sm:text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                        {news.summary}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-[7px] sm:text-[8px] font-bold text-cobalt uppercase tracking-widest">{news.source || "OSINT WIRE"}</span>
                                        {news.category && (
                                            <span className="text-[7px] px-1.5 py-0.5 rounded bg-cobalt/10 text-cobalt/80 font-mono font-bold uppercase tracking-wider">{news.category}</span>
                                        )}
                                        <span className="text-[7px] text-slate-light/30 font-mono">{estimateReadTime(news.summary)} READ</span>
                                        <span className="text-[8px] sm:text-[9px] text-cobalt/60 font-mono ml-auto">{getLiveTimeAgo(news.timestamp)}</span>
                                    </div>
                                </div>
                                <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                    <ArrowUpRight className="w-4 h-4 text-cobalt" />
                                </div>
                            </a>
                        ))}
                        </>
                        )}
                    </div>
                )}

                {activeTab === "BLOGS" && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-green-500 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            MEDIUM GEOPOLITICAL ANALYSIS
                        </div>
                        {blogsLoading && blogs.length === 0 ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => <FeedCardSkeleton key={i} />)}
                            </div>
                        ) : blogs.length === 0 ? (
                            <EmptyState icon={BookOpen} message="NO BLOG POSTS" sub="Geopolitical analysis feed is warming up. Medium publications will appear here." />
                        ) : (
                            <>
                            {/* Featured first blog */}
                            {blogs[0] && (
                                <a
                                    href={blogs[0].url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block group relative rounded-2xl overflow-hidden border border-green-500/20 hover:border-green-500/40 bg-gradient-to-br from-green-500/5 to-transparent transition-all duration-500 hover:scale-[1.01]"
                                >
                                    <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-600" />
                                    <div className="p-4 space-y-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 uppercase tracking-widest">FEATURED</span>
                                            {blogs[0].tag && <span className="text-[8px] text-green-500/60 font-mono uppercase">{blogs[0].tag}</span>}
                                            {blogs[0].readingTime && <span className="text-[8px] text-slate-light/40 font-mono ml-auto">{blogs[0].readingTime} READ</span>}
                                        </div>
                                        <h3 className="text-[15px] sm:text-lg font-bold text-foreground dark:text-white leading-snug group-hover:text-green-400 transition-colors line-clamp-2">
                                            {blogs[0].title}
                                        </h3>
                                        <p className="text-[11px] text-slate-light font-light line-clamp-3 leading-relaxed">{blogs[0].summary}</p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-[8px] text-green-500/60 font-mono font-bold uppercase tracking-wider">
                                                <Users className="w-2.5 h-2.5" /> {blogs[0].author || "ANALYST"}
                                            </div>
                                            <div className="flex items-center text-green-500 text-[9px] font-bold uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                                READ <ArrowUpRight className="ml-1 w-2.5 h-2.5" />
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            )}
                            {/* Remaining blog cards with accent bar */}
                            {blogs.slice(1).map((post, idx) => (
                                <a
                                    key={idx}
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative flex items-start sm:items-center w-full min-h-[75px] sm:min-h-[85px] bg-background/60 dark:bg-onyx/40 hover:bg-background/80 dark:hover:bg-onyx/60 border border-border/40 dark:border-white/5 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all duration-300 hover:scale-[1.01] group cursor-pointer overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-green-500/60 via-emerald-400/40 to-transparent" />
                                    <div className="flex items-start sm:items-center w-full p-2 sm:p-2.5">
                                        <div className="w-[45px] h-[45px] sm:w-[60px] sm:h-[60px] lg:w-[65px] lg:h-[65px] shrink-0 rounded-lg sm:rounded-xl overflow-hidden border border-white/10 group-hover:border-green-500/40 transition-colors mt-0.5 sm:mt-0">
                                            <SafeImage src={post.imageUrl} fallbackIcon={BookOpen} className="w-full h-full grayscale group-hover:grayscale-0 transition-opacity duration-500 scale-105 group-hover:scale-100" width={65} height={65} />
                                        </div>
                                        <div className="flex-1 ml-2.5 sm:ml-3 min-w-0 pr-1 sm:pr-2">
                                            <h3 className="text-[13px] sm:text-sm font-semibold text-foreground dark:text-white line-clamp-2 leading-snug mb-1">{post.title}</h3>
                                            <p className="text-[10px] sm:text-[11px] text-slate-light font-light line-clamp-2 leading-tight">
                                                {post.summary}
                                            </p>
                                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                                                <span className="flex items-center gap-1 font-mono text-[7px] sm:text-[8px] text-green-500/60 font-bold uppercase tracking-wider">
                                                    <Users className="w-2.5 h-2.5" /> {post.author}
                                                </span>
                                                {post.tag && <span className="text-[7px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500/70 font-mono font-bold uppercase">{post.tag}</span>}
                                                {post.readingTime && <span className="text-[8px] text-green-500/50 font-mono ml-auto">{post.readingTime}</span>}
                                            </div>
                                        </div>
                                        <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                            <ArrowUpRight className="w-4 h-4 text-green-500" />
                                        </div>
                                    </div>
                                </a>
                            ))}
                            </>
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
                            { name: "Into Africa (CSIS)", handle: "@csis", focus: "African Political, Economic & Security Issues", url: "https://www.youtube.com/@csis", badge: "RECOMMENDED" },
                            { name: "African Geopolitics in Action", handle: "#Geopolitics", focus: "Policy & Strategic Shifts", url: "https://www.youtube.com/results?search_query=African+Geopolitics+in+Action", badge: null },
                            { name: "Africa World Hour", handle: "@sabcnews", focus: "African Perspectives on Regional Developments", url: "https://www.youtube.com/results?search_query=Africa+World+Hour", badge: null },
                            { name: "Geopolitical Monitor", handle: "Geopolitics", focus: "Security, Resources & Strategic Developments", url: "https://www.youtube.com/results?search_query=Geopolitical+Monitor+Africa", badge: "RECOMMENDED" },
                            { name: "Peter Zeihan", handle: "@ZeihanOnGeopolitics", focus: "Data-Driven Analysis on African Infrastructure & Resources", url: "https://www.youtube.com/@ZeihanOnGeopolitics", badge: "RECOMMENDED" }
                        ].map((channel, idx) => (
                            <motion.a
                                key={idx}
                                href={channel.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.08 }}
                                className="relative flex items-start gap-4 p-4 bg-background/60 dark:bg-[#252525] hover:bg-background/80 dark:hover:bg-[#353535] border border-border/40 dark:border-white/5 rounded-[20px] backdrop-blur-[10px] transition-all duration-500 ease-in-out hover:scale-[1.02] group cursor-pointer overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500/40 via-red-400/20 to-transparent" />
                                <div className="relative w-14 h-14 shrink-0 rounded-[14px] bg-red-500/10 border border-red-500/20 flex items-center justify-center transition-all duration-500 group-hover:bg-red-500/20 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                                    <div className="text-red-500"><YouTubeIcon /></div>
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                                            <Play className="w-3 h-3 text-white ml-0.5" fill="white" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-[14px] font-bold text-foreground dark:text-white group-hover:text-red-500 transition-colors truncate">
                                            {channel.name}
                                        </h3>
                                        {channel.badge && (
                                            <span className="shrink-0 text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 uppercase tracking-widest">{channel.badge}</span>
                                        )}
                                    </div>
                                    <div className="text-[10px] font-mono text-red-500/60 mb-1.5 uppercase tracking-tight">
                                        {channel.handle}
                                    </div>
                                    <div className="text-[9px] text-slate-light/60 font-mono leading-tight">
                                        {channel.focus.toUpperCase()}
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0 self-center">
                                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                                </div>
                            </motion.a>
                        ))}
                    </div>
                )}

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
                            <div key={idx} className="flex items-center gap-3 p-3 bg-background/40 dark:bg-[#1d1d1d] hover:bg-background/60 dark:hover:bg-[#252525] border border-border/40 dark:border-white/5 rounded-[15px] transition-all duration-300 group cursor-default">
                                <div className="w-6 h-6 shrink-0 rounded-full bg-cobalt/10 border border-cobalt/20 flex items-center justify-center group-hover:bg-cobalt/20 transition-colors">
                                    <span className="text-cobalt text-[10px] font-bold">→</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-light leading-snug group-hover:text-foreground dark:group-hover:text-white transition-colors">
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
