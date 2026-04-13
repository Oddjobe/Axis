"use client"

import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Search,
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  AlertCircle,
  Clock,
  ChevronRight,
  ArrowUpRight,
  ShieldAlert,
  Activity,
  Share2,
  Combine,
  Users,
  Info,
  BarChart3,
  Sun,
  Moon,
  SlidersHorizontal,
  X,
  List,
  Map as LucideMap,
  Check,
  Settings2,
  BrainCircuit
} from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import AfcftaMatrix from "@/components/afcfta-matrix";
import ErrorBoundary from "@/components/error-boundary";

const AfricaMap = dynamic(() => import("@/components/africa-map"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex flex-col gap-3 items-center justify-center text-cobalt font-mono text-[10px]"><div className="w-6 h-6 border-border-cobalt/30 border-t-cobalt rounded-full animate-spin" />INITIALIZING GEO ENGINE...</div>
});
import FrictionEngine from "@/components/friction-engine";
import ContinentalGoalsTicker from "@/components/continental-goals-ticker";
import MissionModal from "@/components/mission-modal";
import AnalyticsModal from "@/components/analytics-modal";
import AiNexusModal from "@/components/ai-nexus-modal";
import AiBriefingModal from "@/components/ai-briefing-modal";
import ComparativeAnalyticsModal from "@/components/comparative-analytics-modal";
import TradeIntelligenceModal from "@/components/trade-intelligence-modal";
import SearchCommand from "@/components/search-command";
import CommodityTicker from "@/components/commodity-ticker";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";
import { Language, useTranslation } from "@/lib/i18n";
import { isoToFlag } from "@/lib/flags";
import type { CountryData } from "@/components/country-dossier-modal";
import kpiData from "@/lib/kpi-data.json";
import { AnimatePresence, motion } from "framer-motion";
import { useRealtimeAlerts } from "@/lib/use-realtime-alerts";
const TOTAL_POPULATION = 1_444; // ~1.44 billion

