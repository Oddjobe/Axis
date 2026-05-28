"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

type NodeKind = 'mine' | 'refinery' | 'manufacturer' | 'product';
type LinkStatus = 'verified' | 'flagged' | 'unknown';

interface GraphNode {
    id: string;
    name: string;
    type: NodeKind;
    country?: string;
    mineral?: string;
    x?: number;
    y?: number;
}

interface GraphLink {
    source: string;
    target: string;
    mineral: string;
    status: LinkStatus;
}

const SUPPLY_CHAIN_DATA: { nodes: GraphNode[]; links: GraphLink[] } = {
    nodes: [
        // Mines
        { id: 'mine-cobalt-drc', name: 'Katanga Mines', type: 'mine', country: 'DRC', mineral: 'Cobalt' },
        { id: 'mine-coltan-drc', name: 'Kivu Coltan', type: 'mine', country: 'DRC', mineral: 'Coltan' },
        { id: 'mine-lithium-zwe', name: 'Bikita Lithium', type: 'mine', country: 'Zimbabwe', mineral: 'Lithium' },
        { id: 'mine-bauxite-gin', name: 'Sangarédi Mine', type: 'mine', country: 'Guinea', mineral: 'Bauxite' },
        { id: 'mine-gold-gha', name: 'Obuasi Gold Mine', type: 'mine', country: 'Ghana', mineral: 'Gold' },
        { id: 'mine-copper-zmb', name: 'Lumwana Copper', type: 'mine', country: 'Zambia', mineral: 'Copper' },
        { id: 'mine-graphite-moz', name: 'Balama Graphite', type: 'mine', country: 'Mozambique', mineral: 'Graphite' },
        { id: 'mine-manganese-zaf', name: 'Kalahari Manganese', type: 'mine', country: 'South Africa', mineral: 'Manganese' },
        { id: 'mine-diamond-bwa', name: 'Jwaneng Mine', type: 'mine', country: 'Botswana', mineral: 'Diamonds' },
        // Refineries
        { id: 'ref-huayou', name: 'Huayou Cobalt', type: 'refinery', country: 'China' },
        { id: 'ref-umicore', name: 'Umicore', type: 'refinery', country: 'Belgium' },
        { id: 'ref-albemarle', name: 'Albemarle Corp', type: 'refinery', country: 'USA' },
        { id: 'ref-rusal', name: 'RUSAL', type: 'refinery', country: 'Russia' },
        { id: 'ref-fqm', name: 'First Quantum', type: 'refinery', country: 'Canada' },
        { id: 'ref-posco', name: 'POSCO', type: 'refinery', country: 'South Korea' },
        { id: 'ref-eramet', name: 'Eramet', type: 'refinery', country: 'France' },
        { id: 'ref-debeers', name: 'De Beers', type: 'refinery', country: 'Botswana' },
        // Manufacturers
        { id: 'mfg-catl', name: 'CATL', type: 'manufacturer', country: 'China' },
        { id: 'mfg-panasonic', name: 'Panasonic', type: 'manufacturer', country: 'Japan' },
        { id: 'mfg-samsung', name: 'Samsung SDI', type: 'manufacturer', country: 'South Korea' },
        { id: 'mfg-tsmc', name: 'TSMC', type: 'manufacturer', country: 'Taiwan' },
        // End Products
        { id: 'prod-ev', name: 'EV Batteries', type: 'product' },
        { id: 'prod-phones', name: 'Smartphones', type: 'product' },
        { id: 'prod-aluminum', name: 'Aluminum Products', type: 'product' },
        { id: 'prod-semis', name: 'Semiconductors', type: 'product' },
        { id: 'prod-tooling', name: 'Industrial Tooling', type: 'product' },
    ],
    links: [
        // Cobalt chain
        { source: 'mine-cobalt-drc', target: 'ref-huayou', mineral: 'Cobalt', status: 'flagged' },
        { source: 'mine-cobalt-drc', target: 'ref-umicore', mineral: 'Cobalt', status: 'verified' },
        { source: 'ref-huayou', target: 'mfg-catl', mineral: 'Cobalt', status: 'flagged' },
        { source: 'ref-umicore', target: 'mfg-samsung', mineral: 'Cobalt', status: 'verified' },
        { source: 'mfg-catl', target: 'prod-ev', mineral: 'Cobalt', status: 'flagged' },
        { source: 'mfg-samsung', target: 'prod-phones', mineral: 'Cobalt', status: 'verified' },
        // Coltan / Tantalum chain
        { source: 'mine-coltan-drc', target: 'ref-huayou', mineral: 'Coltan', status: 'flagged' },
        { source: 'ref-huayou', target: 'mfg-panasonic', mineral: 'Coltan', status: 'unknown' },
        { source: 'mfg-panasonic', target: 'prod-phones', mineral: 'Coltan', status: 'unknown' },
        { source: 'ref-huayou', target: 'mfg-tsmc', mineral: 'Coltan', status: 'unknown' },
        { source: 'mfg-tsmc', target: 'prod-semis', mineral: 'Coltan', status: 'verified' },
        // Lithium chain
        { source: 'mine-lithium-zwe', target: 'ref-albemarle', mineral: 'Lithium', status: 'verified' },
        { source: 'ref-albemarle', target: 'mfg-panasonic', mineral: 'Lithium', status: 'verified' },
        { source: 'mfg-panasonic', target: 'prod-ev', mineral: 'Lithium', status: 'verified' },
        // Bauxite chain
        { source: 'mine-bauxite-gin', target: 'ref-rusal', mineral: 'Bauxite', status: 'verified' },
        { source: 'ref-rusal', target: 'prod-aluminum', mineral: 'Bauxite', status: 'verified' },
        // Copper chain
        { source: 'mine-copper-zmb', target: 'ref-fqm', mineral: 'Copper', status: 'verified' },
        { source: 'ref-fqm', target: 'mfg-catl', mineral: 'Copper', status: 'verified' },
        // Graphite chain
        { source: 'mine-graphite-moz', target: 'ref-posco', mineral: 'Graphite', status: 'verified' },
        { source: 'ref-posco', target: 'mfg-catl', mineral: 'Graphite', status: 'verified' },
        { source: 'mfg-catl', target: 'prod-ev', mineral: 'Graphite', status: 'verified' },
        // Manganese chain
        { source: 'mine-manganese-zaf', target: 'ref-eramet', mineral: 'Manganese', status: 'verified' },
        { source: 'ref-eramet', target: 'mfg-samsung', mineral: 'Manganese', status: 'verified' },
        // Diamonds chain
        { source: 'mine-diamond-bwa', target: 'ref-debeers', mineral: 'Diamonds', status: 'verified' },
        { source: 'ref-debeers', target: 'prod-tooling', mineral: 'Diamonds', status: 'verified' },
    ],
};

