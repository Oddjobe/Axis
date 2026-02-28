"use client"

import React, { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
import { useTheme } from "next-themes"
import { Plus, Minus, Layers } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data"
import type { CountryData } from "@/components/country-dossier-modal"

interface AfricaMapProps {
    selectedCountryCode: string | null;
    onSelectCountry: (code: string | null) => void;
    timeValue?: number;
}

export type MapTheme = "SOVEREIGNTY" | "RESOURCE_WEALTH" | "FDI_TREND" | "BASE";

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
    { name: "S. AFRICA", coordinates: [25, -30] },
    { name: "KENYA", coordinates: [38, 0] },
    { name: "DRC", coordinates: [23, -3] },
    { name: "ETHIOPIA", coordinates: [39, 8.5] },
    { name: "ALGERIA", coordinates: [3, 28], size: "lg" },
    { name: "MOROCCO", coordinates: [-6, 32] },
    { name: "GHANA", coordinates: [-1.5, 7.5] },
    { name: "TANZANIA", coordinates: [35, -6.5] },
    { name: "ANGOLA", coordinates: [17.5, -12] },
    { name: "SUDAN", coordinates: [30, 15] },
    { name: "LIBYA", coordinates: [17, 27], size: "lg" },
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
    { name: "NAMIBIA", coordinates: [17, -22] },
    { name: "BOTSWANA", coordinates: [24, -22.5] },
    { name: "MAURITANIA", coordinates: [-10, 20] },
    { name: "GABON", coordinates: [11.5, -0.5] },
    { name: "CONGO", coordinates: [15, -4] },
    { name: "GUINEA", coordinates: [-11, 10.5] },
    { name: "BENIN", coordinates: [2.3, 9.5] },
    { name: "TOGO", coordinates: [1.1, 8.5] },
    { name: "S. LEONE", coordinates: [-11.5, 8.5] },
    { name: "LIBERIA", coordinates: [-9.5, 6.5] },
    { name: "CÔTE D'IV.", coordinates: [-5.5, 7.5] },
    { name: "BURKINA F.", coordinates: [-1.5, 12.5] },
    { name: "S. SUDAN", coordinates: [31, 7] },
    { name: "ERITREA", coordinates: [39, 15] },
    { name: "C.A.R.", coordinates: [20, 6.5] },
    { name: "ESWATINI", coordinates: [31.5, -26.5] },
    { name: "LESOTHO", coordinates: [28.5, -29.5] },
    { name: "MALAWI", coordinates: [34, -13.5] },
    { name: "BURUNDI", coordinates: [29.5, -3.5] },
    { name: "DJIBOUTI", coordinates: [43, 11.5] },
    { name: "EQ. GUINEA", coordinates: [10, 2] },
    { name: "GAMBIA", coordinates: [-15, 13.5] },
    { name: "G-BISSAU", coordinates: [-14.5, 12.2] },
    { name: "COMOROS", coordinates: [44, -12] },
    { name: "CABO VERDE", coordinates: [-24, 16] },
];

// Build a coordinate lookup from labels
const LABEL_COORDS: Record<string, [number, number]> = {};
COUNTRY_LABELS.forEach(l => { LABEL_COORDS[l.name] = l.coordinates; });

// Map axis score to severity for pulsing dots
const getSeverity = (score: number): "high" | "medium" | "low" => {
    if (score <= 50) return "high";
    if (score <= 65) return "medium";
    return "low";
};

const geoUrl = "/world.json";

