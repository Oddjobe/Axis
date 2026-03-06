"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from 'next/dynamic';
import { useTheme } from "next-themes";
import { BrainCircuit, Pickaxe, Cpu, Globe } from "lucide-react";
import * as d3 from 'd3-force';
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

// Dynamically import to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

type NodeType = 'country' | 'resource' | 'component' | 'endProduct';

interface GraphNode {
    id: string;
    group: NodeType;
    name: string;
    val: number;
    color?: string;
    desc?: string;
    fx?: number | undefined;
    fy?: number | undefined;
    x?: number;
    y?: number;
    // Column position for hierarchical layout (0-3)
    column: number;
}

interface GraphLink {
    source: string;
    target: string;
    value: number;
    label?: string;
    color?: string;
}

// Column assignments for left-to-right flow
const COLUMN_MAP: Record<NodeType, number> = {
    country: 0,
    resource: 1,
    component: 2,
    endProduct: 3,
};

export default function AiResourceGraph({ selectedResource = null }: { selectedResource?: string | null }) {
    const { theme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [mounted, setMounted] = useState(false);
    const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
    const [isStabilized, setIsStabilized] = useState(false);
    // Removed forcesReady gate to allow immediate rendering

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);

    useEffect(() => {
        setMounted(true);

        const currentContainer = containerRef.current;
        if (!currentContainer) return;

        let animationFrameId: number;
        const resizeObserver = new ResizeObserver((entries) => {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                if (!entries || !entries.length) return;
                const { width, height } = entries[0].contentRect;

                setDimensions(prev => {
                    if (Math.abs(prev.width - width) > 5 || Math.abs(prev.height - height) > 5) {
                        return { width, height };
                    }
                    return prev;
                });
            });
        });

        resizeObserver.observe(currentContainer);

        return () => {
            resizeObserver.unobserve(currentContainer);
            resizeObserver.disconnect();
        };
    }, []);

    // Configure forces after the graph engine is available
    useEffect(() => {
        if (!mounted || !fgRef.current) return;

        const fg = fgRef.current;

        // Robustly disable default forces by setting strength to 0
        // Some versions of react-force-graph/d3-force might not handle null well
        fg.d3Force('charge', d3.forceManyBody().strength(0));
        fg.d3Force('center', d3.forceCenter(0, 0).strength(0));

        // Extremely rigid links so nodes don't rubber-band
        fg.d3Force('link')?.distance(80).strength(1);

        // X-axis: rigidly lock nodes into their columns with high strength
        const spread = dimensions.width * 0.35;
        fg.d3Force('x', d3.forceX((node: any) => {
            return -spread + ((node.column || 0) / 3) * spread * 2;
        }).strength(2.0));

        // Y-axis: medium centering to maintain a neat horizontal band
        fg.d3Force('y', d3.forceY(0).strength(0.6));

        // Strict collision to prevent any overlap
        fg.d3Force('collision', d3.forceCollide((node: any) => {
            return Math.sqrt(node.val || 10) * 3 + 25;
        }).iterations(4));

        // Important: Reheat to apply these changes to the internal simulation state
        fg.d3ReheatSimulation();
    }, [mounted, dimensions.width]);

    // Zoom to fit on initial load
    useEffect(() => {
        if (mounted && fgRef.current) {
            const timeout = setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.zoomToFit(400, 50);
                }
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [mounted]);

    const isDark = mounted ? (theme === "dark" || theme === "system" || !theme) : true;

    // Premium Color Palette
    const colors = useMemo(() => ({
        country: isDark ? "#10b981" : "#059669",
        resource: isDark ? "#f59e0b" : "#d97706",
        component: isDark ? "#3b82f6" : "#2563eb",
        endProduct: isDark ? "#a855f7" : "#7c3aed",
        background: isDark ? "rgba(15, 23, 42, 0.4)" : "rgba(248, 250, 252, 0.8)",
        edge: isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(100, 116, 139, 0.15)",
        edgeActive: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
        text: isDark ? "#e2e8f0" : "#0f172a",
        textSecondary: isDark ? "#64748b" : "#94a3b8",
        nodeBg: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)",
    }), [isDark]);

    const graphData = useMemo(() => {
        // Filter logic: if a resource is selected, only show countries that produce it
        // and the path through that specific resource.
        const filteredAllSovereign = selectedResource
            ? ALL_SOVEREIGN_DATA.filter(c => c.keyResources.some(r => r.toLowerCase().includes(selectedResource.toLowerCase())))
            : ALL_SOVEREIGN_DATA;

        const countryNodes = filteredAllSovereign.map(c => ({
            id: c.country,
            group: 'country' as NodeType,
            name: c.name,
            val: Math.max(15, (c.axisScore / 100) * 30),
            column: 0,
            color: colors.country,
            desc: `${c.highlights.join(' | ')}. ${c.keyResources.join(', ')} reserves.`
        }));

        const allResourceNodes = [
            { id: "Cobalt", group: "resource" as NodeType, name: "Cobalt", val: 20, column: 1, color: colors.resource, desc: "Stabilizes high-density lithium-ion batteries. Prevents thermal runaway." },
            { id: "Copper", group: "resource" as NodeType, name: "Copper", val: 22, column: 1, color: colors.resource, desc: "The nervous system of AI — data center wiring, busbars, chip substrates." },
            { id: "Lithium", group: "resource" as NodeType, name: "Lithium", val: 20, column: 1, color: colors.resource, desc: "Core element for energy storage and backup power systems." },
            { id: "Bauxite", group: "resource" as NodeType, name: "Bauxite", val: 16, column: 1, color: colors.resource, desc: "Refined into Aluminum for server racks, heat sinks, and casings." },
            { id: "Graphite", group: "resource" as NodeType, name: "Graphite", val: 18, column: 1, color: colors.resource, desc: "Largest mineral component by weight in modern battery cells." },
            { id: "Coltan", group: "resource" as NodeType, name: "Coltan", val: 16, column: 1, color: colors.resource, desc: "Refined into Tantalum for high-performance capacitors." },
            { id: "Gold", group: "resource" as NodeType, name: "Gold", val: 18, column: 1, color: colors.resource, desc: "Unmatched conductivity and corrosion resistance for PCB plating and bond wires." },
            { id: "Nickel", group: "resource" as NodeType, name: "Nickel", val: 18, column: 1, color: colors.resource, desc: "Critical for high-nickel cathode chemistries in energy storage." },
            { id: "Phosphates", group: "resource" as NodeType, name: "Phosphates", val: 16, column: 1, color: colors.resource, desc: "Essential for LFP (Lithium Iron Phosphate) battery cathode production." },
            { id: "GasOil", group: "resource" as NodeType, name: "Oil & Gas", val: 24, column: 1, color: colors.resource, desc: "The baseload energy source for massive data center power plants." },
            { id: "Uranium", group: "resource" as NodeType, name: "Uranium", val: 20, column: 1, color: colors.resource, desc: "Nuclear fuel for zero-carbon consistent gigawatt-scale compute power." },
            { id: "IronOre", group: "resource" as NodeType, name: "Iron Ore", val: 16, column: 1, color: colors.resource, desc: "Refined into steel for structural data center frames and server racks." },
            { id: "Manganese", group: "resource" as NodeType, name: "Manganese", val: 15, column: 1, color: colors.resource, desc: "Used in steel alloys and increasingly in NMC battery cathodes." },
            { id: "RareEarths", group: "resource" as NodeType, name: "Rare Earths", val: 18, column: 1, color: colors.resource, desc: "Neodymium and Praseodymium for high-efficiency server cooling fan motors." },
            { id: "Platinum", group: "resource" as NodeType, name: "Platinum/PGMs", val: 17, column: 1, color: colors.resource, desc: "Catalytic properties used in specialized semiconductor manufacturing." }
        ];

        const resourceNodes = selectedResource
            ? allResourceNodes.filter(n => n.id.toLowerCase().includes(selectedResource.toLowerCase()))
            : allResourceNodes;

        const componentNodes = [
            { id: "Batteries", group: "component" as NodeType, name: "Energy Storage", val: 22, column: 2, color: colors.component, desc: "Grid stabilization and UPS for AI compute facilities." },
            { id: "Semiconductors", group: "component" as NodeType, name: "Semiconductors", val: 24, column: 2, color: colors.component, desc: "Tantalum capacitors and copper interconnects enable nanoscale logic." },
            { id: "Thermal", group: "component" as NodeType, name: "Thermal Systems", val: 18, column: 2, color: colors.component, desc: "Copper and Aluminum heat sinks for cooling AI accelerators." },
            { id: "Grid", group: "component" as NodeType, name: "Power Grid", val: 20, column: 2, color: colors.component, desc: "Massive copper cabling to deliver gigawatts to server farms." },
        ];

        const productNodes = [
            { id: "DataCenters", group: "endProduct" as NodeType, name: "Data Centers", val: 30, column: 3, color: colors.endProduct, desc: "The physical substrate of the cloud — massive power, cooling, raw materials." },
            { id: "GPUs", group: "endProduct" as NodeType, name: "AI Accelerators", val: 28, column: 3, color: colors.endProduct, desc: "GPUs/TPUs — densely packed logic requiring pristine conductive metals." },
            { id: "EdgeAI", group: "endProduct" as NodeType, name: "Edge AI", val: 22, column: 3, color: colors.endProduct, desc: "Autonomous endpoint devices reliant on compact high-density batteries." },
            { id: "LLMs", group: "endProduct" as NodeType, name: "Frontier LLMs", val: 34, column: 3, color: colors.endProduct, desc: "Emergent intelligence — entirely dependent on the physical layers below." }
        ];

        // Dynamic links from countries to resources
        const dynamicCountryLinks: GraphLink[] = [];
        filteredAllSovereign.forEach(c => {
            const res = c.keyResources.map(r => r.toLowerCase());
            let hasLink = false;

            if (res.some(r => r.includes('cobalt'))) { dynamicCountryLinks.push({ source: c.country, target: "Cobalt", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('copper'))) { dynamicCountryLinks.push({ source: c.country, target: "Copper", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('lithium'))) { dynamicCountryLinks.push({ source: c.country, target: "Lithium", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('bauxite'))) { dynamicCountryLinks.push({ source: c.country, target: "Bauxite", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('graphite'))) { dynamicCountryLinks.push({ source: c.country, target: "Graphite", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('coltan') || r.includes('tantalum'))) { dynamicCountryLinks.push({ source: c.country, target: "Coltan", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('gold'))) { dynamicCountryLinks.push({ source: c.country, target: "Gold", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('nickel'))) { dynamicCountryLinks.push({ source: c.country, target: "Nickel", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('phosphate'))) { dynamicCountryLinks.push({ source: c.country, target: "Phosphates", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('oil') || r.includes('gas'))) { dynamicCountryLinks.push({ source: c.country, target: "GasOil", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('uranium'))) { dynamicCountryLinks.push({ source: c.country, target: "Uranium", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('iron ore'))) { dynamicCountryLinks.push({ source: c.country, target: "IronOre", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('manganese'))) { dynamicCountryLinks.push({ source: c.country, target: "Manganese", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('rare earth'))) { dynamicCountryLinks.push({ source: c.country, target: "RareEarths", value: 6 }); hasLink = true; }
            if (res.some(r => r.includes('platinum') || r.includes('chrome'))) { dynamicCountryLinks.push({ source: c.country, target: "Platinum", value: 6 }); hasLink = true; }

            // Special handling for DRC Cobalt dominance
            if (c.country === "COD" && res.some(r => r.includes('cobalt'))) {
                const codLink = dynamicCountryLinks.find(l => l.source === "COD" && l.target === "Cobalt");
                if (codLink) codLink.label = "70% GLOBAL";
            }

            // Catch-all to ensure every country has at least ONE connection
            if (!hasLink) {
                // Map smaller economies or those with soft commodities to general Strategic nodes
                dynamicCountryLinks.push({ source: c.country, target: "GasOil", value: 4, label: "ENERGY EXPORT" });
            }
        });

        // Further filter dynamicCountryLinks if selectedResource is set
        const finalCountryLinks = selectedResource
            ? dynamicCountryLinks.filter(l => l.target.toLowerCase().includes(selectedResource.toLowerCase()))
            : dynamicCountryLinks;

        const baseLinks = [
            // Resources -> Components
            { source: "Cobalt", target: "Batteries", value: 7 },
            { source: "Lithium", target: "Batteries", value: 7 },
            { source: "Graphite", target: "Batteries", value: 6 },
            { source: "Nickel", target: "Batteries", value: 6 },
            { source: "Phosphates", target: "Batteries", value: 5 },
            { source: "Manganese", target: "Batteries", value: 5 },
            { source: "Copper", target: "Grid", value: 8 },
            { source: "Copper", target: "Semiconductors", value: 5 },
            { source: "Copper", target: "Thermal", value: 4 },
            { source: "Bauxite", target: "Thermal", value: 5 },
            { source: "Bauxite", target: "Grid", value: 3 },
            { source: "Coltan", target: "Semiconductors", value: 6 },
            { source: "Gold", target: "Semiconductors", value: 7 },
            { source: "Gold", target: "GPUs", value: 6 },
            { source: "RareEarths", target: "Thermal", value: 6 },
            { source: "Platinum", target: "Semiconductors", value: 5 },
            { source: "GasOil", target: "Grid", value: 9 },
            { source: "Uranium", target: "Grid", value: 8 },
            { source: "IronOre", target: "Thermal", value: 4 },
            { source: "IronOre", target: "Grid", value: 3 },

            // Components -> AI
            { source: "Batteries", target: "DataCenters", value: 6, label: "UPS" },
            { source: "Batteries", target: "EdgeAI", value: 8 },
            { source: "Grid", target: "DataCenters", value: 9, label: "GW Power" },
            { source: "Semiconductors", target: "GPUs", value: 10 },
            { source: "Semiconductors", target: "EdgeAI", value: 6 },
            { source: "Thermal", target: "DataCenters", value: 7 },
            { source: "Thermal", target: "GPUs", value: 8 },

            // Top Level
            { source: "DataCenters", target: "LLMs", value: 10, label: "Compute" },
            { source: "GPUs", target: "DataCenters", value: 9 },
            { source: "GPUs", target: "LLMs", value: 8 }
        ] as GraphLink[];

        // Filter baseLinks if selectedResource is set
        const finalBaseLinks = selectedResource
            ? baseLinks.filter(l => l.source.toLowerCase().includes(selectedResource.toLowerCase()) ||
                // Keep all downstream links if the source is one of the resource's targets
                baseLinks.some(prevL => prevL.source.toLowerCase().includes(selectedResource.toLowerCase()) && prevL.target === l.source))
            : baseLinks;

        return {
            nodes: [...countryNodes, ...resourceNodes, ...componentNodes, ...productNodes],
            links: [...finalCountryLinks, ...finalBaseLinks]
        };
    }, [colors, selectedResource]);

    // X-position target for each column (fraction of width, centered around 0)
    const getColumnX = useCallback((column: number) => {
        const spread = dimensions.width * 0.35; // Spread across 70% of width
        return -spread + (column / 3) * spread * 2;
    }, [dimensions.width]);

    const handleNodeHover = useCallback((node: GraphNode | null) => {
        setHoverNode(node);
        if (containerRef.current) {
            containerRef.current.style.cursor = node ? 'pointer' : 'grab';
        }
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const { id, x, y, val, color, name, group } = node as GraphNode & { x: number, y: number };

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const isHovered = hoverNode?.id === id;
        const isConnected = hoverNode ? graphData.links.some(l => {
            const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
            const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
            return (src === hoverNode.id && tgt === id) || (tgt === hoverNode.id && src === id);
        }) : false;
        const isFaded = hoverNode && !isHovered && !isConnected;

        const baseRadius = Math.sqrt(val) * 1.8;
        const radius = isHovered ? baseRadius * 1.25 : baseRadius;

        ctx.globalAlpha = isFaded ? 0.15 : 1;

        // Outer glow ring for hovered/connected
        if (isHovered || isConnected) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
            ctx.fillStyle = `${color}25`;
            ctx.fill();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);

        // Gradient fill
        const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
        gradient.addColorStop(0, color || '#fff');
        gradient.addColorStop(1, `${color}bb`);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Subtle border
        ctx.lineWidth = isHovered ? 2 : 0.8;
        ctx.strokeStyle = isHovered ? '#fff' : `${color}88`;
        ctx.stroke();

        // Label
        if (globalScale > 0.5 || isHovered || isConnected) {
            const fontSize = isHovered ? Math.max(13 / globalScale, 5) : Math.max(11 / globalScale, 3.5);
            ctx.font = `${isHovered ? '600' : '500'} ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            const labelY = y + radius + 3;
            const text = name;
            const textWidth = ctx.measureText(text).width;

            // Label background pill
            const padding = 3 / globalScale;
            const pillH = fontSize + padding * 2;
            const pillW = textWidth + padding * 3;
            const pillR = pillH / 2;

            ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.roundRect(x - pillW / 2, labelY - padding, pillW, pillH, pillR);
            ctx.fill();

            // Add subtle stroke to the pill itself for more definition
            ctx.lineWidth = 0.5 / globalScale;
            ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.2)';
            ctx.stroke();

            // Text
            ctx.fillStyle = isHovered ? (isDark ? '#fff' : '#0f172a') : (isDark ? '#f8fafc' : '#334155');
            ctx.fillText(text, x, labelY);
        }

        ctx.globalAlpha = 1;
    }, [hoverNode, isDark, graphData.links]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const source = link.source;
        const target = link.target;
        if (!source || !target || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;

        const isConnected = hoverNode && (source.id === hoverNode.id || target.id === hoverNode.id);
        const isFaded = hoverNode && !isConnected;

        ctx.globalAlpha = isFaded ? 0.04 : (isConnected ? 0.7 : 0.2);

        const lineWidth = isConnected ? link.value / 3 : link.value / 5;

        // Curved link
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const curvature = 0.15;
        const cpX = midX - dy * curvature;
        const cpY = midY + dx * curvature;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(cpX, cpY, target.x, target.y);
        ctx.strokeStyle = isConnected
            ? colors.edgeActive
            : (source.color ? `${source.color}40` : colors.edge);
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Arrow head
        if (globalScale > 0.6 || isConnected) {
            const t = 0.85; // Position along curve
            const arrowX = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * cpX + t * t * target.x;
            const arrowY = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * cpY + t * t * target.y;
            const tangentX = 2 * (1 - t) * (cpX - source.x) + 2 * t * (target.x - cpX);
            const tangentY = 2 * (1 - t) * (cpY - source.y) + 2 * t * (target.y - cpY);
            const angle = Math.atan2(tangentY, tangentX);
            const arrowLen = isConnected ? 6 : 4;

            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - arrowLen * Math.cos(angle - Math.PI / 6), arrowY - arrowLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(arrowX - arrowLen * Math.cos(angle + Math.PI / 6), arrowY - arrowLen * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = isConnected ? colors.edgeActive : `${source.color || colors.edge}60`;
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }, [hoverNode, colors]);

    const handleEngineStop = useCallback(() => {
        if (!isStabilized && fgRef.current) {
            fgRef.current.zoomToFit(600, 60);
            setIsStabilized(true);
        }
    }, [isStabilized]);

    // Column header labels
    const columnLabels = ['SOVEREIGN NATIONS', 'CRITICAL MINERALS', 'REFINED TECH', 'AI & COMPUTE'];
    const columnColors = [colors.country, colors.resource, colors.component, colors.endProduct];

    return (
        <div className="w-full h-full relative flex flex-col overflow-hidden">

            {/* Top Bar - Title + Legend inline */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 z-10">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-violet-400 animate-pulse" />
                    <h2 className="text-sm font-bold font-mono text-foreground uppercase tracking-widest">
                        AI Supply Chain Nexus
                    </h2>
                </div>
                <div className="flex items-center gap-4">
                    {columnLabels.map((label, i) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: columnColors[i] }} />
                            <span className="text-[9px] font-mono text-slate-light uppercase tracking-wider hidden lg:inline">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Graph Container */}
            <div className="flex-1 w-full h-full min-h-[400px] cursor-grab active:cursor-grabbing border border-border rounded-xl bg-panel/20 backdrop-blur-xl shadow-2xl overflow-hidden relative" style={{ isolation: 'isolate' }}>
                {/* Dot grid background */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-overlay"
                    style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)', backgroundSize: '20px 20px' }} />

                {/* Isolate ResizeObserver target */}
                <div ref={containerRef} className="absolute inset-0">
                    {mounted && (
                        <ForceGraph2D
                            ref={fgRef}
                            width={dimensions.width}
                            height={dimensions.height}
                            graphData={graphData}
                            nodeLabel=""
                            nodeCanvasObject={paintNode}
                            nodeCanvasObjectMode={() => 'replace'}
                            linkCanvasObject={paintLink}
                            linkCanvasObjectMode={() => 'replace'}
                            linkDirectionalParticles={(link: any) => {
                                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return 5;
                                return 1;
                            }}
                            linkDirectionalParticleWidth={(link: any) => {
                                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return 3;
                                return 1.2;
                            }}
                            linkDirectionalParticleColor={(link: any) => {
                                return link.source?.color || colors.text;
                            }}
                            linkDirectionalParticleSpeed={0.005}
                            d3AlphaDecay={0.1} // Settle even faster
                            d3VelocityDecay={0.92} // Maximum friction, zero bouncing
                            warmupTicks={40} // Show graph much sooner (was 200)
                            cooldownTicks={50} // Settle physics faster (was 100)
                            onNodeHover={(node: any) => handleNodeHover(node)}
                            onNodeDragEnd={(node: any) => {
                                // Pin node where user drops it but allow a little elastic settling
                                node.fx = node.x;
                                node.fy = node.y;
                            }}
                            onEngineStop={handleEngineStop}
                        />
                    )}
                </div>

                {/* Floating Detail Card */}
                {hoverNode && (
                    <div className={`absolute bottom-4 right-4 w-72 ${isDark ? 'bg-zinc-900/95 border-zinc-700/80' : 'bg-white/95 border-zinc-200'} border p-3.5 rounded-xl shadow-2xl backdrop-blur-xl pointer-events-none z-20`}>
                        <div className="flex items-center gap-3 mb-2 pb-2 border-b" style={{ borderColor: isDark ? '#27272a' : '#e4e4e7' }}>
                            <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${hoverNode.color}18`, color: hoverNode.color }}>
                                {hoverNode.group === 'country' ? <Globe className="w-4 h-4" /> :
                                    hoverNode.group === 'resource' ? <Pickaxe className="w-4 h-4" /> :
                                        hoverNode.group === 'component' ? <Cpu className="w-4 h-4" /> :
                                            <BrainCircuit className="w-4 h-4" />}
                            </div>
                            <div>
                                <h3 className={`text-sm font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>{hoverNode.name}</h3>
                                <p className={`text-[8px] font-mono uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                    {hoverNode.group === 'country' ? 'Sovereign Source' :
                                        hoverNode.group === 'resource' ? 'Raw Material' :
                                            hoverNode.group === 'component' ? 'Refined Infrastructure' : 'Terminal Entity'}
                                </p>
                            </div>
                        </div>
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>{hoverNode.desc}</p>
                        <div className="mt-2.5 pt-2.5 flex justify-between" style={{ borderTop: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}` }}>
                            <div className="flex flex-col">
                                <span className={`text-[7px] font-mono uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Sovereign Score</span>
                                <span className={`text-xs font-mono font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>{hoverNode.val.toFixed(0)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className={`text-[7px] font-mono uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Layer</span>
                                <span className="text-xs font-mono font-bold" style={{ color: hoverNode.color }}>{columnLabels[hoverNode.column]}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
