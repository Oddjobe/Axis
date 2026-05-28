"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    X, Zap, TrainFront, Pickaxe, HeartPulse, Wheat, Factory,
    Building2, Ship, ArrowLeft, AlertTriangle, TrendingUp, Users, LayoutGrid,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";
import { isoToFlag } from "@/lib/flags";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
type ProjectStatus = "ACTIVE" | "COMPLETED" | "PLANNED" | "CONSTRUCTION";

interface Sector {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentText: string;
    accentBg: string;
    accentBorder: string;
    solidBg: string;
    thesis: string;
    investment: string;
    growth: string;
    exposure: { metric: string; level: RiskLevel; drivers: string[] };
    leaders: { iso: string; note: string }[];
    projects: { name: string; iso: string; status: ProjectStatus }[];
    dynamics: string[];
}

const SECTORS: Sector[] = [
    {
        id: "energy",
        label: "ENERGY",
        icon: Zap,
        accentText: "text-amber-500",
        accentBg: "bg-amber-500/10",
        accentBorder: "border-amber-500/40",
        solidBg: "bg-amber-500",
        thesis: "Powering industrialization while breaking petro-dependency.",
        investment: "$48B/yr",
        growth: "+9.2%",
        exposure: {
            metric: "63% of new generation built by foreign EPCs",
            level: "HIGH",
            drivers: [
                "Chinese & Gulf EPC dominance in grid construction",
                "Oil majors retain controlling upstream equity",
                "Limited domestic transmission ownership",
            ],
        },
        leaders: [
            { iso: "NGA", note: "Oil & gas anchor; Dangote refinery onshoring fuel" },
            { iso: "DZA", note: "Pipeline gas exporter to the EU" },
            { iso: "ETH", note: "GERD hydro powerhouse reshaping regional grid" },
            { iso: "EGY", note: "Gas hub pivoting hard into solar & green H2" },
            { iso: "AGO", note: "Deep-water crude; gas monetization push" },
        ],
        projects: [
            { name: "Grand Ethiopian Renaissance Dam", iso: "ETH", status: "ACTIVE" },
            { name: "Dangote Petroleum Refinery", iso: "NGA", status: "ACTIVE" },
            { name: "West African Gas Pipeline", iso: "NGA", status: "ACTIVE" },
            { name: "Ethiopia-Kenya Electricity Highway", iso: "ETH", status: "ACTIVE" },
        ],
        dynamics: [
            "GERD reaches full generation, reshaping Nile-basin power exports.",
            "Green-hydrogen pilots in Namibia & Egypt attract EU offtake deals.",
            "Grid availability remains the binding constraint on manufacturing.",
        ],
    },
    {
        id: "transport",
        label: "TRANSPORT",
        icon: TrainFront,
        accentText: "text-sky-500",
        accentBg: "bg-sky-500/10",
        accentBorder: "border-sky-500/40",
        solidBg: "bg-sky-500",
        thesis: "Rail and road corridors unlocking landlocked trade.",
        investment: "$35B/yr",
        growth: "+7.1%",
        exposure: {
            metric: "Flagship rail concessions majority foreign-operated",
            level: "MEDIUM",
            drivers: [
                "SGR debt & operations tied to Chinese lenders",
                "Cross-border interoperability gaps persist",
                "Rolling stock imported with little local assembly",
            ],
        },
        leaders: [
            { iso: "KEN", note: "SGR + LAPSSET corridor backbone" },
            { iso: "MAR", note: "Africa's first high-speed rail line (Al Boraq)" },
            { iso: "EGY", note: "Continental high-speed rail build-out" },
            { iso: "ETH", note: "Electrified Addis-Djibouti rail link" },
            { iso: "DZA", note: "East-West motorway spine" },
        ],
        projects: [
            { name: "Mombasa-Nairobi Standard Gauge Railway", iso: "KEN", status: "ACTIVE" },
            { name: "Egypt High-Speed Rail", iso: "EGY", status: "CONSTRUCTION" },
            { name: "Nairobi Expressway", iso: "KEN", status: "ACTIVE" },
            { name: "Algeria East-West Motorway", iso: "DZA", status: "COMPLETED" },
        ],
        dynamics: [
            "AfCFTA pushes corridor interoperability up the agenda.",
            "SGR extension economics under renegotiation with lenders.",
            "Electrified rail cuts diaspora-mineral transit costs to ports.",
        ],
    },
    {
        id: "mining",
        label: "MINING",
        icon: Pickaxe,
        accentText: "text-orange-500",
        accentBg: "bg-orange-500/10",
        accentBorder: "border-orange-500/40",
        solidBg: "bg-orange-500",
        thesis: "From extraction to value-added processing sovereignty.",
        investment: "$52B/yr",
        growth: "+11.4%",
        exposure: {
            metric: "80%+ of cobalt/copper offtake foreign-controlled",
            level: "HIGH",
            drivers: [
                "DRC cobalt overwhelmingly refined in China",
                "Concession terms structurally favor majors",
                "Minimal in-country refining capacity",
            ],
        },
        leaders: [
            { iso: "COD", note: "Cobalt, copper, coltan & lithium epicentre" },
            { iso: "ZAF", note: "PGM and gold processing base" },
            { iso: "GIN", note: "World-class bauxite; Simandou iron ore" },
            { iso: "BWA", note: "Diamond beneficiation leader" },
            { iso: "ZMB", note: "Copperbelt revival & smelting" },
        ],
        projects: [
            { name: "Simandou Iron Ore & Rail", iso: "GIN", status: "CONSTRUCTION" },
            { name: "Manono Lithium Refinery", iso: "COD", status: "CONSTRUCTION" },
            { name: "Kamoa-Kakula Copper Complex", iso: "COD", status: "ACTIVE" },
            { name: "Kalahari Manganese Field", iso: "ZAF", status: "ACTIVE" },
        ],
        dynamics: [
            "DRC mineral-sovereignty law pushes domestic refining mandates.",
            "Simandou first ore reroutes global iron-ore flows.",
            "Lithium beneficiation contracts signed with EU battery consortium.",
        ],
    },
    {
        id: "healthcare",
        label: "HEALTHCARE",
        icon: HeartPulse,
        accentText: "text-rose-500",
        accentBg: "bg-rose-500/10",
        accentBorder: "border-rose-500/40",
        solidBg: "bg-rose-500",
        thesis: "Building pharmaceutical sovereignty after the vaccine gap.",
        investment: "$18B/yr",
        growth: "+6.3%",
        exposure: {
            metric: "99% of vaccines & 70-90% of medicines imported",
            level: "HIGH",
            drivers: [
                "Near-total import dependency on active ingredients (APIs)",
                "Foreign IP licensing constrains local production",
                "Thin cold-chain & regulatory harmonization capacity",
            ],
        },
        leaders: [
            { iso: "ZAF", note: "Aspen sterile fill-finish & mRNA hub" },
            { iso: "RWA", note: "BioNTech mRNA manufacturing facility" },
            { iso: "SEN", note: "Institut Pasteur Dakar vaccine production" },
            { iso: "EGY", note: "Largest regional generics manufacturing" },
            { iso: "MAR", note: "Sensyo Pharmatech vaccine fill-finish" },
        ],
        projects: [
            { name: "BioNTech mRNA Facility", iso: "RWA", status: "CONSTRUCTION" },
            { name: "Aspen Sterile Manufacturing", iso: "ZAF", status: "ACTIVE" },
            { name: "Institut Pasteur Vaccine Hub", iso: "SEN", status: "ACTIVE" },
            { name: "Egypt Vaccine City (Gypto Pharma)", iso: "EGY", status: "PLANNED" },
        ],
        dynamics: [
            "Afreximbank backs the African Pharmaceutical Manufacturing push.",
            "mRNA tech-transfer hub scales across Cape Town & Kigali.",
            "API localization remains the decisive strategic gap.",
        ],
    },
    {
        id: "agriculture",
        label: "AGRICULTURE",
        icon: Wheat,
        accentText: "text-lime-500",
        accentBg: "bg-lime-500/10",
        accentBorder: "border-lime-500/40",
        solidBg: "bg-lime-500",
        thesis: "Feeding 2.5bn by 2050 and ending food-import dependency.",
        investment: "$40B/yr",
        growth: "+5.8%",
        exposure: {
            metric: "Net food importer; ~$55B annual food import bill",
            level: "HIGH",
            drivers: [
                "Fertilizer roughly 80% imported",
                "Acute climate-shock and drought exposure",
                "Cash-crop value (cocoa, coffee) captured offshore",
            ],
        },
        leaders: [
            { iso: "NGA", note: "Largest agricultural economy; fertilizer onshoring" },
            { iso: "CIV", note: "World's #1 cocoa producer, moving to grinding" },
            { iso: "ETH", note: "Coffee origin & cereals scale-up" },
            { iso: "EGY", note: "Nile irrigation & New Delta reclamation" },
            { iso: "KEN", note: "Horticulture & cut-flower export engine" },
        ],
        projects: [
            { name: "Dangote Fertilizer Plant", iso: "NGA", status: "ACTIVE" },
            { name: "Cote d'Ivoire Cocoa Processing", iso: "CIV", status: "CONSTRUCTION" },
            { name: "Egypt New Delta Mega-Farm", iso: "EGY", status: "CONSTRUCTION" },
            { name: "Galana-Kulalu Food Scheme", iso: "KEN", status: "PLANNED" },
        ],
        dynamics: [
            "Domestic fertilizer output cuts the continent's largest import line.",
            "Cocoa grinding capacity rises to capture downstream value.",
            "Climate-smart irrigation reclamation expands arable land.",
        ],
    },
    {
        id: "manufacturing",
        label: "MANUFACTURING",
        icon: Factory,
        accentText: "text-emerald-500",
        accentBg: "bg-emerald-500/10",
        accentBorder: "border-emerald-500/40",
        solidBg: "bg-emerald-500",
        thesis: "Industrializing beyond raw exports under AfCFTA.",
        investment: "$44B/yr",
        growth: "+8.0%",
        exposure: {
            metric: "Manufacturing only ~12% of continental GDP",
            level: "MEDIUM",
            drivers: [
                "Heavy dependence on imported intermediate goods",
                "Energy-cost disadvantage versus Asian competitors",
                "Foreign OEM ownership of flagship auto plants",
            ],
        },
        leaders: [
            { iso: "ZAF", note: "Diversified automotive & industrial base" },
            { iso: "MAR", note: "Auto & aerospace export hub to the EU" },
            { iso: "EGY", note: "Suez industrial zones & heavy industry" },
            { iso: "NGA", note: "Dangote industrial & petrochemical complex" },
            { iso: "TUN", note: "Electrical components & mechanical parts" },
        ],
        projects: [
            { name: "Dangote Petrochemical Complex", iso: "NGA", status: "ACTIVE" },
            { name: "Tanger Automotive Cluster", iso: "MAR", status: "ACTIVE" },
            { name: "Suez Canal Economic Zone", iso: "EGY", status: "ACTIVE" },
            { name: "Lobito Industrial Park", iso: "AGO", status: "PLANNED" },
        ],
        dynamics: [
            "AfCFTA Rules of Origin unlock intra-African component trade.",
            "Morocco overtakes for vehicle exports into Europe.",
            "Special Economic Zones multiply across the continent.",
        ],
    },
    {
        id: "infrastructure",
        label: "INFRASTRUCTURE",
        icon: Building2,
        accentText: "text-cobalt",
        accentBg: "bg-cobalt/10",
        accentBorder: "border-cobalt/40",
        solidBg: "bg-cobalt",
        thesis: "The hard backbone of sovereignty: ports, power and cities.",
        investment: "$68B/yr",
        growth: "+6.6%",
        exposure: {
            metric: "Majority of mega-builds externally financed",
            level: "MEDIUM",
            drivers: [
                "Debt-for-infrastructure balance-sheet exposure",
                "Foreign EPC & design control of flagship builds",
                "Chronic maintenance-financing gaps",
            ],
        },
        leaders: [
            { iso: "EGY", note: "New Administrative Capital & canal works" },
            { iso: "NGA", note: "Lekki port + power & housing build-out" },
            { iso: "KEN", note: "Expressways & urban transit upgrades" },
            { iso: "AGO", note: "Lobito Corridor reconstruction" },
            { iso: "MAR", note: "Integrated port-rail-road network" },
        ],
        projects: [
            { name: "New Administrative Capital", iso: "EGY", status: "PLANNED" },
            { name: "Suez Canal Expansion", iso: "EGY", status: "ACTIVE" },
            { name: "Lobito Corridor Railway", iso: "AGO", status: "ACTIVE" },
            { name: "Lekki Deep Sea Port", iso: "NGA", status: "ACTIVE" },
        ],
        dynamics: [
            "Corridor strategy links mineral belts directly to deep-water ports.",
            "Debt sustainability reshapes financing toward PPP & local capital.",
            "New-city projects test fiscal capacity and demand assumptions.",
        ],
    },
    {
        id: "logistics",
        label: "LOGISTICS",
        icon: Ship,
        accentText: "text-cyan-500",
        accentBg: "bg-cyan-500/10",
        accentBorder: "border-cyan-500/40",
        solidBg: "bg-cyan-500",
        thesis: "Controlling chokepoints, ports and the AfCFTA trade spine.",
        investment: "$30B/yr",
        growth: "+9.9%",
        exposure: {
            metric: "Key ports run under foreign concessions",
            level: "HIGH",
            drivers: [
                "Terminals operated by DP World, China Merchants et al.",
                "Red Sea / Suez chokepoint vulnerability",
                "Fragmented customs regimes & corridor friction",
            ],
        },
        leaders: [
            { iso: "MAR", note: "Tanger Med — Africa's largest container port" },
            { iso: "DJI", note: "Bab-el-Mandeb gateway & logistics hub" },
            { iso: "EGY", note: "Suez Canal — ~12% of global trade transit" },
            { iso: "ZAF", note: "Durban — busiest sub-Saharan port" },
            { iso: "NAM", note: "Walvis Bay corridor to the interior" },
        ],
        projects: [
            { name: "Walvis Bay Container Terminal", iso: "NAM", status: "COMPLETED" },
            { name: "Lekki Deep Sea Port", iso: "NGA", status: "ACTIVE" },
            { name: "Dakhla Atlantic Port", iso: "MAR", status: "PLANNED" },
            { name: "Lobito Corridor Railway", iso: "AGO", status: "ACTIVE" },
        ],
        dynamics: [
            "Tanger Med cements Africa's largest container throughput.",
            "Lobito Corridor reroutes DRC/Zambia minerals to the Atlantic.",
            "Red Sea disruptions inflate insurance and reroute volumes.",
        ],
    },
];