export default function AfricaMap({ selectedCountryCode, onSelectCountry, timeValue }: AfricaMapProps) {
    const { theme } = useTheme();
    const [tooltip, setTooltip] = useState({ show: false, content: "", data: null as CountryData | null, x: 0, y: 0 });
    const [position, setPosition] = useState({ coordinates: [0, 0], zoom: 1 });
    const [mapTheme, setMapTheme] = useState<MapTheme>("SOVEREIGNTY");
    const [countryDataMaster, setCountryDataMaster] = useState<CountryData[]>([]);

    React.useEffect(() => {
        async function fetchMapData() {
            const { data, error } = await supabase.from('countries').select('*');
            if (error) {
                console.error("Failed to load map data", error);
                return;
            }
            if (data) {
                // Merge live Postgres data with complex static arrays not yet ported to DB
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const merged = data.map((dbCountry: any) => {
                    const staticData = ALL_SOVEREIGN_DATA.find(s => s.country === dbCountry.country);
                    return {
                        ...staticData,
                        ...dbCountry,
                    };
                });
                setCountryDataMaster(merged as CountryData[]);
            }
        }
        fetchMapData();
    }, []);

    const getCountryData = (geoName: string) => {
        return countryDataMaster.find(c =>
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

    // Thematic map coloring logic
    const getThemeColor = (cData: CountryData | undefined, isDark: boolean): string => {
        if (!cData || mapTheme === "BASE") {
            return isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 1)"; // Neutral slate base
        }

        if (mapTheme === "SOVEREIGNTY") {
            let score = cData.axisScore;
            // Adjust score based on timeValue if provided
            if (timeValue) {
                const currentYear = new Date().getFullYear();
                const yearDiff = currentYear - timeValue;
                const trendMultiplier = cData.trend.startsWith('+') ? 1 : -1;
                score = Math.max(10, Math.min(100, score - (trendMultiplier * yearDiff * 1.8)));
            }
            if (score >= 80) return isDark ? "rgba(34, 197, 94, 0.7)" : "rgba(34, 197, 94, 0.6)";   // Green
            if (score >= 65) return isDark ? "rgba(34, 197, 94, 0.4)" : "rgba(34, 197, 94, 0.35)";  // Light green
            if (score >= 55) return isDark ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.35)";  // Yellow
            if (score >= 45) return isDark ? "rgba(249, 115, 22, 0.4)" : "rgba(249, 115, 22, 0.35)"; // Orange
            return isDark ? "rgba(239, 68, 68, 0.4)" : "rgba(239, 68, 68, 0.35)";                    // Red
        }

        if (mapTheme === "RESOURCE_WEALTH") {
            let wealth = cData.resourceWealth || 0;
            if (timeValue) {
                const currentYear = new Date().getFullYear();
                const yearDiff = currentYear - timeValue;
                // Assume resource valuation/discovery was historically lower
                wealth = Math.max(0, Math.min(100, wealth - (yearDiff * 1.5)));
            }
            if (wealth >= 85) return "rgba(180, 83, 9, 0.8)";     // Deep amber/bronze
            if (wealth >= 70) return "rgba(217, 119, 6, 0.7)";    // Amber
            if (wealth >= 50) return "rgba(245, 158, 11, 0.5)";   // Golden
            if (wealth >= 30) return "rgba(252, 211, 77, 0.4)";   // Pale yellow
            return isDark ? "rgba(30, 41, 59, 0.3)" : "rgba(241, 245, 249, 0.5)"; // Low resource neutral
        }

        if (mapTheme === "FDI_TREND") {
            let trendScore = 0;
            if (cData.trend.startsWith('++')) trendScore = 2;
            else if (cData.trend.startsWith('--')) trendScore = -2;
            else if (cData.trend.startsWith('+')) trendScore = 1;
            else if (cData.trend.startsWith('-')) trendScore = -1;

            if (timeValue) {
                const currentYear = new Date().getFullYear();
                const yearDiff = currentYear - timeValue;
                // Pseudo-random deterministic historical shift based on country name length
                // so some countries had better FDI in the past, some worse
                const shift = Math.floor(yearDiff / 2) * (cData.name.length % 2 === 0 ? -1 : 1);
                trendScore = Math.max(-2, Math.min(2, trendScore + shift));
            }

            if (trendScore >= 2) return "rgba(59, 130, 246, 0.7)"; // Strong positive (Blue)
            if (trendScore === 1) return "rgba(56, 189, 248, 0.5)";  // Positive (Light Blue)
            if (trendScore === 0) return isDark ? "rgba(148, 163, 184, 0.4)" : "rgba(148, 163, 184, 0.3)"; // Stable (Slate)
            if (trendScore === -1) return "rgba(244, 63, 94, 0.5)";   // Negative (Light Rose)
            if (trendScore <= -2) return "rgba(225, 29, 72, 0.7)";  // Strong negative (Rose)

            return isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 1)";
        }

        return isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 1)";
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
                    rotate: [-17, -3, 0],
                    scale: 350,
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
                                const heatFill = getThemeColor(cData, isDark);

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

                    {/* Animated Alert Markers (Only on SOVEREIGNTY map) */}
                    {mapTheme === "SOVEREIGNTY" && COUNTRY_LABELS.map((label, idx) => {
                        const countryData = countryDataMaster.find(d =>
                            d.name.toUpperCase().startsWith(label.name.split(".")[0].split(" ")[0]) ||
                            label.name.includes(d.country) ||
                            d.name.toUpperCase() === label.name
                        );
                        if (!countryData) return null;
                        const severity = getSeverity(countryData.axisScore);
                        const color = severity === "high" ? "#ef4444" : severity === "medium" ? "#f59e0b" : "#22c55e";
                        return (
                            <Marker key={`alert-${idx}`} coordinates={label.coordinates}>
                                <circle r={2} fill={color} opacity={0.9} />
                                <circle r={2} fill="none" stroke={color} strokeWidth={0.8} opacity={0.5}>
                                    <animate attributeName="r" from="2" to="8" dur="2.5s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from="0.5" to="0" dur="2.5s" repeatCount="indefinite" />
                                </circle>
                            </Marker>
                        );
                    })}

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

            {/* Dynamic Map Legend based on theme */}
            <div className="absolute bottom-4 left-4 bg-panel/80 border border-border rounded-lg p-2.5 backdrop-blur-md shadow-lg transition-all pointer-events-none">
                <div className="text-[8px] font-mono text-slate-light mb-1.5 tracking-wider uppercase">{mapTheme.replace('_', ' ')} MAP</div>

                {mapTheme === "SOVEREIGNTY" && (
                    <>
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
                    </>
                )}

                {mapTheme === "RESOURCE_WEALTH" && (
                    <>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-2.5 rounded-sm bg-slate-500/30" />
                            <div className="w-4 h-2.5 rounded-sm bg-amber-200/50" />
                            <div className="w-4 h-2.5 rounded-sm bg-amber-400/50" />
                            <div className="w-4 h-2.5 rounded-sm bg-amber-600/70" />
                            <div className="w-4 h-2.5 rounded-sm bg-amber-700/80" />
                        </div>
                        <div className="flex justify-between text-[7px] font-mono text-slate-light mt-0.5">
                            <span>LOW</span>
                            <span>HIGH WEALTH</span>
                        </div>
                    </>
                )}

                {mapTheme === "FDI_TREND" && (
                    <>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-2.5 rounded-sm bg-rose-600/70" />
                            <div className="w-4 h-2.5 rounded-sm bg-rose-400/50" />
                            <div className="w-4 h-2.5 rounded-sm bg-slate-400/50" />
                            <div className="w-4 h-2.5 rounded-sm bg-sky-400/50" />
                            <div className="w-4 h-2.5 rounded-sm bg-blue-500/70" />
                        </div>
                        <div className="flex justify-between text-[7px] font-mono text-slate-light mt-0.5">
                            <span>DECLINING</span>
                            <span>GROWING</span>
                        </div>
                    </>
                )}

                {mapTheme === "BASE" && (
                    <div className="flex justify-between text-[7px] font-mono text-slate-light mt-0.5 w-[88px]">
                        <span>TOPOLOGY BASE</span>
                    </div>
                )}
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

            {/* Map Theme Toggle Button */}
            <div className="absolute top-24 right-4 group/theme z-50">
                <button className="flex items-center gap-2 bg-panel/80 p-2 border border-border backdrop-blur-md rounded-lg shadow-lg hover:bg-background transition-colors pointer-events-auto">
                    <span className="text-[10px] font-bold font-mono text-foreground hidden sm:block">THEME</span>
                    <Layers className="w-4 h-4 text-cobalt" />
                </button>

                {/* Dropdown Menu - Opens to the left side of the button */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-panel/95 border border-border rounded-lg shadow-xl opacity-0 invisible group-hover/theme:opacity-100 group-hover/theme:visible transition-all flex flex-col overflow-hidden backdrop-blur-xl">
                    <button
                        onClick={() => setMapTheme("SOVEREIGNTY")}
                        className={`text-right px-3 py-2 text-[10px] font-mono border-r-2 transition-all ${mapTheme === "SOVEREIGNTY" ? "border-green-500 bg-background/50 text-foreground font-bold" : "border-transparent text-slate-light hover:bg-background/30 hover:text-foreground"}`}
                    >
                        ⚡ SOVEREIGNTY HEAT
                    </button>
                    <button
                        onClick={() => setMapTheme("RESOURCE_WEALTH")}
                        className={`text-right px-3 py-2 text-[10px] font-mono border-r-2 transition-all ${mapTheme === "RESOURCE_WEALTH" ? "border-amber-500 bg-background/50 text-foreground font-bold" : "border-transparent text-slate-light hover:bg-background/30 hover:text-foreground"}`}
                    >
                        💎 RESOURCE WEALTH
                    </button>
                    <button
                        onClick={() => setMapTheme("FDI_TREND")}
                        className={`text-right px-3 py-2 text-[10px] font-mono border-r-2 transition-all ${mapTheme === "FDI_TREND" ? "border-blue-500 bg-background/50 text-foreground font-bold" : "border-transparent text-slate-light hover:bg-background/30 hover:text-foreground"}`}
                    >
                        📈 FOREIGN INVESTMENT (FDI)
                    </button>
                    <div className="h-px bg-border/50 my-1 mx-2" />
                    <button
                        onClick={() => setMapTheme("BASE")}
                        className={`text-right px-3 py-2 text-[10px] font-mono border-r-2 transition-all ${mapTheme === "BASE" ? "border-slate-400 bg-background/50 text-foreground font-bold" : "border-transparent text-slate-light hover:bg-background/30 hover:text-foreground"}`}
                    >
                        🗺️ BASE TOPOLOGY
                    </button>
                </div>
            </div>

            {/* Rich Hover Tooltip — centered above cursor */}
            {tooltip.show && (
                <div
                    style={{
                        position: "fixed",
                        left: Math.max(8, Math.min(tooltip.x - 112, window.innerWidth - 232)),
                        top: Math.max(4, tooltip.y - 180),
                        zIndex: 1000,
                        pointerEvents: "none",
                        transform: "translateZ(0)"
                    }}
                    className="w-56 bg-zinc-900 dark:bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.5)] text-white pointer-events-none"
                >
                    <div className="flex items-center gap-2 border-b border-zinc-700 pb-2 mb-2">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${(tooltip.data?.axisScore || 0) > 70 ? 'bg-green-500' : 'bg-red-500'}`} />
                        <h4 className="text-sm font-bold tracking-wider uppercase">{tooltip.content}</h4>
                    </div>

                    <div className="space-y-2 font-mono text-[10px]">
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">SOVEREIGNTY SCORE</span>
                            <span className={`font-bold ${(tooltip.data?.axisScore || 0) > 70 ? 'text-green-500' : 'text-red-500'}`}>{tooltip.data?.axisScore}/100</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">RESOURCE WEALTH</span>
                            <span className="font-bold text-amber-500">{tooltip.data?.resourceWealth}/100</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {tooltip.data?.keyResources.slice(0, 3).map((r, i) => (
                                <span key={i} className="text-[8px] px-1 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-400">{r}</span>
                            ))}
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">KEY INITIATIVE</span>
                            <span className="text-blue-400 font-bold max-w-32 truncate text-right">{tooltip.data?.highlights[0]}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">FDI TREND (QOQ)</span>
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
