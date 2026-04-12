"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
    id: string;
    name: string;
    type: 'mine' | 'refinery' | 'manufacturer' | 'product';
    country?: string;
    mineral?: string;
}

interface GraphLink {
    source: string;
    target: string;
    mineral: string;
    status: 'verified' | 'flagged' | 'unknown';
}

const SUPPLY_CHAIN_DATA = {
    nodes: [
        // Mines
        { id: 'mine-cobalt-drc', name: 'Katanga Mines', type: 'mine' as const, country: 'DRC', mineral: 'Cobalt' },
        { id: 'mine-coltan-drc', name: 'Kivu Coltan', type: 'mine' as const, country: 'DRC', mineral: 'Coltan' },
        { id: 'mine-lithium-zwe', name: 'Bikita Lithium', type: 'mine' as const, country: 'Zimbabwe', mineral: 'Lithium' },
        { id: 'mine-bauxite-gin', name: 'Sangarédi Mine', type: 'mine' as const, country: 'Guinea', mineral: 'Bauxite' },
        { id: 'mine-gold-gha', name: 'Obuasi Gold Mine', type: 'mine' as const, country: 'Ghana', mineral: 'Gold' },
        { id: 'mine-copper-zmb', name: 'Lumwana Copper', type: 'mine' as const, country: 'Zambia', mineral: 'Copper' },
        // Refineries
        { id: 'ref-huayou', name: 'Huayou Cobalt', type: 'refinery' as const, country: 'China' },
        { id: 'ref-umicore', name: 'Umicore', type: 'refinery' as const, country: 'Belgium' },
        { id: 'ref-albemarle', name: 'Albemarle Corp', type: 'refinery' as const, country: 'USA' },
        { id: 'ref-rusal', name: 'RUSAL', type: 'refinery' as const, country: 'Russia' },
        { id: 'ref-fqm', name: 'First Quantum', type: 'refinery' as const, country: 'Canada' },
        // Manufacturers
        { id: 'mfg-catl', name: 'CATL', type: 'manufacturer' as const, country: 'China' },
        { id: 'mfg-panasonic', name: 'Panasonic', type: 'manufacturer' as const, country: 'Japan' },
        { id: 'mfg-samsung', name: 'Samsung SDI', type: 'manufacturer' as const, country: 'South Korea' },
        // End Products
        { id: 'prod-ev', name: 'EV Batteries', type: 'product' as const },
        { id: 'prod-phones', name: 'Smartphones', type: 'product' as const },
        { id: 'prod-aluminum', name: 'Aluminum Products', type: 'product' as const },
    ],
    links: [
        // Cobalt chain
        { source: 'mine-cobalt-drc', target: 'ref-huayou', mineral: 'Cobalt', status: 'flagged' as const },
        { source: 'mine-cobalt-drc', target: 'ref-umicore', mineral: 'Cobalt', status: 'verified' as const },
        { source: 'ref-huayou', target: 'mfg-catl', mineral: 'Cobalt', status: 'flagged' as const },
        { source: 'ref-umicore', target: 'mfg-samsung', mineral: 'Cobalt', status: 'verified' as const },
        { source: 'mfg-catl', target: 'prod-ev', mineral: 'Cobalt', status: 'flagged' as const },
        { source: 'mfg-samsung', target: 'prod-phones', mineral: 'Cobalt', status: 'verified' as const },
        // Coltan chain
        { source: 'mine-coltan-drc', target: 'ref-huayou', mineral: 'Coltan', status: 'flagged' as const },
        { source: 'ref-huayou', target: 'mfg-panasonic', mineral: 'Coltan', status: 'unknown' as const },
        { source: 'mfg-panasonic', target: 'prod-phones', mineral: 'Coltan', status: 'unknown' as const },
        // Lithium chain
        { source: 'mine-lithium-zwe', target: 'ref-albemarle', mineral: 'Lithium', status: 'verified' as const },
        { source: 'ref-albemarle', target: 'mfg-panasonic', mineral: 'Lithium', status: 'verified' as const },
        { source: 'mfg-panasonic', target: 'prod-ev', mineral: 'Lithium', status: 'verified' as const },
        // Bauxite chain
        { source: 'mine-bauxite-gin', target: 'ref-rusal', mineral: 'Bauxite', status: 'verified' as const },
        { source: 'ref-rusal', target: 'prod-aluminum', mineral: 'Bauxite', status: 'verified' as const },
        // Copper chain
        { source: 'mine-copper-zmb', target: 'ref-fqm', mineral: 'Copper', status: 'verified' as const },
        { source: 'ref-fqm', target: 'mfg-catl', mineral: 'Copper', status: 'verified' as const },
    ],
};