const NODE_COLORS: Record<NodeKind, string> = {
    mine: '#ef4444',
    refinery: '#f59e0b',
    manufacturer: '#2563eb',
    product: '#22c55e',
};

const TYPE_LABEL: Record<NodeKind, string> = {
    mine: 'Extraction Site',
    refinery: 'Refiner / Processor',
    manufacturer: 'Manufacturer',
    product: 'End Product',
};

const STATUS_FILTERS: (LinkStatus | 'all')[] = ['all', 'verified', 'flagged', 'unknown'];

export default function SupplyChainGraph() {
    const { theme } = useTheme();
    const isDark = theme === 'dark' || theme === 'system' || !theme;

    const [selectedMineral, setSelectedMineral] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<LinkStatus | 'all'>('all');
    const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
    const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: Math.max(300, containerRef.current.offsetHeight - 120),
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Filter links by mineral AND status, then keep only the nodes they reference.
    const filteredData = useMemo(() => {
        const links = SUPPLY_CHAIN_DATA.links.filter(l =>
            (selectedMineral === 'all' || l.mineral === selectedMineral) &&
            (statusFilter === 'all' || l.status === statusFilter)
        );
        const ids = new Set<string>();
        links.forEach(l => { ids.add(l.source); ids.add(l.target); });
        const nodes = SUPPLY_CHAIN_DATA.nodes.filter(n => ids.has(n.id));
        return { nodes: nodes.map(n => ({ ...n })), links: links.map(l => ({ ...l })) };
    }, [selectedMineral, statusFilter]);

    const focusNode = hoverNode || selectedNode;

    const summary = useMemo(() => {
        const flagged = filteredData.links.filter(l => l.status === 'flagged').length;
        const mines = filteredData.nodes.filter(n => n.type === 'mine').length;
        return { flows: filteredData.links.length, flagged, mines };
    }, [filteredData]);

    const isConnected = useCallback((nodeId: string) => {
        if (!focusNode) return false;
        return filteredData.links.some(l => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
            return (s === focusNode.id && t === nodeId) || (t === focusNode.id && s === nodeId);
        });
    }, [focusNode, filteredData.links]);

    const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
        const size = node.type === 'mine' ? 6 : node.type === 'product' ? 8 : 5;
        const color = NODE_COLORS[node.type as NodeKind] || '#71717a';
        const focused = focusNode?.id === node.id;
        const connected = isConnected(node.id);
        const faded = focusNode && !focused && !connected;

        ctx.globalAlpha = faded ? 0.15 : 1;

        // Glow / selection ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + (focused ? 4 : 3), 0, 2 * Math.PI);
        ctx.fillStyle = `${color}20`;
        ctx.fill();
        if (selectedNode?.id === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.7)';
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Node
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}${focused || connected ? 'cc' : '80'}`;
        ctx.strokeStyle = color;
        ctx.lineWidth = focused ? 2 : 1.5;
        ctx.fill();
        ctx.stroke();

        // Label (theme-aware so it stays readable in light mode)
        ctx.font = 'bold 3.5px monospace';
        ctx.fillStyle = isDark ? '#e4e4e7' : '#1e293b';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + size + 6);

        if (node.country) {
            ctx.font = '2.5px monospace';
            ctx.fillStyle = isDark ? '#71717a' : '#64748b';
            ctx.fillText(node.country, node.x, node.y + size + 10);
        }
        ctx.globalAlpha = 1;
    }, [focusNode, selectedNode, isConnected, isDark]);

    const linkColor = useCallback((link: any) => {
        const base = link.status === 'flagged' ? '#ef4444' : link.status === 'verified' ? '#22c55e' : '#71717a';
        if (focusNode) {
            const s = typeof link.source === 'string' ? link.source : link.source.id;
            const t = typeof link.target === 'string' ? link.target : link.target.id;
            const touches = s === focusNode.id || t === focusNode.id;
            return `${base}${touches ? 'cc' : '14'}`;
        }
        return `${base}${link.status === 'flagged' ? '80' : link.status === 'verified' ? '60' : '40'}`;
    }, [focusNode]);

    const handleNodeClick = useCallback((node: any) => {
        setSelectedNode(prev => (prev && prev.id === node.id) ? null : node);
        if (fgRef.current && Number.isFinite(node.x) && Number.isFinite(node.y)) {
            fgRef.current.centerAt(node.x, node.y, 400);
        }
    }, []);

    const minerals = ['all', ...Array.from(new Set(SUPPLY_CHAIN_DATA.links.map(l => l.mineral)))];
    const hasFilter = selectedMineral !== 'all' || statusFilter !== 'all' || selectedNode !== null;
    const cardNode = focusNode;

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
                <div>
                    <h3 className="text-sm font-bold tracking-widest uppercase">SUPPLY CHAIN TRACING</h3>
                    <p className="text-[9px] font-mono text-slate-light mt-0.5">CONFLICT MINERAL FLOWS — MINE → REFINERY → PRODUCT</p>
                </div>
                <div className="flex items-center gap-3 text-[9px] font-mono text-slate-light">
                    <span><span className="text-foreground font-bold">{summary.flows}</span> flows</span>
                    <span><span className="text-red-400 font-bold">{summary.flagged}</span> flagged</span>
                    <span><span className="text-foreground font-bold">{summary.mines}</span> mines</span>
                    {hasFilter && (
                        <button
                            onClick={() => { setSelectedMineral('all'); setStatusFilter('all'); setSelectedNode(null); }}
                            className="px-2 py-0.5 rounded-full border border-border text-foreground/80 hover:bg-foreground/10 transition-colors"
                        >
                            Clear ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Mineral + status filter chips */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {minerals.map(m => (
                        <button
                            key={m}
                            onClick={() => { setSelectedMineral(m); setSelectedNode(null); }}
                            className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-colors ${
                                selectedMineral === m ? 'bg-cobalt/20 border-cobalt/50 text-cobalt' : 'border-border text-slate-light hover:text-foreground'
                            }`}
                        >
                            {m.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    {STATUS_FILTERS.map(s => (
                        <button
                            key={s}
                            onClick={() => { setStatusFilter(s); setSelectedNode(null); }}
                            className={`text-[8px] font-mono font-bold px-2 py-1 rounded border transition-colors ${
                                statusFilter === s
                                    ? (s === 'flagged' ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                        : s === 'verified' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                                        : 'bg-cobalt/20 border-cobalt/50 text-cobalt')
                                    : 'border-border text-slate-light hover:text-foreground'
                            }`}
                        >
                            {s.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 relative bg-black/20">
                <ForceGraph2D
                    ref={fgRef}
                    graphData={filteredData}
                    width={dimensions.width}
                    height={dimensions.height}
                    backgroundColor="transparent"
                    nodeCanvasObject={nodeCanvasObject}
                    linkColor={linkColor}
                    linkWidth={(link: any) => {
                        const touches = focusNode && ((typeof link.source === 'string' ? link.source : link.source.id) === focusNode.id || (typeof link.target === 'string' ? link.target : link.target.id) === focusNode.id);
                        return touches ? 3 : link.status === 'flagged' ? 2 : 1;
                    }}
                    linkLineDash={(link: any) => link.status === 'flagged' ? [4, 2] : link.status === 'unknown' ? [2, 2] : []}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={0.8}
                    linkDirectionalParticles={(link: any) => {
                        const touches = focusNode && ((typeof link.source === 'string' ? link.source : link.source.id) === focusNode.id || (typeof link.target === 'string' ? link.target : link.target.id) === focusNode.id);
                        return touches ? 4 : 0;
                    }}
                    linkDirectionalParticleWidth={2}
                    cooldownTicks={50}
                    d3AlphaDecay={0.05}
                    d3VelocityDecay={0.3}
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                    onNodeHover={(node: any) => {
                        setHoverNode(node || null);
                        if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
                    }}
                    onNodeClick={handleNodeClick}
                    onBackgroundClick={() => setSelectedNode(null)}
                />

                {/* Node detail card */}
                {cardNode && (
                    <div className={`absolute bottom-3 right-3 w-60 border p-3 rounded-xl shadow-2xl backdrop-blur-xl pointer-events-none z-20 ${
                        isDark ? 'bg-zinc-900/95 border-zinc-700/80' : 'bg-slate-100/95 border-zinc-300'
                    }`}>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS[cardNode.type] }} />
                            <h4 className={`text-xs font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>{cardNode.name}</h4>
                        </div>
                        <p className="text-[8px] font-mono uppercase tracking-widest text-slate-light mb-1">{TYPE_LABEL[cardNode.type]}</p>
                        {cardNode.country && <p className="text-[10px] font-mono text-slate-light">Jurisdiction: <span className={isDark ? 'text-white' : 'text-zinc-900'}>{cardNode.country}</span></p>}
                        {cardNode.mineral && <p className="text-[10px] font-mono text-slate-light">Mineral: <span className="text-amber-500">{cardNode.mineral}</span></p>}
                        {selectedNode && !hoverNode && (
                            <p className="mt-1.5 pt-1.5 border-t border-border text-[8px] font-mono uppercase tracking-widest text-amber-500/90">◉ Pinned — click canvas to release</p>
                        )}
                    </div>
                )}
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
