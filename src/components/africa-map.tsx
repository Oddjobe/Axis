"use client"

import React, { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { useTheme } from "next-themes"
import { Plus, Minus } from "lucide-react"
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data"
import type { CountryData } from "@/components/country-dossier-modal"

interface AfricaMapProps {
    selectedCountryCode: string | null;
    onSelectCountry: (code: string | null) => void;
}

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

export default function AfricaMap({ selectedCountryCode, onSelectCountry }: AfricaMapProps) {
    const { theme } = useTheme();
    const [tooltip, setTooltip] = useState({ show: false, content: "", data: null as CountryData | null, x: 0, y: 0 });
    const [position, setPosition] = useState({ coordinates: [0, 0], zoom: 1.2 });

    const getCountryData = (geoName: string) => {
        return ALL_SOVEREIGN_DATA.find(c =>
            c.name.toLowerCase() === geoName.toLowerCase() ||
            c.name.toLowerCase().includes(geoName.toLowerCase()) ||
            geoName.toLowerCase().includes(c.name.toLowerCase()) ||
            (geoName === "Dem. Rep. Congo" && c.country === "COD") ||
            (geoName === "Central African Rep." && c.country === "CAF") ||
            (geoName === "Côte d'Ivoire" && c.country === "CIV") ||
            (geoName === "Eq. Guinea" && c.country === "GNQ") ||
            (geoName === "S. Sudan" && c.country === "SSD") ||
            (geoName === "W. Sahara" && c.country === "ESH")
        );
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

    function handleMoveEnd(position: { coordinates: [number, number], zoom: number }) {
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

                                // Render the rest of the world as a faint wireframe backdrop
                                if (!isAfrica) {
                                    return (
                                        <Geography
                                            key={geo.rsmKey}
                                            geography={geo}
                                            stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
                                            strokeWidth={0.5}
                                            style={{
                                                default: { fill: "transparent", outline: "none" },
                                                hover: { fill: "transparent", outline: "none" },
                                                pressed: { fill: "transparent", outline: "none" },
                                            }}
                                        />
                                    );
                                }

                                const cData = getCountryData(geo.properties.name);
                                const isSelected = selectedCountryCode && cData?.country === selectedCountryCode;

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        stroke={isSelected ? "rgba(0, 255, 128, 1)" : mapConfig.stroke}
                                        strokeWidth={isSelected ? 1.5 : 0.5}
                                        onClick={() => {
                                            if (isSelected) {
                                                onSelectCountry(null); // toggle off
                                            } else if (cData) {
                                                onSelectCountry(cData.country);
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            if (cData) {
                                                setTooltip({ show: true, content: cData.name, data: cData, x: e.clientX, y: e.clientY });
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            if (cData) {
                                                setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setTooltip((prev) => ({ ...prev, show: false }));
                                        }}
                                        style={{
                                            default: {
                                                fill: isSelected ? mapConfig.active : mapConfig.fill,
                                                outline: "none",
                                                transition: "all 250ms",
                                                filter: isSelected ? `drop-shadow(0px 0px 8px ${mapConfig.glowInfo})` : "none",
                                            },
                                            hover: {
                                                fill: mapConfig.hover,
                                                stroke: mapConfig.hoverStroke,
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
                        left: tooltip.x + 10,
                        top: tooltip.y + 10,
                        zIndex: 1000,
                        pointerEvents: "none"
                    }}
                    className="w-56 bg-panel/95 border border-border p-3 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-md text-foreground pointer-events-none"
                >
                    <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${(tooltip.data?.axisScore || 0) > 70 ? 'bg-green-500' : 'bg-red-500'}`} />
                        <h4 className="text-sm font-bold tracking-wider uppercase">{tooltip.content}</h4>
                    </div>

                    <div className="space-y-2 font-mono text-[10px]">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">SOVEREIGNTY SCORE</span>
                            <span className={`font-bold ${(tooltip.data?.axisScore || 0) > 70 ? 'text-green-500' : 'text-red-500'}`}>{tooltip.data?.axisScore}/100</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">KEY INITIATIVE</span>
                            <span className="text-cobalt font-bold max-w-32 truncate text-right">{tooltip.data?.highlights[0]}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-light">FDI TREND (QOQ)</span>
                            <span className={`${(tooltip.data?.trend || "").startsWith('+') ? 'text-green-500' : 'text-orange-500'}`}>
                                {tooltip.data?.trend}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
