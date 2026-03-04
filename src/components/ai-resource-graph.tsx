"use client"

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from 'next/dynamic';
import { useTheme } from "next-themes";
import { BrainCircuit, Pickaxe, Cpu, Globe, Battery, Database, Cpu as Microchip } from "lucide-react";

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
}

interface GraphLink {
    source: string;
    target: string;
    value: number;
    label?: string;
    color?: string;
}

export default function AiResourceGraph() {
    const { theme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [mounted, setMounted] = useState(false);
    const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);

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
                    // Use a slightly larger threshold (5px) to completely squash fractional layout loops
                    if (Math.abs(prev.width - width) > 5 || Math.abs(prev.height - height) > 5) {

                        // Recenter graph whenever container size drastically changes
                        setTimeout(() => {
                            if (fgRef.current) {
                                fgRef.current.zoomToFit(400, 50);
                            }
                        }, 50);

                        return { width, height };
                    }
                    return prev;
                });
            });
        });

        resizeObserver.observe(currentContainer);

        // Give the graph time to settle before centering
        setTimeout(() => {
            if (fgRef.current) {
                // Adjust d3-forces directly to prevent node bunching
                fgRef.current.d3Force('charge').strength(-400).distanceMax(400);
                fgRef.current.d3Force('link').distance(60);
                fgRef.current.zoomToFit(400, 50);
            }
        }, 100);

        return () => {
            if (currentContainer) {
                resizeObserver.unobserve(currentContainer);
            }
            resizeObserver.disconnect();
        };
    }, []);

    const isDark = mounted ? (theme === "dark" || theme === "system" || !theme) : true;

    // Premium Color Palette
    const colors = {
        country: isDark ? "#10b981" : "#059669", // Emerald
        resource: isDark ? "#f59e0b" : "#d97706", // Amber
        component: isDark ? "#3b82f6" : "#2563eb", // Blue
        endProduct: isDark ? "#8b5cf6" : "#7c3aed", // Violet
        background: isDark ? "rgba(15, 23, 42, 0.4)" : "rgba(248, 250, 252, 0.8)",
        edge: isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(100, 116, 139, 0.2)",
        edgeActive: isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.5)",
        text: isDark ? "#f8fafc" : "#0f172a",
        textSecondary: isDark ? "#94a3b8" : "#64748b"
    };

    const graphData: { nodes: GraphNode[], links: GraphLink[] } = {
        nodes: [
            // Level 1: African Countries (The Foundation)
            { id: "COD", group: "country", name: "DR Congo", val: 30, color: colors.country, desc: "70% of global Cobalt supply. Massive untapped Lithium and Copper reserves." },
            { id: "ZMB", group: "country", name: "Zambia", val: 24, color: colors.country, desc: "World-class Copper deposits, essential for electrical wiring and cooling systems." },
            { id: "GIN", group: "country", name: "Guinea", val: 22, color: colors.country, desc: "Controls 25% of global Bauxite (aluminum) reserves, critical for lightweight structural components." },
            { id: "ZAF", group: "country", name: "South Africa", val: 26, color: colors.country, desc: "Primary source of Platinum Group Metals (PGMs) and Manganese." },
            { id: "ZWE", group: "country", name: "Zimbabwe", val: 20, color: colors.country, desc: "Largest Lithium producing nation in Africa, escalating output rapidly." },
            { id: "MDG", group: "country", name: "Madagascar", val: 18, color: colors.country, desc: "Major supplier of flaked Graphite, crucial for battery anodes." },

            // Level 2: Critical Minerals/Resources
            { id: "Cobalt", group: "resource", name: "Cobalt", val: 20, color: colors.resource, desc: "Stabilizes high-density lithium-ion batteries. Prevent thermal runaway." },
            { id: "Copper", group: "resource", name: "Copper", val: 22, color: colors.resource, desc: "The nervous system of AI. Used in data center wiring, busbars, and chip substrates." },
            { id: "Lithium", group: "resource", name: "Lithium", val: 20, color: colors.resource, desc: "The core element for energy storage and backup power systems." },
            { id: "Bauxite", group: "resource", name: "Bauxite (Aluminum)", val: 16, color: colors.resource, desc: "Refined into Aluminum for server racks, heat sinks, and device casings." },
            { id: "Graphite", group: "resource", name: "Graphite", val: 18, color: colors.resource, desc: "The largest mineral component by weight in modern battery cells." },
            { id: "Coltan", group: "resource", name: "Coltan (Tantalum)", val: 16, color: colors.resource, desc: "Refined into Tantalum for high-performance capacitors in microelectronics." },

            // Level 3: Refined Components & Infrastructure
            { id: "Batteries", group: "component", name: "High-Density Energy Storage", val: 24, color: colors.component, desc: "Grid stabilization and uninterruptible power supplies (UPS) for AI compute facilities." },
            { id: "Semiconductors", group: "component", name: "Logic & Memory Chips", val: 26, color: colors.component, desc: "Tantalum capacitors and copper interconnects enable nanoscale transistor logic." },
            { id: "Thermal", group: "component", name: "Advanced Thermal Dynamics", val: 20, color: colors.component, desc: "Copper and Aluminum heat sinks critical for cooling high-TDP AI accelerators." },
            { id: "Grid", group: "component", name: "Electrical Infrastructure", val: 22, color: colors.component, desc: "Massive copper cabling required to deliver gigawatts of power to server farms." },

            // Level 4: The AI Apex (End Products)
            { id: "DataCenters", group: "endProduct", name: "Hyperscale AI Data Centers", val: 35, color: colors.endProduct, desc: "The physical substrate of the cloud. Requires massive power, cooling, and raw materials." },
            { id: "GPUs", group: "endProduct", name: "AI Accelerators (GPUs/TPUs)", val: 32, color: colors.endProduct, desc: "The math engines of AI. Densely packed logic requiring pristine conductive metals." },
            { id: "EdgeAI", group: "endProduct", name: "Edge AI & Robotics", val: 28, color: colors.endProduct, desc: "Autonomous endpoint devices heavily reliant on compact, high-density batteries." },
            { id: "LLMs", group: "endProduct", name: "Frontier Models (LLMs)", val: 40, color: colors.endProduct, desc: "The emergent intelligence layer, entirely dependent on the physical layers below." }
        ],
        links: [
            // Countries -> Resources
            { source: "COD", target: "Cobalt", value: 8, label: "70% Global Supply" },
            { source: "COD", target: "Copper", value: 4 },
            { source: "COD", target: "Coltan", value: 6 },
            { source: "ZMB", target: "Copper", value: 5 },
            { source: "GIN", target: "Bauxite", value: 7 },
            { source: "ZAF", target: "Bauxite", value: 3 }, // Proxy for refinement/transport
            { source: "ZWE", target: "Lithium", value: 6 },
            { source: "MDG", target: "Graphite", value: 5 },

            // Resources -> Components
            { source: "Cobalt", target: "Batteries", value: 7 },
            { source: "Lithium", target: "Batteries", value: 7 },
            { source: "Graphite", target: "Batteries", value: 6 },

            { source: "Copper", target: "Grid", value: 8 },
            { source: "Copper", target: "Semiconductors", value: 5 },
            { source: "Copper", target: "Thermal", value: 4 },

            { source: "Bauxite", target: "Thermal", value: 5 },
            { source: "Bauxite", target: "Grid", value: 3 },

            { source: "Coltan", target: "Semiconductors", value: 6 },

            // Components -> AI
            { source: "Batteries", target: "DataCenters", value: 6, label: "UPS / Backup" },
            { source: "Batteries", target: "EdgeAI", value: 8 },

            { source: "Grid", target: "DataCenters", value: 9, label: "GW Power Delivery" },

            { source: "Semiconductors", target: "GPUs", value: 10 },
            { source: "Semiconductors", target: "EdgeAI", value: 6 },

            { source: "Thermal", target: "DataCenters", value: 7 },
            { source: "Thermal", target: "GPUs", value: 8, label: "Heat Dissipation" },

            // Infrastructure -> The Top
            { source: "DataCenters", target: "LLMs", value: 10, label: "Training & Inference Compute" },
            { source: "GPUs", target: "DataCenters", value: 9 },
            { source: "GPUs", target: "LLMs", value: 8 }
        ]
    };

    const handleNodeHover = useCallback((node: GraphNode | null) => {
        setHoverNode(node);
        // Change cursor
        if (containerRef.current) {
            containerRef.current.style.cursor = node ? 'pointer' : 'grab';
        }
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const { id, x, y, val, color, name, group } = node as GraphNode & { x: number, y: number };
        const isHovered = hoverNode?.id === id;

        const radius = Math.sqrt(val) * 1.5;

        // Glow effect
        ctx.shadowColor = color || colors.text;
        ctx.shadowBlur = isHovered ? 20 : 5;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = color || colors.text;
        ctx.fill();

        // Stroke
        ctx.lineWidth = isHovered ? 1.5 : 0.5;
        ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
        ctx.stroke();

        ctx.shadowBlur = 0; // reset

        // Text label styling
        const fontSize = Math.max(12 / globalScale, 4);
        ctx.font = `${isHovered ? 'bold' : 'normal'} ${fontSize}px "Space Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Add a stroke (outline) around the text for contrast instead of a blocky box
        ctx.lineWidth = 3 / globalScale; // Scaled stroke width
        ctx.strokeStyle = isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)';
        ctx.strokeText(name, x, y + radius + 1 + fontSize);

        ctx.fillStyle = isHovered ? (isDark ? '#fff' : '#000') : colors.textSecondary;
        if (globalScale > 0.8 || isHovered) {
            ctx.fillStyle = isHovered ? (isDark ? '#fff' : '#1e293b') : colors.text;
            ctx.fillText(name, x, y + radius + 1 + fontSize);
        }
    }, [hoverNode, isDark, colors.text, colors.textSecondary]);

    return (
        <div className="w-full h-full relative flex flex-col overflow-hidden">

            <div className="absolute top-4 left-6 z-10 pointer-events-none max-w-sm">
                <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="w-5 h-5 text-cobalt animate-pulse" />
                    <h2 className="text-xl font-bold font-mono text-foreground uppercase tracking-widest">
                        The AI Nexus
                    </h2>
                </div>
                <p className="text-xs text-slate-light font-mono leading-relaxed backdrop-blur-sm bg-panel/30 p-2 rounded-lg border border-border/50">
                    The intelligence revolution is physical. This knowledge graph maps the undeniable dependency flow from African sovereign soil to frontier AI models. Africa is layer zero.
                </p>

                {/* Legend */}
                <div className="mt-4 flex flex-col gap-1.5 backdrop-blur-sm bg-panel/30 p-2 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.country }} />
                        <span className="text-[10px] font-mono text-slate-light uppercase">Sovereign Nations</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.resource }} />
                        <span className="text-[10px] font-mono text-slate-light uppercase">Critical Minerals</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.component }} />
                        <span className="text-[10px] font-mono text-slate-light uppercase">Refined Tech</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.endProduct }} />
                        <span className="text-[10px] font-mono text-slate-light uppercase">AI & Compute</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full h-full min-h-[500px] cursor-grab active:cursor-grabbing border border-border rounded-xl bg-panel/20 backdrop-blur-xl shadow-2xl overflow-hidden relative" style={{ isolation: 'isolate' }}>
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-overlay"
                    style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />

                {/* Isolate ResizeObserver target to prevent flexbox layout loops */}
                <div ref={containerRef} className="absolute inset-0">
                    {mounted && (
                        <ForceGraph2D
                            ref={fgRef}
                            width={dimensions.width}
                            height={dimensions.height}
                            graphData={graphData}
                            nodeLabel="" // Custom label handled via UI overlay
                            nodeCanvasObject={paintNode}
                            nodeCanvasObjectMode={() => 'replace'}
                            linkColor={(link: any) => {
                                if (hoverNode) {
                                    return link.source.id === hoverNode.id || link.target.id === hoverNode.id
                                        ? colors.edgeActive
                                        : 'transparent'; // Hide non-connected edges when hovering
                                }
                                return link.source.group === 'country' ? `${colors.country}40` :
                                    link.source.group === 'resource' ? `${colors.resource}40` :
                                        link.source.group === 'component' ? `${colors.component}40` : colors.edge;
                            }}
                            linkWidth={(link: any) => {
                                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return link.value / 2;
                                return link.value / 4;
                            }}
                            linkDirectionalParticles={(link: any) => {
                                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return 4;
                                return 1;
                            }}
                            linkDirectionalParticleWidth={(link: any) => {
                                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return 3;
                                return 1.5;
                            }}
                            linkDirectionalParticleSpeed={0.005}
                            d3AlphaDecay={0.02}
                            d3VelocityDecay={0.3}
                            onNodeHover={(node: any) => handleNodeHover(node)}
                            cooldownTicks={100}
                            onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
                        />
                    )}
                </div>

                {/* Floating Detail Card */}
                {hoverNode && (
                    <div className="absolute bottom-6 right-6 w-80 bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-700 p-4 rounded-xl shadow-2xl backdrop-blur-xl pointer-events-none z-20">
                        <div className="flex items-center gap-3 mb-2 pb-2 border-b border-zinc-800">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: `${hoverNode.color}20`, color: hoverNode.color }}>
                                {hoverNode.group === 'country' ? <Globe className="w-5 h-5" /> :
                                    hoverNode.group === 'resource' ? <Pickaxe className="w-5 h-5" /> :
                                        hoverNode.group === 'component' ? <Microchip className="w-5 h-5" /> :
                                            <BrainCircuit className="w-5 h-5" />}
                            </div>
                            <div>
                                <h3 className="text-white font-bold font-mono uppercase tracking-wider">{hoverNode.name}</h3>
                                <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">
                                    {hoverNode.group === 'country' ? 'Sovereign Source' :
                                        hoverNode.group === 'resource' ? 'Raw Material' :
                                            hoverNode.group === 'component' ? 'Refined Infrastructure' : 'Terminal Entity'}
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed font-sans">{hoverNode.desc}</p>

                        {/* Outgoing/Incoming metrics */}
                        <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between">
                            <div className="flex flex-col">
                                <span className="text-[8px] text-zinc-500 font-mono uppercase">Flow Weight</span>
                                <span className="text-xs text-white font-mono font-bold">{hoverNode.val.toFixed(1)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[8px] text-zinc-500 font-mono uppercase">Node ID</span>
                                <span className="text-xs font-mono" style={{ color: hoverNode.color }}>#{hoverNode.id}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
