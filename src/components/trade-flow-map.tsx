"use client"

import { useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { TRADE_CATEGORIES, type TradeCategory } from '@/lib/trade-categories';

type Trend = 'up' | 'down' | 'stable';
type Category = TradeCategory;

interface TradeRoute {
    from: { code: string; name: string; x: number; y: number };
    to: { code: string; name: string; x: number; y: number };
    commodity: string;
    category: Category;
    volumeUSD: string;
    volumeM: number; // normalized volume in USD millions for summaries
    trend: Trend;
}

// Approximate positions (normalized 0-100 for SVG viewBox)
const COUNTRY_POS: Record<string, { x: number; y: number; name: string }> = {
    NGA: { x: 34, y: 42, name: 'Nigeria' },
    ZAF: { x: 55, y: 88, name: 'South Africa' },
    KEN: { x: 72, y: 52, name: 'Kenya' },
    EGY: { x: 58, y: 15, name: 'Egypt' },
    GHA: { x: 28, y: 45, name: 'Ghana' },
    ETH: { x: 72, y: 40, name: 'Ethiopia' },
    TZA: { x: 68, y: 60, name: 'Tanzania' },
    CIV: { x: 24, y: 46, name: "Côte d'Ivoire" },
    COD: { x: 55, y: 55, name: 'DR Congo' },
    MAR: { x: 26, y: 14, name: 'Morocco' },
    AGO: { x: 44, y: 65, name: 'Angola' },
    SEN: { x: 14, y: 35, name: 'Senegal' },
    CMR: { x: 42, y: 48, name: 'Cameroon' },
    MOZ: { x: 68, y: 75, name: 'Mozambique' },
    RWA: { x: 62, y: 53, name: 'Rwanda' },
    ZMB: { x: 56, y: 66, name: 'Zambia' },
    BWA: { x: 54, y: 78, name: 'Botswana' },
    NAM: { x: 47, y: 80, name: 'Namibia' },
    DZA: { x: 40, y: 12, name: 'Algeria' },
};

const r = (
    fromCode: string, toCode: string, commodity: string, category: Category,
    volumeUSD: string, volumeM: number, trend: Trend
): TradeRoute => ({
    from: { ...COUNTRY_POS[fromCode], code: fromCode },
    to: { ...COUNTRY_POS[toCode], code: toCode },
    commodity, category, volumeUSD, volumeM, trend,
});

const TRADE_ROUTES: TradeRoute[] = [
    r('NGA', 'GHA', 'Petroleum & Gas', 'Energy', '$2.4B', 2400, 'up'),
    r('ZAF', 'MOZ', 'Machinery & Vehicles', 'Manufactured', '$1.8B', 1800, 'stable'),
    r('KEN', 'TZA', 'Manufactured Goods', 'Manufactured', '$890M', 890, 'up'),
    r('EGY', 'KEN', 'Fertilizers & Chemicals', 'Chemicals', '$1.2B', 1200, 'up'),
    r('CIV', 'SEN', 'Cocoa & Food Products', 'Agriculture', '$640M', 640, 'stable'),
    r('COD', 'ZAF', 'Cobalt & Minerals', 'Minerals', '$3.1B', 3100, 'up'),
    r('ETH', 'KEN', 'Coffee & Agricultural', 'Agriculture', '$520M', 520, 'down'),
    r('MAR', 'NGA', 'Phosphates & Textiles', 'Chemicals', '$780M', 780, 'stable'),
    r('AGO', 'ZAF', 'Crude Oil', 'Energy', '$2.1B', 2100, 'down'),
    r('RWA', 'COD', 'Electronics & Services', 'Services', '$340M', 340, 'up'),
    r('NGA', 'CMR', 'Cement & Construction', 'Manufactured', '$450M', 450, 'up'),
    r('ZAF', 'KEN', 'Financial Services & Tech', 'Services', '$1.5B', 1500, 'up'),
    // Expanded mineral & energy corridors
    r('COD', 'KEN', 'Coltan & Tantalum', 'Minerals', '$1.4B', 1400, 'up'),
    r('ZMB', 'ZAF', 'Copper Cathodes', 'Minerals', '$2.8B', 2800, 'up'),
    r('BWA', 'ZAF', 'Diamonds', 'Minerals', '$1.1B', 1100, 'stable'),
    r('NAM', 'ZAF', 'Zinc & Uranium', 'Minerals', '$620M', 620, 'up'),
    r('DZA', 'EGY', 'Natural Gas', 'Energy', '$1.9B', 1900, 'stable'),
    r('GHA', 'NGA', 'Gold & Bauxite', 'Minerals', '$700M', 700, 'up'),
];

const CATEGORIES: Category[] = [...TRADE_CATEGORIES];
const TREND_COLOR: Record<Trend, string> = { up: '#22c55e', down: '#ef4444', stable: '#f59e0b' };

const fmtVolume = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m}M`);

export default function TradeFlowMap({ initialCategory }: { initialCategory?: TradeCategory | null }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark' || theme === 'system' || !theme;

    const [hoveredRoute, setHoveredRoute] = useState<number | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; route: TradeRoute } | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>(initialCategory ?? 'all');
    const [trendFilter, setTrendFilter] = useState<Set<Trend>>(new Set());

    // A route passes the filter if it matches the category and (no trend filter or matching trend)
    const isVisible = (route: TradeRoute) =>
        (categoryFilter === 'all' || route.category === categoryFilter) &&
        (trendFilter.size === 0 || trendFilter.has(route.trend));

    const visibleIndices = useMemo(
        () => TRADE_ROUTES.map((rt, i) => (isVisible(rt) ? i : -1)).filter(i => i >= 0),
        [categoryFilter, trendFilter]
    );

    const focusIdx = hoveredRoute ?? selectedRoute;

    const summary = useMemo(() => {
        const routes = visibleIndices.map(i => TRADE_ROUTES[i]);
        const total = routes.reduce((s, rt) => s + rt.volumeM, 0);
        const codes = new Set<string>();
        routes.forEach(rt => { codes.add(rt.from.code); codes.add(rt.to.code); });
        return { count: routes.length, total, partners: codes.size };
    }, [visibleIndices]);

    const toggleTrend = (t: Trend) => {
        setSelectedRoute(null);
        setTrendFilter(prev => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t); else next.add(t);
            return next;
        });
    };

    const clearAll = () => {
        setCategoryFilter('all');
        setTrendFilter(new Set());
        setSelectedRoute(null);
    };

    const labelColor = isDark ? '#a1a1aa' : '#475569';
    const nodeColor = isDark ? '#3b82f6' : '#2563eb';
    const hasFilter = categoryFilter !== 'all' || trendFilter.size > 0 || selectedRoute !== null;

    // Codes that are part of any visible route, for dimming unused nodes
    const activeCodes = useMemo(() => {
        const s = new Set<string>();
        visibleIndices.forEach(i => { s.add(TRADE_ROUTES[i].from.code); s.add(TRADE_ROUTES[i].to.code); });
        return s;
    }, [visibleIndices]);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap">
                <div>
                    <h3 className="text-sm font-bold tracking-widest uppercase">AfCFTA TRADE CORRIDORS</h3>
                    <p className="text-[9px] font-mono text-slate-light mt-0.5">INTRA-AFRICAN COMMODITY FLOWS — MOCK DATA</p>
                </div>
                <div className="flex items-center gap-3 text-[8px] font-mono">
                    {(['up', 'stable', 'down'] as Trend[]).map(t => {
                        const active = trendFilter.has(t);
                        return (
                            <button
                                key={t}
                                onClick={() => toggleTrend(t)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                                    active ? 'border-foreground/50 bg-foreground/10 text-foreground' : 'border-transparent text-slate-light hover:text-foreground'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TREND_COLOR[t] }} />
                                {t.toUpperCase()}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Category filter chips + summary */}
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => { setCategoryFilter('all'); setSelectedRoute(null); }}
                        className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-colors ${
                            categoryFilter === 'all' ? 'bg-cobalt/20 border-cobalt/50 text-cobalt' : 'border-border text-slate-light hover:text-foreground'
                        }`}
                    >
                        ALL
                    </button>
                    {CATEGORIES.map(c => (
                        <button
                            key={c}
                            onClick={() => { setCategoryFilter(prev => prev === c ? 'all' : c); setSelectedRoute(null); }}
                            className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-colors ${
                                categoryFilter === c ? 'bg-cobalt/20 border-cobalt/50 text-cobalt' : 'border-border text-slate-light hover:text-foreground'
                            }`}
                        >
                            {c.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-[9px] font-mono text-slate-light">
                    <span><span className="text-foreground font-bold">{summary.count}</span> routes</span>
                    <span><span className="text-emerald-500 font-bold">{fmtVolume(summary.total)}</span> volume</span>
                    <span><span className="text-foreground font-bold">{summary.partners}</span> partners</span>
                    {hasFilter && (
                        <button onClick={clearAll} className="px-2 py-0.5 rounded-full border border-border text-foreground/80 hover:bg-foreground/10 transition-colors">
                            Clear ✕
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 relative p-4">
                <svg viewBox="0 0 100 100" className="w-full h-full" style={{ maxHeight: '500px' }}>
                    {/* Animated route lines */}
                    {TRADE_ROUTES.map((route, i) => {
                        const visible = isVisible(route);
                        const isFocused = focusIdx === i;
                        const isPinned = selectedRoute === i;
                        const color = TREND_COLOR[route.trend];
                        const dimmed = !visible || (focusIdx !== null && !isFocused);
                        return (
                            <g key={i} style={{ opacity: dimmed ? 0.1 : 1, transition: 'opacity 0.3s' }}>
                                <line
                                    x1={route.from.x} y1={route.from.y}
                                    x2={route.to.x} y2={route.to.y}
                                    stroke={color}
                                    strokeWidth={isFocused ? 0.9 : 0.35}
                                    strokeDasharray="2 1.5"
                                    opacity={0.7}
                                    style={{ transition: 'all 0.3s' }}
                                >
                                    <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="3s" repeatCount="indefinite" />
                                </line>
                                {isPinned && (
                                    <line
                                        x1={route.from.x} y1={route.from.y}
                                        x2={route.to.x} y2={route.to.y}
                                        stroke={color} strokeWidth={1.4} opacity={0.25}
                                    />
                                )}
                                {/* Invisible wider line for hover/click target */}
                                {visible && (
                                    <line
                                        x1={route.from.x} y1={route.from.y}
                                        x2={route.to.x} y2={route.to.y}
                                        stroke="transparent"
                                        strokeWidth={3}
                                        onMouseEnter={(e) => {
                                            setHoveredRoute(i);
                                            const svg = e.currentTarget.closest('svg');
                                            if (svg) {
                                                const rect = svg.getBoundingClientRect();
                                                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, route });
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            const svg = e.currentTarget.closest('svg');
                                            if (svg) {
                                                const rect = svg.getBoundingClientRect();
                                                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, route });
                                            }
                                        }}
                                        onMouseLeave={() => { setHoveredRoute(null); if (selectedRoute === null) setTooltip(null); }}
                                        onClick={() => {
                                            setSelectedRoute(prev => (prev === i ? null : i));
                                            setTooltip({ x: (route.from.x + route.to.x) / 2, y: (route.from.y + route.to.y) / 2, route });
                                        }}
                                        className="cursor-pointer"
                                    />
                                )}
                            </g>
                        );
                    })}

                    {/* Country nodes */}
                    {Object.entries(COUNTRY_POS).map(([code, pos]) => {
                        const dim = activeCodes.size > 0 && !activeCodes.has(code);
                        return (
                            <g key={code} style={{ opacity: dim ? 0.25 : 1, transition: 'opacity 0.3s' }}>
                                <circle cx={pos.x} cy={pos.y} r={1.8} fill={nodeColor} fillOpacity={0.3} stroke={nodeColor} strokeWidth={0.3} />
                                <circle cx={pos.x} cy={pos.y} r={0.8} fill={nodeColor} />
                                <text x={pos.x} y={pos.y - 3} textAnchor="middle" fill={labelColor} fontSize="2.2" fontFamily="monospace" fontWeight="bold">
                                    {code}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {/* Tooltip (sticky when a route is pinned) */}
                {(tooltip && (hoveredRoute !== null || selectedRoute !== null)) && (
                    <div
                        className={`absolute pointer-events-none rounded-lg p-3 z-50 backdrop-blur-md border ${
                            isDark ? 'bg-black/90 border-cobalt/30' : 'bg-white/95 border-cobalt/40 shadow-xl'
                        }`}
                        style={{ left: Math.min(tooltip.x + 10, 320), top: Math.max(tooltip.y - 10, 0), minWidth: '190px' }}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[9px] font-mono text-cobalt font-bold tracking-wider">
                                {tooltip.route.from.code} → {tooltip.route.to.code}
                            </div>
                            {selectedRoute !== null && hoveredRoute === null && (
                                <span className="text-[7px] font-mono uppercase text-amber-500">◉ pinned</span>
                            )}
                        </div>
                        <div className="text-[10px] font-bold text-foreground">{tooltip.route.commodity}</div>
                        <div className="text-[8px] font-mono text-slate-light uppercase">{tooltip.route.category}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold font-mono text-emerald-500">{tooltip.route.volumeUSD}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                tooltip.route.trend === 'up' ? 'bg-emerald-500/20 text-emerald-500' :
                                tooltip.route.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                                'bg-amber-500/20 text-amber-500'
                            }`}>
                                {tooltip.route.trend === 'up' ? '↑' : tooltip.route.trend === 'down' ? '↓' : '→'} {tooltip.route.trend.toUpperCase()}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="px-4 py-2 border-t border-border text-[8px] font-mono text-slate-light text-center">
                DATA SOURCE: AfCFTA SECRETARIAT / UNCTAD ESTIMATES — HOVER TO PREVIEW · CLICK A ROUTE TO PIN
            </div>
        </div>
    );
}