export default function Home() {
  const [mode, setMode] = useState<"SOVEREIGNTY" | "OUTSIDE INFLUENCE">("SOVEREIGNTY");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [missionOpen, setMissionOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [aiNexusOpen, setAiNexusOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [comparativeOpen, setComparativeOpen] = useState(false);
  const [tradeIntelOpen, setTradeIntelOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "index" | "intel">("map");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const [timeValue, setTimeValue] = useState(currentYear);
  const [language, setLanguage] = useState<Language>("en");
  const [countryDataMaster, setCountryDataMaster] = useState<CountryData[]>([]);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { newAlertCount, clearNewAlerts } = useRealtimeAlerts();
  const [searchOpen, setSearchOpen] = useState(false);

  const openTool = useCallback((action: string) => {
    switch (action) {
      case "mission": setMissionOpen(true); break;
      case "analytics": setAnalyticsOpen(true); break;
      case "nexus": setAiNexusOpen(true); break;
      case "briefing": setBriefingOpen(true); break;
      case "compare": setComparativeOpen(true); break;
      case "trade": setTradeIntelOpen(true); break;
    }
  }, []);

  const t = useTranslation(language);

  useEffect(() => {
    setMounted(true);

    // Read ?compare=NGA,GHA,KEN from URL to auto-open compare modal
    const params = new URLSearchParams(window.location.search);
    const compareParam = params.get("compare");
    if (compareParam) {
      const codes = compareParam.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        setSelectedCodes(codes);
        setComparativeOpen(true);
      }
    }

    // Fetch live data, cache in IndexedDB for offline use, or use static fallback
    import("@/lib/supabase").then(async ({ supabase }) => {
      try {
        const { data, error } = await supabase.from('countries').select('*');
        if (!error && data) {
          const merged = data.map((dbCountry: any) => {
            const staticData = ALL_SOVEREIGN_DATA.find(s => s.country === dbCountry.id);
            return { ...staticData, ...dbCountry, country: dbCountry.id };
          });
          setCountryDataMaster(merged as CountryData[]);
          // Cache for offline use
          import("@/lib/use-offline-cache").then(({ cacheData }) => {
            cacheData('countryDataMaster', merged);
          });
        } else {
          throw new Error('Supabase fetch failed');
        }
      } catch {
        // Try IndexedDB cache
        try {
          const { getCachedData } = await import("@/lib/use-offline-cache");
          const cached = await getCachedData<CountryData[]>('countryDataMaster');
          if (cached) {
            setCountryDataMaster(cached);
          } else {
            setCountryDataMaster(ALL_SOVEREIGN_DATA as CountryData[]);
          }
        } catch {
          setCountryDataMaster(ALL_SOVEREIGN_DATA as CountryData[]);
        }
      }
    }).catch(() => setCountryDataMaster(ALL_SOVEREIGN_DATA as CountryData[]));
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      // Ctrl/Cmd+K — always open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Skip other shortcuts when typing in inputs
      if (isInput) return;

      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const selectedCountries = selectedCodes
    .map(code => countryDataMaster.find(c => c.country === code))
    .filter(Boolean) as CountryData[];

  // Function to parse strings like "35.6M" or "1.2B" to numbers
  const parsePop = (popStr: any) => {
    if (typeof popStr === 'number') return popStr;
    if (!popStr || typeof popStr !== 'string') return 0;
    if (popStr.endsWith('B')) return parseFloat(popStr) * 1000;
    if (popStr.endsWith('M')) return parseFloat(popStr);
    return parseFloat(popStr) || 0;
  };

  const totalPopMillions = selectedCountries.reduce((sum, c) => sum + parsePop(c.population), 0);

  const displayPop = selectedCountries.length > 0
    ? totalPopMillions >= 1000 ? `${(totalPopMillions / 1000).toFixed(2)} B` : `${totalPopMillions.toFixed(1)} M`
    : `${(TOTAL_POPULATION / 1000).toFixed(2)} B`;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ErrorBoundary>
        <CommodityTicker />
      </ErrorBoundary>
      {/* Top Navigation / Dashboard Header */}
      <header className="h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6 border-b border-border bg-panel backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 lg:gap-4">
          <Globe className="w-5 h-5 lg:w-6 lg:h-6 text-cobalt" />
          <h1 className="text-base lg:text-xl font-bold tracking-widest uppercase">
            {t("dashboard_title")}
          </h1>
          <div className="h-5 w-px bg-border mx-1 hidden sm:block" />
          <span className="text-[9px] lg:text-xs font-mono text-slate-light dark:text-zinc-400 tracking-wider hidden sm:inline">
            {t("subtitle")}
          </span>
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          {/* Group 1: Population */}
          <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1 lg:py-1.5 bg-background border border-border rounded-lg text-[10px] lg:text-xs font-mono shadow-sm">
            {selectedCountries.length === 1 ? <span className="text-base leading-none">{isoToFlag(selectedCountries[0].country)}</span> : <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-zinc-400" />}
            <span className="text-slate-light hidden sm:inline">
              {selectedCountries.length === 1 ? selectedCountries[0].name.toUpperCase() : selectedCountries.length > 1 ? t("selected_population") : t("population")}
            </span>
            <span className="font-bold text-zinc-400 dark:text-zinc-200 ml-0.5 lg:ml-1">{displayPop}</span>
          </div>

          {/* Sovereignty Alert Index */}
          {countryDataMaster.length > 0 && (() => {
            const axisIndex = Math.round(countryDataMaster.reduce((sum, c) => sum + (c.axisScore || 0), 0) / countryDataMaster.length);
            const indexColor = axisIndex >= 70 ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' 
              : axisIndex >= 50 ? 'text-amber-500 border-amber-500/20 bg-amber-500/5' 
              : 'text-red-500 border-red-500/20 bg-red-500/5';
            return (
              <div className={`hidden sm:flex items-center gap-1.5 px-2 lg:px-3 py-1 lg:py-1.5 border rounded-lg text-[10px] lg:text-xs font-mono shadow-sm ${indexColor}`}>
                <Activity className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                <div className="flex flex-col leading-none">
                  <span className="text-[7px] lg:text-[8px] font-bold opacity-60 uppercase tracking-tighter">AXIS INDEX</span>
                  <span className="font-bold leading-tight">{axisIndex}/100</span>
                </div>
              </div>
            );
          })()}

          <div className="hidden lg:flex h-6 w-px bg-border/50" />

          {/* Group 2: Capital Flow KPIs */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[10px] font-mono shadow-sm group hover:bg-emerald-500/10 transition-colors">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-[8px] text-emerald-500/60 font-bold leading-none uppercase tracking-tighter">Inbound (FDI)</span>
                <span className="font-bold text-emerald-500 leading-tight">{kpiData.fdi}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/5 border border-red-500/20 rounded-lg text-[10px] font-mono shadow-sm group hover:bg-red-500/10 transition-colors">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <div className="flex flex-col">
                <span className="text-[8px] text-red-500/60 font-bold leading-none uppercase tracking-tighter">Capital Flight</span>
                <span className="font-bold text-red-500 leading-tight">{kpiData.capitalFlight}</span>
              </div>
            </div>
          </div>

          {/* Group 2: Tools/Modals - Consolidate on mobile */}
          <div className="flex items-center gap-1.5 lg:gap-2">
            {/* Search button — always visible */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-light hover:text-cobalt hover:bg-cobalt/10 transition-all border border-transparent hover:border-cobalt/20"
              title="Search (⌘K)"
            >
              <Search className="w-4 h-4" />
              <kbd className="hidden xl:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-background text-[9px] font-mono text-slate-light/50">⌘K</kbd>
            </button>
            {/* Desktop-only individual tool buttons */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => setMissionOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-light hover:text-cobalt hover:bg-cobalt/10 transition-all border border-transparent hover:border-cobalt/20"
                title={t("about")}
              >
                <Info className="w-4 h-4" />
                <span className="hidden xl:inline">{t("about")}</span>
              </button>
              <button
                onClick={() => setAnalyticsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-light hover:text-green-500 hover:bg-green-500/10 transition-all border border-transparent hover:border-green-500/20"
                title="Analytics"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden xl:inline">ANALYTICS</span>
              </button>
              <button
                onClick={() => setAiNexusOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-cobalt/10 text-cobalt hover:bg-cobalt/20 transition-all border border-cobalt/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]"
                title="AI Supply Chain Nexus"
              >
                <Share2 className="w-4 h-4 animate-pulse" />
                <span className="hidden xl:inline">AI NEXUS</span>
              </button>
              <button
                onClick={() => setBriefingOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                title="Executive SITREP"
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden xl:inline">BRIEFING</span>
              </button>
              <button
                onClick={() => setComparativeOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                title="Comparative Strategic Analytics"
              >
                <Combine className="w-4 h-4" />
                <span className="hidden xl:inline">COMPARE</span>
              </button>
              <button
                onClick={() => setTradeIntelOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 transition-all border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                title="Trade Intelligence"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span className="hidden xl:inline">TRADE</span>
              </button>
            </div>

            {/* Mobile-only search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex lg:hidden items-center justify-center w-9 h-9 rounded-lg bg-cobalt/10 text-cobalt border border-cobalt/20"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden xl:block h-6 w-px bg-border/50" />

          {/* Group 3: Dashboard Mode Toggle (desktop only) */}
          <div className="hidden md:flex items-center gap-1 bg-background border border-border rounded-full p-1 shadow-inner">
            <button
              onClick={() => setMode("SOVEREIGNTY")}
              className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${mode === "SOVEREIGNTY" ? "bg-cobalt text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]" : "text-slate-light hover:text-foreground"}`}
            >
              {t("sovereignty")}
            </button>
            <button
              onClick={() => setMode("OUTSIDE INFLUENCE")}
              className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${mode === "OUTSIDE INFLUENCE" ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.4)]" : "text-slate-light hover:text-foreground"}`}
            >
              {t("outside_influence")}
            </button>
          </div>

          <div className="hidden xl:block h-6 w-px bg-border/50" />

          {/* Group 4: Settings & Locales (desktop only) */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex bg-background border border-border rounded-lg overflow-hidden text-[10px] font-bold shadow-sm">
              {(["en", "fr", "sw", "pt"] as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2 py-1.5 transition-colors uppercase ${language === lang ? "bg-cobalt/20 text-cobalt" : "text-slate-light hover:bg-white/5"}`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 lg:p-2 rounded-lg border border-border bg-background hover:bg-panel transition-colors text-slate-light hover:text-foreground shadow-sm"
              title="Toggle Theme"
            >
              {mounted && theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Mobile Settings Button */}
          <button
            onClick={() => setMobileSettingsOpen(true)}
            className="flex md:hidden items-center justify-center p-1.5 rounded-lg border border-border bg-background text-slate-light hover:text-foreground hover:bg-panel transition-colors"
            aria-label="Settings"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <div className="hidden lg:block h-6 w-px bg-border/50" />

          {/* Group 5: Live Status */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono font-bold text-slate-light px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_5px_rgba(34,197,94,0.8)]" />
            {t("live")}
          </div>
        </div>
      </header>

      {/* Main Grid Interface */}
      <main className="flex-1 flex overflow-hidden pb-16 lg:pb-0">
        {/* Left Panel: 54-Nation Matrix — hidden on mobile unless selected */}
        <div className={`${mobilePanel === "index" ? "flex" : "hidden"} lg:flex`}>
          <AfcftaMatrix selectedCodes={selectedCodes} />
        </div>

        {/* Center Panel: Map Engine */}
        <section className={`flex-1 relative bg-slate-50 dark:bg-onyx-deep flex-col items-center justify-center p-2 lg:p-4 ${mobilePanel === "map" ? "flex" : "hidden lg:flex"}`}>
          {/* Atmospheric backdrop */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.12)_0%,rgba(0,10,30,0.3)_60%,transparent_100%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.2)_0%,rgba(0,0,20,0.5)_60%,transparent_100%)] pointer-events-none" />

          {/* Map Area */}
          <div className="w-full h-full border border-cobalt/20 dark:border-cobalt/30 rounded-xl flex items-center justify-center relative overflow-hidden shadow-[0_0_0_1px_rgba(37,99,235,0.08),0_0_40px_rgba(37,99,235,0.12),inset_0_0_60px_rgba(37,99,235,0.04)] dark:shadow-[0_0_0_1px_rgba(37,99,235,0.15),0_0_60px_rgba(37,99,235,0.2),inset_0_0_80px_rgba(37,99,235,0.06)]">
            {/* Grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#0000000a_1px,transparent_1px),linear-gradient(to_bottom,#0000000a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(37,99,235,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.04)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
            {/* Scanline overlay */}
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.015)_2px,rgba(0,0,0,0.015)_4px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.01)_2px,rgba(255,255,255,0.01)_4px)] pointer-events-none" />
            {/* Corner glow accents */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-cobalt/5 blur-2xl rounded-br-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-cobalt/5 blur-2xl rounded-tl-full pointer-events-none" />
            {/* Live engine badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-panel/80 dark:bg-black/40 backdrop-blur-sm border border-cobalt/30 rounded-full text-[9px] font-mono text-cobalt font-bold z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-cobalt animate-pulse" />
              GEO ENGINE
            </div>

            <ErrorBoundary>
              <AfricaMap
                selectedCountryCodes={selectedCodes}
                onToggleCountry={(code, isShift) => {
                  if (isShift) {
                    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
                  } else {
                    setSelectedCodes(prev => prev.length === 1 && prev[0] === code ? [] : [code]);
                  }
                }}
                timeValue={timeValue}
                selectedResource={selectedResource}
              />
            </ErrorBoundary>

            {/* Resource Filter Pills - Better horizontal scroll and sizing */}
            <div className="absolute top-2 left-2 lg:top-4 lg:left-4 right-2 lg:right-auto flex items-center gap-1.5 z-20 overflow-x-auto no-scrollbar py-1">
              {["Copper", "Cobalt", "Lithium", "Bauxite", "Graphite", "Coltan"].map(res => (
                <button
                  key={res}
                  onClick={() => setSelectedResource(prev => prev === res ? null : res)}
                  className={`px-2.5 py-1.5 rounded-full text-[9px] font-bold border transition-all whitespace-nowrap shadow-sm ${selectedResource === res
                    ? "bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-105"
                    : "bg-panel/90 border-border text-slate-light hover:border-amber-500/40 hover:text-amber-500 backdrop-blur-md"
                    }`}
                >
                  {res.toUpperCase()}
                </button>
              ))}
              {selectedResource && (
                <button
                  onClick={() => setSelectedResource(null)}
                  className="p-1.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Selected Country Banner — compact on mobile */}
            {selectedCountries.length > 0 && (
              <div className="absolute top-2 left-2 sm:top-4 sm:left-4 px-2 sm:px-3 py-1.5 sm:py-2 bg-green-500/20 border border-green-500/60 rounded-lg text-[10px] font-mono backdrop-blur-md shadow-lg text-green-400 flex items-center gap-1.5 sm:gap-2 max-w-[calc(100%-1rem)]">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span className="truncate">{selectedCountries.length === 1 ? isoToFlag(selectedCountries[0].country) : ""} FILTERING: <strong>{selectedCountries.length === 1 ? selectedCountries[0].name.toUpperCase() : `${selectedCountries.length} COUNTRIES`}</strong></span>
                <button
                  onClick={() => setSelectedCodes([])}
                  className="ml-1 px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white transition-colors text-[9px] font-bold shrink-0"
                >CLEAR</button>
              </div>
            )}

            {selectedCountries.length === 0 && (
              <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none p-4">
                <div className="px-4 py-2 bg-panel/90 border border-border rounded-full text-[9px] lg:text-[10px] font-mono backdrop-blur-md shadow-lg text-cobalt group">
                  D3 GEO ENGINE <span className="mx-1 opacity-30">//</span> CLICK COUNTRY TO FILTER
                </div>
              </div>
            )}

            {/* Time Series Slider — sleek integrated design */}
            <div className="absolute bottom-[4.5rem] lg:bottom-10 inset-x-0 flex justify-center px-4 pointer-events-auto">
              <div className="bg-panel/90 backdrop-blur-sm border border-border/50 rounded-2xl p-3 lg:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-2.5 w-full max-w-sm border-b-0">
                <div className="flex justify-between items-center text-[10px] font-mono font-bold tracking-tighter">
                  <span className="text-slate-light/60">2015</span>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cobalt animate-pulse" />
                    <span className="text-cobalt">
                      {timeValue === currentYear ? `PRESENT` : timeValue}
                    </span>
                  </div>
                  <span className="text-slate-light/60">{currentYear}</span>
                </div>
                <div className="relative h-6 flex items-center">
                  <input
                    type="range"
                    min="2015"
                    max={currentYear}
                    value={timeValue}
                    onChange={(e) => setTimeValue(parseInt(e.target.value))}
                    className="w-full h-1 bg-border/30 rounded-lg appearance-none cursor-pointer accent-cobalt outline-none appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cobalt [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel: Friction Engine */}
        <div className={`${mobilePanel === "intel" ? "flex" : "hidden"} lg:flex`}>
          <FrictionEngine mode={mode} filterCountries={selectedCodes.length > 0 ? selectedCodes : null} onSelectCountry={(iso) => setSelectedCodes([iso])} onSwitchMode={(m) => setMode(m)} />
        </div>
      </main>

      {/* Bottom Ticker */}
      <div className="hidden lg:block">
        <ContinentalGoalsTicker />
      </div>

      {/* Fixed Bottom Mobile Navigation — Enhanced with premium animations */}
      <div className="flex lg:hidden fixed bottom-1 left-3 right-3 h-16 border border-border/40 bg-panel/90 backdrop-blur-xl z-50 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] safe-area-inset-bottom overflow-hidden">
        <button
          onClick={() => setMobilePanel("index")}
          className={`group flex flex-1 flex-col items-center justify-center gap-1 transition-all relative ${mobilePanel === "index" ? "text-cobalt" : "text-slate-light"}`}
        >
          {mobilePanel === "index" && (
            <motion.span
              layoutId="navGlow"
              className="absolute inset-0 bg-cobalt/5 z-0"
            />
          )}
          {mobilePanel === "index" && (
            <motion.span
              layoutId="navTab"
              className="absolute top-0 inset-x-4 h-0.5 bg-cobalt rounded-b-full shadow-[0_2px_10px_rgba(37,99,235,0.5)]"
            />
          )}
          <List className={`w-5 h-5 transition-transform duration-300 ${mobilePanel === "index" ? "scale-110" : "group-hover:scale-105"}`} />
          <span className="text-[9px] font-bold tracking-wider">{t("index")}</span>
        </button>

        <button
          onClick={() => setMobilePanel("map")}
          className={`group flex flex-1 flex-col items-center justify-center gap-1 transition-all relative ${mobilePanel === "map" ? "text-cobalt" : "text-slate-light"}`}
        >
          {mobilePanel === "map" && (
            <motion.span
              layoutId="navGlow"
              className="absolute inset-0 bg-cobalt/5 z-0"
            />
          )}
          {mobilePanel === "map" && (
            <motion.span
              layoutId="navTab"
              className="absolute top-0 inset-x-4 h-0.5 bg-cobalt rounded-b-full shadow-[0_2px_10px_rgba(37,99,235,0.5)]"
            />
          )}
          <LucideMap className={`w-5 h-5 transition-transform duration-300 ${mobilePanel === "map" ? "scale-110" : "group-hover:scale-105"}`} />
          <span className="text-[9px] font-bold tracking-wider">{t("map")}</span>
        </button>

        <button
          onClick={() => { setMobilePanel("intel"); clearNewAlerts(); }}
          className={`group flex flex-1 flex-col items-center justify-center gap-1 transition-all relative ${mobilePanel === "intel" ? "text-cobalt" : "text-slate-light"}`}
        >
          {newAlertCount > 0 && (
            <span className="absolute top-1 right-1/4 w-4 h-4 bg-red-500 rounded-full text-[8px] font-bold flex items-center justify-center text-white z-10">
              {newAlertCount > 9 ? '9+' : newAlertCount}
            </span>
          )}
          {mobilePanel === "intel" && (
            <motion.span
              layoutId="navGlow"
              className="absolute inset-0 bg-cobalt/5 z-0"
            />
          )}
          {mobilePanel === "intel" && (
            <motion.span
              layoutId="navTab"
              className="absolute top-0 inset-x-4 h-0.5 bg-cobalt rounded-b-full shadow-[0_2px_10px_rgba(37,99,235,0.5)]"
            />
          )}
          <ShieldAlert className={`w-5 h-5 transition-transform duration-300 ${mobilePanel === "intel" ? "scale-110" : "group-hover:scale-105"}`} />
          <span className="text-[9px] font-bold tracking-wider">{t("intel")}</span>
        </button>

        <button
          onClick={() => setMobileSettingsOpen(true)}
          className={`group flex flex-1 flex-col items-center justify-center gap-1 transition-all relative ${mobileSettingsOpen ? "text-cobalt" : "text-slate-light"}`}
        >
          <Settings2 className={`w-5 h-5 transition-transform duration-300 ${mobileSettingsOpen ? "scale-110 rotate-90" : "group-hover:scale-105"}`} />
          <span className="text-[9px] font-bold tracking-wider uppercase">{t("controls")}</span>
        </button>
      </div>

      {/* Mobile Settings Bottom Sheet */}
      <AnimatePresence>
        {mobileSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSettingsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden bg-panel border-t border-border rounded-t-2xl shadow-2xl pb-8"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-4">
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>

              <div className="px-5 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-cobalt" /> Dashboard Controls
                  </h3>
                  <button
                    onClick={() => setMobileSettingsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-slate-light hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Mode Toggle */}
                <div>
                  <p className="text-[10px] font-mono text-slate-light mb-2 tracking-wider">ANALYSIS MODE</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setMode("SOVEREIGNTY"); setMobileSettingsOpen(false); }}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${mode === "SOVEREIGNTY"
                        ? "bg-cobalt text-white border-cobalt shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                        : "bg-background border-border text-slate-light hover:border-cobalt/40"
                        }`}
                    >
                      {mode === "SOVEREIGNTY" && <Check className="w-4 h-4" />}
                      SOVEREIGNTY
                    </button>
                    <button
                      onClick={() => { setMode("OUTSIDE INFLUENCE"); setMobileSettingsOpen(false); }}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all border ${mode === "OUTSIDE INFLUENCE"
                        ? "bg-orange-500 text-white border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)]"
                        : "bg-background border-border text-slate-light hover:border-orange-500/40"
                        }`}
                    >
                      {mode === "OUTSIDE INFLUENCE" && <Check className="w-4 h-4" />}
                      INFLUENCE
                    </button>
                  </div>
                </div>

                {/* Language */}
                <div>
                  <p className="text-[10px] font-mono text-slate-light mb-2 tracking-wider">LANGUAGE</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["en", "fr", "sw", "pt"] as Language[]).map(lang => (
                      <button
                        key={lang}
                        onClick={() => { setLanguage(lang); }}
                        className={`py-2.5 rounded-xl uppercase font-bold text-sm transition-all border ${language === lang
                          ? "bg-cobalt/20 text-cobalt border-cobalt/40"
                          : "bg-background border-border text-slate-light"
                          }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div>
                  <p className="text-[10px] font-mono text-slate-light mb-2 tracking-wider">THEME</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all border ${!mounted || theme === "light"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40"
                        : "bg-background border-border text-slate-light"
                        }`}
                    >
                      <Sun className="w-4 h-4" /> LIGHT
                    </button>
                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all border ${mounted && theme === "dark"
                        ? "bg-cobalt/10 text-cobalt border-cobalt/40"
                        : "bg-background border-border text-slate-light"
                        }`}
                    >
                      <Moon className="w-4 h-4" /> DARK
                    </button>
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <p className="text-[10px] font-mono text-slate-light mb-2 tracking-wider">TOOLS</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "SEARCH", icon: Search, color: "cobalt", action: () => { setMobileSettingsOpen(false); setTimeout(() => setSearchOpen(true), 200); } },
                      { label: "BRIEFING", icon: ShieldAlert, color: "amber-500", action: () => { setMobileSettingsOpen(false); setBriefingOpen(true); } },
                      { label: "ANALYTICS", icon: BarChart3, color: "emerald-500", action: () => { setMobileSettingsOpen(false); setAnalyticsOpen(true); } },
                      { label: "AI NEXUS", icon: Share2, color: "cobalt", action: () => { setMobileSettingsOpen(false); setAiNexusOpen(true); } },
                      { label: "COMPARE", icon: Combine, color: "emerald-500", action: () => { setMobileSettingsOpen(false); setComparativeOpen(true); } },
                      { label: "TRADE", icon: ArrowUpRight, color: "cyan-500", action: () => { setMobileSettingsOpen(false); setTradeIntelOpen(true); } },
                      { label: "ABOUT", icon: Info, color: "slate-light", action: () => { setMobileSettingsOpen(false); setMissionOpen(true); } },
                      { label: "AI BRIEF", icon: BrainCircuit, color: "purple-500", action: () => { setMobileSettingsOpen(false); setBriefingOpen(true); } },
                    ].map(tool => (
                      <button
                        key={tool.label}
                        onClick={tool.action}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all border bg-background border-border text-slate-light hover:border-${tool.color}/40 hover:text-${tool.color}`}
                      >
                        <tool.icon className="w-4 h-4" />
                        {tool.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Links */}
                <div>
                  <p className="text-[10px] font-mono text-slate-light mb-2 tracking-wider">PAGES</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "METHODOLOGY", href: "/methodology" },
                      { label: "API DOCS", href: "/docs" },
                      { label: "RSS FEED", href: "/feed.xml" },
                    ].map(link => (
                      <a
                        key={link.label}
                        href={link.href}
                        className="px-2 py-2.5 rounded-xl text-[10px] font-bold tracking-wider transition-all border bg-background border-border text-slate-light hover:text-cobalt hover:border-cobalt/40"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Site Navigation Footer */}
      <footer className="h-8 flex items-center justify-center gap-4 sm:gap-6 px-4 border-t border-border bg-panel/50 text-[9px] font-mono tracking-wider shrink-0 overflow-x-auto">
        <a href="/methodology" className="text-slate-light hover:text-cobalt transition-colors whitespace-nowrap">METHODOLOGY</a>
        <span className="text-border">|</span>
        <a href="/docs" className="text-slate-light hover:text-cobalt transition-colors whitespace-nowrap">API DOCS</a>
        <span className="text-border">|</span>
        <a href="/feed.xml" target="_blank" rel="noopener" className="text-slate-light hover:text-cobalt transition-colors whitespace-nowrap">RSS FEED</a>
        <span className="text-border hidden sm:inline">|</span>
        <a href="https://github.com/Oddjobe/Axis" target="_blank" rel="noopener" className="text-slate-light hover:text-cobalt transition-colors whitespace-nowrap hidden sm:inline">GITHUB</a>
        <span className="text-border hidden sm:inline">|</span>
        <span className="text-zinc-600 hidden sm:inline">© {new Date().getFullYear()} AXIS AFRICA</span>
      </footer>

      {/* Modals */}
      <SearchCommand
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectCountry={(iso) => { setSelectedCodes([iso]); setSearchOpen(false); }}
        onOpenTool={(action) => { openTool(action); setSearchOpen(false); }}
      />
      <MissionModal isOpen={missionOpen} onClose={() => setMissionOpen(false)} />
      <AnalyticsModal
        isOpen={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        data={countryDataMaster}
        selectedResource={selectedResource}
      />
      <AiNexusModal
        isOpen={aiNexusOpen}
        onClose={() => setAiNexusOpen(false)}
        selectedResource={selectedResource}
      />
      <AiBriefingModal
        isOpen={briefingOpen}
        onClose={() => setBriefingOpen(false)}
      />
      <ComparativeAnalyticsModal
        isOpen={comparativeOpen}
        onClose={() => setComparativeOpen(false)}
        allData={ALL_SOVEREIGN_DATA}
        initialSelectedCodes={selectedCodes}
      />
      <TradeIntelligenceModal isOpen={tradeIntelOpen} onClose={() => setTradeIntelOpen(false)} />
    </div>
  );
}