const COUNTRY_BY_ISO: Record<string, { name: string; axisScore: number; status: string }> = {};
ALL_SOVEREIGN_DATA.forEach((c) => {
    COUNTRY_BY_ISO[c.country] = { name: c.name, axisScore: c.axisScore, status: c.status };
});

function getCountryByIso(iso: string) {
    return COUNTRY_BY_ISO[iso] || null;
}

const RISK_STYLES: Record<RiskLevel, string> = {
    HIGH: "text-red-500 border-red-500/40 bg-red-500/10",
    MEDIUM: "text-amber-500 border-amber-500/40 bg-amber-500/10",
    LOW: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10",
};

function statusColor(status: ProjectStatus): string {
    switch (status) {
        case "ACTIVE": return "text-emerald-500";
        case "COMPLETED": return "text-cobalt";
        case "CONSTRUCTION": return "text-amber-500";
        case "PLANNED": return "text-slate-light";
        default: return "text-foreground";
    }
}

export default function SectorIntelligenceModal({ isOpen, onClose }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme === "system" || !theme;

    if (typeof window === "undefined") return null;

    const subText = isDark ? "text-slate-light" : "text-slate-600";
    const selected = SECTORS.find((s) => s.id === selectedId) || null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-panel border border-border rounded-xl w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <LayoutGrid className="w-5 h-5 text-violet-500" />
                                <h2 className="text-lg font-black tracking-widest uppercase">SECTOR INTELLIGENCE</h2>
                                <span className={`hidden sm:inline text-[10px] font-mono uppercase tracking-wider ${subText}`}>
                                    8 sectors · Africa
                                </span>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {!selected ? (
                            /* OVERVIEW MODE */
                            <div className="flex-1 overflow-y-auto p-5">
                                <p className={`mb-4 text-xs font-mono uppercase tracking-wider ${subText}`}>
                                    Select a sector to drill into leaders, projects, investment & sovereignty exposure
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {SECTORS.map((s) => {
                                        const Icon = s.icon;
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => setSelectedId(s.id)}
                                                className={`group text-left rounded-xl border ${s.accentBorder} ${s.accentBg} p-4 transition-all hover:scale-[1.02] hover:shadow-lg`}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Icon className={`w-5 h-5 ${s.accentText}`} />
                                                    <span className="font-black tracking-wider text-sm">{s.label}</span>
                                                </div>
                                                <p className={`text-[11px] leading-snug mb-3 ${subText}`}>{s.thesis}</p>
                                                <div className="flex items-center justify-between text-[10px] font-mono">
                                                    <span className={`font-bold ${s.accentText}`}>{s.investment}</span>
                                                    <span className="flex items-center gap-0.5 text-emerald-500 font-bold">
                                                        <TrendingUp className="w-3 h-3" />{s.growth}
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex items-center justify-between">
                                                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${RISK_STYLES[s.exposure.level]}`}>
                                                        <AlertTriangle className="w-2.5 h-2.5" />{s.exposure.level} EXPOSURE
                                                    </span>
                                                    <span className={`flex items-center gap-1 text-[9px] font-mono ${subText}`}>
                                                        <Users className="w-3 h-3" />{s.leaders.length}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            /* DETAIL MODE */
                            <div className="flex-1 flex min-h-0">
                                {/* Sidebar */}
                                <div className="hidden md:flex flex-col w-48 shrink-0 border-r border-border overflow-y-auto p-2 gap-1">
                                    <button
                                        onClick={() => setSelectedId(null)}
                                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold tracking-wider transition-colors hover:bg-white/5 ${subText}`}
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />OVERVIEW
                                    </button>
                                    <div className="h-px bg-border my-1" />
                                    {SECTORS.map((s) => {
                                        const Icon = s.icon;
                                        const active = s.id === selected.id;
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => setSelectedId(s.id)}
                                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold tracking-wider transition-colors ${
                                                    active ? `${s.accentBg} ${s.accentText} border ${s.accentBorder}` : `hover:bg-white/5 ${subText}`
                                                }`}
                                            >
                                                <Icon className={`w-3.5 h-3.5 ${active ? s.accentText : ""}`} />
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Main panel */}
                                <div className="flex-1 overflow-y-auto p-5">
                                    {/* mobile back */}
                                    <button
                                        onClick={() => setSelectedId(null)}
                                        className={`md:hidden mb-3 flex items-center gap-1 text-[11px] font-bold ${subText}`}
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />OVERVIEW
                                    </button>

                                    {/* Header */}
                                    <div className="flex items-center gap-3 mb-1">
                                        <selected.icon className={`w-6 h-6 ${selected.accentText}`} />
                                        <h3 className="text-xl font-black tracking-wider">{selected.label}</h3>
                                    </div>
                                    <p className={`text-sm mb-5 ${subText}`}>{selected.thesis}</p>

                                    {/* KPI row */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                                        <div className="rounded-xl border border-border bg-background/40 p-3">
                                            <p className={`text-[9px] font-mono uppercase tracking-wider ${subText}`}>Annual Investment</p>
                                            <p className={`text-lg font-black ${selected.accentText}`}>{selected.investment}</p>
                                        </div>
                                        <div className="rounded-xl border border-border bg-background/40 p-3">
                                            <p className={`text-[9px] font-mono uppercase tracking-wider ${subText}`}>Growth</p>
                                            <p className="text-lg font-black text-emerald-500 flex items-center gap-1">
                                                <TrendingUp className="w-4 h-4" />{selected.growth}
                                            </p>
                                        </div>
                                        <div className={`rounded-xl border p-3 ${RISK_STYLES[selected.exposure.level]}`}>
                                            <p className="text-[9px] font-mono uppercase tracking-wider opacity-80">Sovereignty Exposure</p>
                                            <p className="text-sm font-black flex items-center gap-1">
                                                <AlertTriangle className="w-3.5 h-3.5" />{selected.exposure.level}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Exposure detail */}
                                    <div className="mb-6">
                                        <p className={`text-[10px] font-mono uppercase tracking-wider mb-1.5 ${subText}`}>Exposure Profile</p>
                                        <p className="text-sm font-bold mb-2">{selected.exposure.metric}</p>
                                        <ul className="space-y-1">
                                            {selected.exposure.drivers.map((d, i) => (
                                                <li key={i} className={`flex items-start gap-2 text-xs ${subText}`}>
                                                    <span className="mt-1 w-1 h-1 rounded-full bg-red-500 shrink-0" />{d}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Two columns: leaders + projects */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                        {/* Leaders */}
                                        <div>
                                            <p className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${subText}`}>Continental Leaders</p>
                                            <div className="space-y-2.5">
                                                {selected.leaders.map((l) => {
                                                    const country = getCountryByIso(l.iso);
                                                    const score = country?.axisScore ?? 0;
                                                    return (
                                                        <div key={l.iso} className="rounded-lg border border-border bg-background/40 p-2.5">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="flex items-center gap-1.5 text-xs font-bold">
                                                                    <span>{isoToFlag(l.iso)}</span>
                                                                    {country?.name || l.iso}
                                                                </span>
                                                                {country ? (
                                                                    <span className={`text-[10px] font-mono font-bold ${selected.accentText}`}>{score}/100</span>
                                                                ) : (
                                                                    <span className={`text-[9px] font-mono ${subText}`}>no score</span>
                                                                )}
                                                            </div>
                                                            {country && (
                                                                <div className="h-1 rounded-full bg-border overflow-hidden mb-1.5">
                                                                    <div className={`h-full rounded-full ${selected.solidBg}`} style={{ width: `${score}%` }} />
                                                                </div>
                                                            )}
                                                            <p className={`text-[11px] leading-snug ${subText}`}>{l.note}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Projects */}
                                        <div>
                                            <p className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${subText}`}>Flagship Projects</p>
                                            <div className="space-y-2">
                                                {selected.projects.map((p, i) => {
                                                    const country = getCountryByIso(p.iso);
                                                    return (
                                                        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-2.5">
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold truncate">{p.name}</p>
                                                                <p className={`text-[10px] font-mono ${subText}`}>
                                                                    {isoToFlag(p.iso)} {country?.name || p.iso}
                                                                </p>
                                                            </div>
                                                            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider ${statusColor(p.status)}`}>{p.status}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dynamics */}
                                    <div>
                                        <p className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${subText}`}>Key Dynamics</p>
                                        <ul className="space-y-1.5">
                                            {selected.dynamics.map((d, i) => (
                                                <li key={i} className="flex items-start gap-2 text-xs">
                                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${selected.solidBg}`} />
                                                    <span className={subText}>{d}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
