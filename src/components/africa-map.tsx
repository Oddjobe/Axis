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
    const [tooltip, setTooltip] = useState({ show: false, content: "", x: 0, y: 0 });
    const [position, setPosition] = useState({ coordinates: [0, 0], zoom: 1.2 });

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
                                            setTooltip({ show: true, content: geo.properties.name, x: e.clientX, y: e.clientY });
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

            {/* Hover Tooltip */}
            {tooltip.show && (
                <div
                    style={{
                        position: "fixed",
                        left: tooltip.x + 15,
                        top: tooltip.y + 15,
                        zIndex: 1000,
                        pointerEvents: "none"
                    }}
                    className="bg-panel border border-border px-3 py-1.5 rounded-md shadow-[0_0_15px_rgba(37,99,235,0.15)] text-xs font-bold tracking-wider backdrop-blur-md text-foreground flex items-center gap-2"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-cobalt animate-pulse shadow-[0_0_5px_rgba(37,99,235,0.8)]" />
                    {tooltip.content.toUpperCase()}
                </div>
            )}
        </div>
    );
}
