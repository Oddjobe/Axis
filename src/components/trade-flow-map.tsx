"use client"

import { useState } from 'react';

interface TradeRoute {
    from: { code: string; name: string; x: number; y: number };
    to: { code: string; name: string; x: number; y: number };
    commodity: string;
    volumeUSD: string;
    trend: 'up' | 'down' | 'stable';
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
};

const TRADE_ROUTES: TradeRoute[] = [
    { from: { ...COUNTRY_POS.NGA, code: 'NGA' }, to: { ...COUNTRY_POS.GHA, code: 'GHA' }, commodity: 'Petroleum & Gas', volumeUSD: '$2.4B', trend: 'up' },
    { from: { ...COUNTRY_POS.ZAF, code: 'ZAF' }, to: { ...COUNTRY_POS.MOZ, code: 'MOZ' }, commodity: 'Machinery & Vehicles', volumeUSD: '$1.8B', trend: 'stable' },
    { from: { ...COUNTRY_POS.KEN, code: 'KEN' }, to: { ...COUNTRY_POS.TZA, code: 'TZA' }, commodity: 'Manufactured Goods', volumeUSD: '$890M', trend: 'up' },
    { from: { ...COUNTRY_POS.EGY, code: 'EGY' }, to: { ...COUNTRY_POS.KEN, code: 'KEN' }, commodity: 'Fertilizers & Chemicals', volumeUSD: '$1.2B', trend: 'up' },
    { from: { ...COUNTRY_POS.CIV, code: 'CIV' }, to: { ...COUNTRY_POS.SEN, code: 'SEN' }, commodity: 'Cocoa & Food Products', volumeUSD: '$640M', trend: 'stable' },
    { from: { ...COUNTRY_POS.COD, code: 'COD' }, to: { ...COUNTRY_POS.ZAF, code: 'ZAF' }, commodity: 'Cobalt & Minerals', volumeUSD: '$3.1B', trend: 'up' },
    { from: { ...COUNTRY_POS.ETH, code: 'ETH' }, to: { ...COUNTRY_POS.KEN, code: 'KEN' }, commodity: 'Coffee & Agricultural', volumeUSD: '$520M', trend: 'down' },
    { from: { ...COUNTRY_POS.MAR, code: 'MAR' }, to: { ...COUNTRY_POS.NGA, code: 'NGA' }, commodity: 'Phosphates & Textiles', volumeUSD: '$780M', trend: 'stable' },
    { from: { ...COUNTRY_POS.AGO, code: 'AGO' }, to: { ...COUNTRY_POS.ZAF, code: 'ZAF' }, commodity: 'Crude Oil', volumeUSD: '$2.1B', trend: 'down' },
    { from: { ...COUNTRY_POS.RWA, code: 'RWA' }, to: { ...COUNTRY_POS.COD, code: 'COD' }, commodity: 'Electronics & Services', volumeUSD: '$340M', trend: 'up' },
    { from: { ...COUNTRY_POS.NGA, code: 'NGA' }, to: { ...COUNTRY_POS.CMR, code: 'CMR' }, commodity: 'Cement & Construction', volumeUSD: '$450M', trend: 'up' },
    { from: { ...COUNTRY_POS.ZAF, code: 'ZAF' }, to: { ...COUNTRY_POS.KEN, code: 'KEN' }, commodity: 'Financial Services & Tech', volumeUSD: '$1.5B', trend: 'up' },
];

export default function TradeFlowMap() {
    const [hoveredRoute, setHoveredRoute] = useState<number | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; route: TradeRoute } | null>(null);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                    <h3 className="text-sm font-bold tracking-widest uppercase">AfCFTA TRADE CORRIDORS</h3>
                    <p className="text-[9px] font-mono text-slate-light mt-0.5">INTRA-AFRICAN COMMODITY FLOWS — MOCK DATA</p>
                </div>
                <div className="flex items-center gap-3 text-[8px] font-mono">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> UP</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> STABLE</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> DOWN</span>
                </div>
            </div>

            <div className="flex-1 relative p-4">
                <svg viewBox="0 0 100 100" className="w-full h-full" style={{ maxHeight: '500px' }}>
                    {/* Animated route lines */}
                    {TRADE_ROUTES.map((route, i) => {
                        const isHovered = hoveredRoute === i;
                        const color = route.trend === 'up' ? '#22c55e' : route.trend === 'down' ? '#ef4444' : '#f59e0b';
                        return (
                            <g key={i}>
                                <line
                                    x1={route.from.x} y1={route.from.y}
                                    x2={route.to.x} y2={route.to.y}
                                    stroke={color}
                                    strokeWidth={isHovered ? 0.8 : 0.3}
                                    strokeDasharray="2 1.5"
                                    opacity={hoveredRoute !== null && !isHovered ? 0.15 : 0.6}
                                    style={{ transition: 'all 0.3s' }}
                                >
                                    <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="3s" repeatCount="indefinite" />
                                </line>
                                {/* Invisible wider line for hover target */}
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
                                    onMouseLeave={() => { setHoveredRoute(null); setTooltip(null); }}
                                    className="cursor-pointer"
                                />
                            </g>
                        );
                    })}

                    {/* Country nodes */}
                    {Object.entries(COUNTRY_POS).map(([code, pos]) => (
                        <g key={code}>
                            <circle cx={pos.x} cy={pos.y} r={1.8} fill="#2563eb" fillOpacity={0.3} stroke="#2563eb" strokeWidth={0.3} />
                            <circle cx={pos.x} cy={pos.y} r={0.8} fill="#2563eb" />
                            <text x={pos.x} y={pos.y - 3} textAnchor="middle" fill="#a1a1aa" fontSize="2.2" fontFamily="monospace" fontWeight="bold">
                                {code}
                            </text>
                        </g>
                    ))}
                </svg>

                {/* Tooltip */}
                {tooltip && (
                    <div
                        className="absolute pointer-events-none bg-black/90 border border-cobalt/30 rounded-lg p-3 z-50 backdrop-blur-md"
                        style={{ left: tooltip.x + 10, top: tooltip.y - 10, minWidth: '180px' }}
                    >
                        <div className="text-[9px] font-mono text-cobalt font-bold tracking-wider mb-1">
                            {tooltip.route.from.code} → {tooltip.route.to.code}
                        </div>
                        <div className="text-[10px] font-bold text-foreground">{tooltip.route.commodity}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold font-mono text-emerald-400">{tooltip.route.volumeUSD}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                tooltip.route.trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                                tooltip.route.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                                'bg-amber-500/20 text-amber-400'
                            }`}>
                                {tooltip.route.trend === 'up' ? '↑' : tooltip.route.trend === 'down' ? '↓' : '→'} {tooltip.route.trend.toUpperCase()}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="px-4 py-2 border-t border-border text-[8px] font-mono text-slate-light text-center">
                DATA SOURCE: AfCFTA SECRETARIAT / UNCTAD ESTIMATES — HOVER ROUTES FOR DETAILS
            </div>
        </div>
    );
}
