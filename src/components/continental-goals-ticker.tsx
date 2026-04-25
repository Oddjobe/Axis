"use client"

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

// Base synthetic data for critical African commodities
const INITIAL_COMMODITIES = [
    { id: "CO", title: "COBALT (LME)", price: 57178, unit: "$/MT", trend: "+", change: 0.42 },
    { id: "LI", title: "LITHIUM CARBONATE", price: 23479, unit: "$/MT", trend: "+", change: 1.12 },
    { id: "AU", title: "GOLD (SPOT)", price: 5163, unit: "$/OZ", trend: "+", change: 0.45 },
    { id: "CU", title: "COPPER (COMEX)", price: 6.08, unit: "$/LB", trend: "+", change: 1.37 },
    { id: "CC", title: "COCOA (ICE)", price: 8546, unit: "$/MT", trend: "+", change: 0.95 },
    { id: "BR", title: "BRENT CRUDE", price: 94.41, unit: "$/BBL", trend: "+", change: 1.31 },
    { id: "PT", title: "PLATINUM", price: 934, unit: "$/OZ", trend: "+", change: 0.71 },
    { id: "UR", title: "URANIUM (U3O8)", price: 97.99, unit: "$/LB", trend: "+", change: 1.69 },
    { id: "PD", title: "PALLADIUM", price: 1059, unit: "$/OZ", trend: "+", change: 1.25 },
    { id: "NG", title: "NATURAL GAS", price: 2.47, unit: "$/MMBtu", trend: "+", change: 2.9 }
];

export default function ContinentalGoalsTicker() {
    const [commodities, setCommodities] = useState(INITIAL_COMMODITIES);

    // Simulate live market jitter
    useEffect(() => {
        const interval = setInterval(() => {
            setCommodities(prev => prev.map(item => {
                // Random fluctuation between -0.5% and +0.5%
                const fluctuation = 1 + (Math.random() * 0.01 - 0.005);
                const newPrice = item.price * fluctuation;
                const newTrend = newPrice >= item.price ? "+" : "-";
                // Randomly update change percentage slightly
                const newChange = Math.max(0.1, item.change + (Math.random() * 0.4 - 0.2));

                return {
                    ...item,
                    price: newPrice,
                    trend: newTrend,
                    change: newChange
                };
            }));
        }, 3000); // jitter every 3 seconds

        return () => clearInterval(interval);
    }, []);

    return (
        <footer className="h-10 border-t-[1.5px] border-cobalt/40 bg-black/5 dark:bg-black/40 flex items-center overflow-hidden shrink-0 font-mono relative group transition-all shadow-[0_-5px_20px_rgba(37,99,235,0.05)]">
            {/* Fixed Title Box on the Left */}
            <div className="absolute left-0 top-0 bottom-0 bg-cobalt text-white text-[10px] font-bold px-4 flex items-center z-10 shadow-[5px_0_15px_rgba(0,0,0,0.5)] whitespace-nowrap">
                LIVE COMMODITIES & STRATEGIC EXPORTS //
            </div>

            {/* Infinite Scrolling Marquee */}
            <div className="flex w-full overflow-hidden relative">
                <div
                    className="flex w-max items-center whitespace-nowrap pl-[320px] animate-ticker group-hover:[animation-play-state:paused] transition-all"
                >
                    {/* We render the list twice for seamless looping */}
                    {[...commodities, ...commodities].map((item, idx) => (
                        <div key={idx} className="flex items-center mx-6 gap-3 text-[10px] group-hover:text-[11px] transition-all duration-300">
                            <span className="text-slate-light/60">[{item.id}]</span>
                            <span className="font-bold text-foreground tracking-wider">{item.title}</span>
                            <span className={`font-bold tabular-nums ${item.trend === '+' ? 'text-green-500' : 'text-red-500'}`}>
                                {item.price >= 1000 ? item.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : item.price.toFixed(2)} {item.unit}
                            </span>
                            <span className={`flex items-center gap-0.5 ${item.trend === '+' ? 'text-green-500' : 'text-red-500'}`}>
                                {item.trend === '+' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {item.change.toFixed(2)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </footer>
    );
}
