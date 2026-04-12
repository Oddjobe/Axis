"use client"

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, ShieldCheck, Globe2, Clock } from 'lucide-react';

interface Commodity {
    id: string;
    name: string;
    price: number;
    unit: string;
    currency: string;
    trend: number;
    source: string;
    sourceUrl?: string;
    lastUpdated: string;
    frequency?: string;
    category: string;
    color: string;
}

function relativeTime(dateStr: string): string {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffD > 30) return `${Math.floor(diffD / 30)}mo ago`;
    if (diffD > 0) return `${diffD}d ago`;
    if (diffH > 0) return `${diffH}h ago`;
    return 'just now';
}

export default function CommodityTicker() {
    const [commodities, setCommodities] = useState<Commodity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCommodities = async () => {
            try {
                const res = await fetch('/api/commodities');
                const json = await res.json();
                if (json.success) {
                    setCommodities(json.data);
                }
            } catch (err) {
                console.error("Ticker fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCommodities();
        // Refresh every 5 minutes for "vetted" updates
        const interval = setInterval(fetchCommodities, 300000);
        return () => clearInterval(interval);
    }, []);

    if (loading || commodities.length === 0) return null;

    // Duplicate items for seamless loop
    const displayItems = [...commodities, ...commodities];

    return (
        <div className="h-8 lg:h-9 bg-black/60 dark:bg-black/40 border-b border-border flex items-center overflow-hidden relative group">
            {/* Vetted Source Badge */}
            <div className="absolute left-0 top-0 bottom-0 px-3 bg-cobalt/20 backdrop-blur-md border-r border-cobalt/30 flex items-center gap-2 z-20 shadow-[8px_0_15px_rgba(0,0,0,0.5)]">
                <ShieldCheck className="w-3.5 h-3.5 text-cobalt" />
                <span className="text-[9px] font-bold font-mono text-cobalt tracking-widest uppercase">VETTED DATA</span>
            </div>

            <motion.div
                animate={{ x: [0, -100 * commodities.length] }}
                transition={{
                    x: {
                        repeat: Infinity,
                        repeatType: "loop",
                        duration: 40,
                        ease: "linear",
                    },
                }}
                className="flex items-center gap-12 pl-36 whitespace-nowrap"
            >
                {displayItems.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold font-mono text-slate-light">{item.name}</span>
                                {item.trend > 0 ? (
                                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                                ) : (
                                    <TrendingDown className="w-3 h-3 text-red-500" />
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 leading-none">
                                <span className="text-xs font-bold font-mono tracking-tight">
                                    {item.currency} {item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[8px] font-mono text-slate-light">/{item.unit}</span>
                                <span className={`text-[8px] font-bold font-mono ${item.trend > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {item.trend > 0 ? '+' : ''}{item.trend}%
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                            <Globe2 className="w-2.5 h-2.5 text-slate-light" />
                            <span className="text-[7px] font-mono font-bold text-slate-light uppercase">{item.source}</span>
                        </div>

                        {/* Data freshness badge */}
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5">
                            <Clock className="w-2 h-2 text-zinc-500" />
                            <span className="text-[6px] font-mono text-zinc-500 uppercase">
                                {item.frequency === 'daily' ? relativeTime(item.lastUpdated) : item.frequency?.toUpperCase() || relativeTime(item.lastUpdated)}
                            </span>
                        </div>

                        <div className="w-px h-4 bg-border/50 ml-6" />
                    </div>
                ))}
            </motion.div>

            {/* Glossy Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background/80 via-transparent to-background/80 opacity-40" />
        </div>
    );
}