const NODE_COLORS: Record<string, string> = {
    mine: '#ef4444',
    refinery: '#f59e0b',
    manufacturer: '#2563eb',
    product: '#22c55e',
};

export default function SupplyChainGraph() {
    const [selectedMineral, setSelectedMineral] = useState<string>('all');
    const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: Math.max(300, containerRef.current.offsetHeight - 80),
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const filteredData = {
        nodes: selectedMineral === 'all'
            ? SUPPLY_CHAIN_DATA.nodes
            : SUPPLY_CHAIN_DATA.nodes.filter(n => {
                if (n.type === 'product' || n.type === 'manufacturer') return true;
                const relatedLinks = SUPPLY_CHAIN_DATA.links.filter(
                    l => (l.source === n.id || l.target === n.id) && l.mineral === selectedMineral
                );
                return relatedLinks.length > 0;
            }),
        links: selectedMineral === 'all'
            ? SUPPLY_CHAIN_DATA.links
            : SUPPLY_CHAIN_DATA.links.filter(l => l.mineral === selectedMineral),
    };

    const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
        const size = node.type === 'mine' ? 6 : node.type === 'product' ? 8 : 5;
        const color = NODE_COLORS[node.type] || '#71717a';

        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}20`;
        ctx.fill();

        // Node
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}80`;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.font = 'bold 3.5px monospace';
        ctx.fillStyle = '#e4e4e7';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + size + 6);

        if (node.country) {
            ctx.font = '2.5px monospace';
            ctx.fillStyle = '#71717a';
            ctx.fillText(node.country, node.x, node.y + size + 10);
        }
    }, []);

    const linkColor = useCallback((link: any) => {
        return link.status === 'flagged' ? '#ef444480' : link.status === 'verified' ? '#22c55e60' : '#71717a40';
    }, []);

    const minerals = ['all', ...Array.from(new Set(SUPPLY_CHAIN_DATA.links.map(l => l.mineral)))];

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
                <div>
                    <h3 className="text-sm font-bold tracking-widest uppercase">SUPPLY CHAIN TRACING</h3>
                    <p className="text-[9px] font-mono text-slate-light mt-0.5">CONFLICT MINERAL FLOWS — MINE → REFINERY → PRODUCT</p>
                </div>
                <div className="flex items-center gap-2">
                    {minerals.map(m => (
                        <button
                            key={m}
                            onClick={() => setSelectedMineral(m)}
                            className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-colors ${
                                selectedMineral === m
                                    ? 'bg-cobalt/20 border-cobalt/50 text-cobalt'
                                    : 'bg-white/5 border-white/10 text-slate-light hover:bg-white/10'
                            }`}
                        >
                            {m.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 relative bg-black/20">
                <ForceGraph2D
                    graphData={filteredData}
                    width={dimensions.width}
                    height={dimensions.height}
                    backgroundColor="transparent"
                    nodeCanvasObject={nodeCanvasObject}
                    linkColor={linkColor}
                    linkWidth={(link: any) => link.status === 'flagged' ? 2 : 1}
                    linkLineDash={(link: any) => link.status === 'flagged' ? [4, 2] : link.status === 'unknown' ? [2, 2] : []}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={0.8}
                    cooldownTicks={50}
                    d3AlphaDecay={0.05}
                    d3VelocityDecay={0.3}
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                />
            </div>

            <div className="px-4 py-2 border-t border-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 text-[8px] font-mono">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> MINE</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> REFINERY</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> MFG</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> PRODUCT</span>
                </div>
                <div className="flex items-center gap-4 text-[8px] font-mono text-slate-light">
                    <span>━━ VERIFIED</span>
                    <span className="text-red-400">╍╍ FLAGGED</span>
                    <span>┄┄ UNKNOWN</span>
                </div>
            </div>
        </div>
    );
}
