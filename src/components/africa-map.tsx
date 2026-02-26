"use client"

import React, { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { useTheme } from "next-themes"
import { Plus, Minus } from "lucide-react"

// List of ISO 3166-1 numeric codes for African countries matching the TopoJSON
const AFRICAN_COUNTRIES = [
    "012", "024", "204", "072", "854", "108", "120", "132", "140", "148",
    "174", "180", "178", "384", "262", "818", "226", "232", "748", "231",
    "266", "270", "288", "324", "624", "404", "426", "430", "434", "450",
    "454", "466", "478", "480", "504", "508", "516", "562", "566", "646",
    "678", "686", "690", "694", "706", "710", "728", "729", "834", "768",
    "788", "800", "894", "716", "732" // 732 is Western Sahara for mapping completeness
];

const geoUrl = "/world.json";

export default function AfricaMap() {
    const { theme } = useTheme();
    const [tooltip, setTooltip] = useState({ show: false, content: "", data: null as any, x: 0, y: 0 });
    const [position, setPosition] = useState({ coordinates: [0, 0], zoom: 1.2 });

    // Mock Intelligence Data for Map Tooltips
    const intelligenceMock = (countryName: string) => {
        // Generate a pseudo-random stable score based on string length
        const baseScore = 50 + (countryName.length * 3);
        const resource = ["Copper/Cobalt", "Gold/Uranium", "Oil/Gas", "Agriculture/Tech", "Rare Earths", "Lithium"][countryName.length % 6];
        return {
            riskScore: Math.min(baseScore, 95),
            resourceKey: resource,
            fdiTrend: baseScore > 70 ? "+2.4%" : "-1.1%"
        };
    };

    // Theme-aware map colors
    // Default to dark mode colors since dark is default
    const isDark = theme === "dark" || theme === "system" || !theme;

    const mapConfig = {
        // Deep rich earth/green base
        fill: isDark ? "rgba(10, 35, 20, 0.9)" : "rgba(220, 235, 220, 1)",
        // Vibrant Gold stroke
        stroke: isDark ? "rgba(241, 181, 4, 0.5)" : "rgba(241, 181, 4, 0.8)",
        // Pan-African Red on hover
        hover: isDark ? "rgba(227, 18, 11, 0.6)" : "rgba(227, 18, 11, 0.8)",
        // Vibrant Green active state
        active: isDark ? "rgba(0, 135, 81, 0.9)" : "rgba(0, 135, 81, 1)",
        // Hover stroke color (Bright yellow/gold)
        hoverStroke: "rgba(255, 215, 0, 1)",
        // Glow effect
        glowInfo: "rgba(255, 215, 0, 0.5)"
    };

    function handleZoomIn() {
        if (position.zoom >= 4) return;
        setPosition((pos) => ({ ...pos, zoom: pos.zoom * 1.5 }));
    }

    function handleZoomOut() {
        if (position.zoom <= 1) return;
        setPosition((pos) => ({ ...pos, zoom: pos.zoom / 1.5 }));
    }

    function handleMoveEnd(position: any) {
        setPosition(position);
    }

    return (
        <div className="w-full h-full relative" style={{ isolation: "isolate" }}>
            <ComposableMap
                projection="geoAzimuthalEqualArea"
                projectionConfig={{
                    rotate: [-15, -2, 0],   // Center over Africa
                    scale: 450,            // Zoom in appropriate for the continent
                }}
                style={{ width: "100%", height: "100%" }}
            >
                <ZoomableGroup
                    zoom={position.zoom}
                    center={position.coordinates as [number, number]}
                    onMoveEnd={handleMoveEnd}
                >
                    <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                // Determine if this geography is an African country
                                const isAfrica = AFRICAN_COUNTRIES.includes(geo.id);

                                // If it's not Africa, we could either hide it or style it faintly.
                                // For an exclusively African "War Room", hiding the rest looks cleaner.
                                if (!isAfrica) return null;

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        stroke={mapConfig.stroke}
                                        strokeWidth={0.5}
                                        onMouseEnter={(e) => {
                                            const intel = intelligenceMock(geo.properties.name);
                                            setTooltip({ show: true, content: geo.properties.name, data: intel, x: e.clientX, y: e.clientY });
                                        }}
                                        onMouseMove={(e) => {
                                            setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
                                        }}
                                        onMouseLeave={() => {
                                            setTooltip((prev) => ({ ...prev, show: false }));
                                        }}
                                        style={{
                                            default: {
                                                fill: mapConfig.fill,
                                                outline: "none",
                                                transition: "all 250ms"
                                            },
                                            hover: {
                                                fill: mapConfig.hover,
                                                stroke: mapConfig.hoverStroke, // Vibrant gold on hover
                                                strokeWidth: 1.5,
                                                outline: "none",
                                                cursor: "pointer",
                                                filter: `drop-shadow(0px 0px 8px ${mapConfig.glowInfo})`,
                                            },
                                            pressed: {
                                                fill: mapConfig.active,
                                                outline: "none",
                                            },
                                        }}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ZoomableGroup>
            </ComposableMap>

            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-1 bg-panel/80 p-1 border border-border backdrop-blur-md rounded-lg shadow-lg">
                <button
                    onClick={handleZoomIn}
                    className="p-1.5 hover:bg-background rounded-md transition-colors text-foreground group"
                >
                    <Plus className="w-4 h-4 text-slate-light group-hover:text-foreground" />
                </button>
                <div className="h-px bg-border w-full" />
                <button
                    onClick={handleZoomOut}
                    className="p-1.5 hover:bg-background rounded-md transition-colors text-foreground group"
                >
                    <Minus className="w-4 h-4 text-slate-light group-hover:text-foreground" />
                </button>
            </div>

            {/* Rich Hover Tooltip */}
            {tooltip.show && (
                <div
                    style={{
                        position: "fixed",
                        left: tooltip.x + 20,
                        top: tooltip.y + 20,
                        zIndex: 1000,
                        pointerEvents: "none"
                    }}
                    className="w-56 bg-panel/95 border border-border p-3 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-md text-foreground pointer-events-none"
                >
                    <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${tooltip.data?.riskScore > 70 ? 'bg-green-500' : 'bg-red-500'}`} />
                        <h4 className="text-sm font-bold tracking-wider uppercase">{tooltip.content}</h4>
                    </div>

                    <div className="space-y-2 font-mono text-[10px]">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">SOVEREIGNTY SCORE</span>
                            <span className={`font-bold ${tooltip.data?.riskScore > 70 ? 'text-green-500' : 'text-red-500'}`}>{tooltip.data?.riskScore}/100</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">KEY RESOURCE</span>
                            <span className="text-cobalt font-bold">{tooltip.data?.resourceKey}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">FDI TREND (QOQ)</span>
                            <span className={`${tooltip.data?.fdiTrend.startsWith('+') ? 'text-green-500' : 'text-orange-500'}`}>
                                {tooltip.data?.fdiTrend}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
