"use client"

import React, { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
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
    "788", "800", "894", "716", "732"
];

// Major country labels with coordinates
const COUNTRY_LABELS: { name: string, coordinates: [number, number], size?: string }[] = [
    { name: "NIGERIA", coordinates: [8, 9.5] },
    { name: "EGYPT", coordinates: [30, 27] },
    { name: "SOUTH AFRICA", coordinates: [25, -30] },
    { name: "KENYA", coordinates: [38, 0] },
    { name: "DRC", coordinates: [23, -3] },
    { name: "ETHIOPIA", coordinates: [39, 8.5] },
    { name: "ALGERIA", coordinates: [3, 28], size: "lg" },
    { name: "MOROCCO", coordinates: [-6, 32] },
    { name: "GHANA", coordinates: [-1.5, 7.5] },
    { name: "TANZANIA", coordinates: [35, -6.5] },
    { name: "ANGOLA", coordinates: [17.5, -12] },
    { name: "SUDAN", coordinates: [30, 15] },
    { name: "LIBYA", coordinates: [17, 27] },
    { name: "MALI", coordinates: [-2, 17] },
    { name: "NIGER", coordinates: [9, 17] },
    { name: "CHAD", coordinates: [18, 13] },
    { name: "SENEGAL", coordinates: [-15, 14.5] },
    { name: "MOZAMBIQUE", coordinates: [35, -17] },
    { name: "ZAMBIA", coordinates: [28, -14] },
    { name: "ZIMBABWE", coordinates: [30, -20] },
    { name: "MADAGASCAR", coordinates: [47, -19.5] },
    { name: "CAMEROON", coordinates: [12, 6] },
    { name: "SOMALIA", coordinates: [46, 5] },
    { name: "UGANDA", coordinates: [32, 1.5] },
    { name: "RWANDA", coordinates: [29.5, -2] },
    { name: "TUNISIA", coordinates: [9.5, 34] },
];

// Pulsing alert markers for countries with high activity
const ALERT_MARKERS: { coordinates: [number, number], severity: "high" | "medium" | "low" }[] = [
    { coordinates: [25, -3], severity: "high" },     // DRC - cobalt
    { coordinates: [38, 0.5], severity: "medium" },   // Kenya - BRI
    { coordinates: [25, -29], severity: "high" },     // South Africa - CBAM
    { coordinates: [8, 9], severity: "medium" },      // Nigeria - Dangote
    { coordinates: [-1, 7], severity: "low" },        // Ghana - IMF
    { coordinates: [30, 0], severity: "low" },        // Rwanda - tech
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

    // Heat map: color by Axis Score
    const getHeatColor = (score: number, isDark: boolean) => {
        if (score >= 80) return isDark ? "rgba(34, 197, 94, 0.7)" : "rgba(34, 197, 94, 0.6)";   // Green
        if (score >= 65) return isDark ? "rgba(34, 197, 94, 0.4)" : "rgba(34, 197, 94, 0.35)";  // Light green
        if (score >= 55) return isDark ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.35)";  // Yellow
        if (score >= 45) return isDark ? "rgba(249, 115, 22, 0.4)" : "rgba(249, 115, 22, 0.35)"; // Orange
        return isDark ? "rgba(239, 68, 68, 0.4)" : "rgba(239, 68, 68, 0.35)";                    // Red
    };

    const isDark = theme === "dark" || theme === "system" || !theme;

    const mapConfig = {
        stroke: isDark ? "rgba(241, 181, 4, 0.5)" : "rgba(241, 181, 4, 0.8)",
        hover: isDark ? "rgba(227, 18, 11, 0.6)" : "rgba(227, 18, 11, 0.8)",
        active: isDark ? "rgba(0, 135, 81, 0.9)" : "rgba(0, 135, 81, 1)",
        hoverStroke: "rgba(255, 215, 0, 1)",
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
                    rotate: [-20, 2, 0],
                    scale: 380,
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
                                const isAfrica = AFRICAN_COUNTRIES.includes(geo.id);

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
                                const heatFill = cData ? getHeatColor(cData.axisScore, isDark) : (isDark ? "rgba(10, 35, 20, 0.9)" : "rgba(220, 235, 220, 1)");

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        stroke={isSelected ? "rgba(0, 255, 128, 1)" : mapConfig.stroke}
                                        strokeWidth={isSelected ? 1.5 : 0.5}
                                        onClick={() => {
                                            if (isSelected) {
                                                onSelectCountry(null);
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
                                                fill: isSelected ? mapConfig.active : heatFill,
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

                    {/* Animated Alert Markers */}
                    {ALERT_MARKERS.map((marker, idx) => (
                        <Marker key={`alert-${idx}`} coordinates={marker.coordinates}>
                            <circle
                                r={3}
                                fill={marker.severity === "high" ? "#ef4444" : marker.severity === "medium" ? "#f59e0b" : "#22c55e"}
                                opacity={0.9}
                            />
                            <circle
                                r={3}
                                fill="none"
                                stroke={marker.severity === "high" ? "#ef4444" : marker.severity === "medium" ? "#f59e0b" : "#22c55e"}
                                strokeWidth={1}
                                opacity={0.6}
                            >
                                <animate attributeName="r" from="3" to="12" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                            </circle>
                        </Marker>
                    ))}

                    {/* Country Labels */}
                    {COUNTRY_LABELS.map((label, idx) => (
                        <Marker key={`label-${idx}`} coordinates={label.coordinates}>
                            <text
                                textAnchor="middle"
                                style={{
                                    fontFamily: "ui-monospace, monospace",
                                    fontSize: label.size === "lg" ? "6px" : "4.5px",
                                    fill: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
                                    letterSpacing: "0.5px",
                                    fontWeight: 600,
                                    pointerEvents: "none",
                                    userSelect: "none",
                                }}
                            >
                                {label.name}
                            </text>
                        </Marker>
                    ))}
                </ZoomableGroup>
            </ComposableMap>

            {/* Heat Map Legend */}
            <div className="absolute bottom-4 left-4 bg-panel/80 border border-border rounded-lg p-2.5 backdrop-blur-md shadow-lg">
                <div className="text-[8px] font-mono text-slate-light mb-1.5 tracking-wider">SOVEREIGNTY HEAT MAP</div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-2.5 rounded-sm bg-red-500/50" />
                    <div className="w-4 h-2.5 rounded-sm bg-orange-500/50" />
                    <div className="w-4 h-2.5 rounded-sm bg-yellow-500/50" />
                    <div className="w-4 h-2.5 rounded-sm bg-green-500/30" />
                    <div className="w-4 h-2.5 rounded-sm bg-green-500/70" />
                </div>
                <div className="flex justify-between text-[7px] font-mono text-slate-light mt-0.5">
                    <span>EXTRACTIVE</span>
                    <span>OPTIMAL</span>
                </div>
            </div>

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

            {/* Rich Hover Tooltip — centered above cursor */}
            {tooltip.show && (
                <div
                    style={{
                        position: "fixed",
                        left: Math.max(8, Math.min(tooltip.x - 112, window.innerWidth - 232)),
                        top: Math.max(4, tooltip.y - 120),
                        zIndex: 1000,
                        pointerEvents: "none",
                        transform: "translateZ(0)"
                    }}
                    className="w-56 bg-zinc-900 dark:bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.5)] text-white pointer-events-none"
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
