"use client"

import { useState } from "react";
import { Globe, Users, Info, Menu, X, List, Map, ShieldAlert } from "lucide-react";
import AfricaMap from "@/components/africa-map";
import AfcftaMatrix from "@/components/afcfta-matrix";
import FrictionEngine from "@/components/friction-engine";
import ContinentalGoalsTicker from "@/components/continental-goals-ticker";
import MissionModal from "@/components/mission-modal";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

const TOTAL_POPULATION = 1_444; // ~1.44 billion

export default function Home() {
  const [mode, setMode] = useState<"SOVEREIGNTY" | "OUTSIDE INFLUENCE">("SOVEREIGNTY");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [missionOpen, setMissionOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"map" | "index" | "intel">("map");
  const currentYear = new Date().getFullYear();
  const [timeValue, setTimeValue] = useState(currentYear);

  const selectedCountries = selectedCodes
    .map(code => ALL_SOVEREIGN_DATA.find(c => c.country === code))
    .filter(Boolean) as typeof ALL_SOVEREIGN_DATA;

  // Function to parse strings like "35.6M" or "1.2B" to numbers
  const parsePop = (popStr: string) => {
    if (popStr.endsWith('B')) return parseFloat(popStr) * 1000;
    if (popStr.endsWith('M')) return parseFloat(popStr);
    return 0;
  };

  const totalPopMillions = selectedCountries.reduce((sum, c) => sum + parsePop(c.population), 0);

  const displayPop = selectedCountries.length > 0
    ? totalPopMillions >= 1000 ? `${(totalPopMillions / 1000).toFixed(2)}B` : `${totalPopMillions.toFixed(1)}M`
    : `${(TOTAL_POPULATION / 1000).toFixed(2)}B`;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Navigation / Dashboard Header */}
      <header className="h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6 border-b border-border bg-panel backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 lg:gap-4">
          <Globe className="w-5 h-5 lg:w-6 lg:h-6 text-cobalt" />
          <h1 className="text-base lg:text-xl font-bold tracking-widest uppercase">
            Axis <span className="text-cobalt">Africa</span>
          </h1>
          <div className="h-5 w-px bg-border mx-1 hidden sm:block" />
          <span className="text-[9px] lg:text-xs font-mono text-slate-light dark:text-zinc-400 tracking-wider hidden sm:inline">
            AFRICAN X-RAY INTELLIGENCE SYSTEM · V1.0
          </span>
        </div>

        <div className="flex items-center gap-2 lg:gap-5">
          {/* Population Counter */}
          <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1 lg:py-1.5 bg-background border border-border rounded-lg text-[10px] lg:text-xs font-mono">
            <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-green-500" />
            <span className="text-slate-light hidden sm:inline">
              {selectedCountries.length === 1 ? selectedCountries[0].name.toUpperCase() : selectedCountries.length > 1 ? "SELECTED POPULATION" : "POPULATION"}
            </span>
            <span className="font-bold text-green-500 ml-0.5 lg:ml-1">{displayPop}</span>
          </div>

          {/* Info / Mission Button */}
          <button
            onClick={() => setMissionOpen(true)}
            className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1 lg:py-1.5 bg-cobalt/10 border border-cobalt/40 rounded-lg text-[10px] lg:text-xs font-bold text-cobalt hover:bg-cobalt/20 transition-all"
          >
            <Info className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> <span className="hidden sm:inline">ABOUT</span>
          </button>

          {/* Dashboard Mode Toggle */}
          <div className="hidden md:flex items-center gap-3 bg-background border border-border rounded-full p-1 shadow-inner">
            <button
              onClick={() => setMode("SOVEREIGNTY")}
              className={`px-3 lg:px-4 py-1 text-[10px] lg:text-xs font-bold rounded-full transition-all ${mode === "SOVEREIGNTY" ? "bg-cobalt text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]" : "text-slate-light hover:text-foreground"}`}
            >
              SOVEREIGNTY
            </button>
            <button
              onClick={() => setMode("OUTSIDE INFLUENCE")}
              className={`px-3 lg:px-4 py-1 text-[10px] lg:text-xs font-bold rounded-full transition-all ${mode === "OUTSIDE INFLUENCE" ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.5)]" : "text-slate-light hover:text-foreground"}`}
            >
              OUTSIDE INFLUENCE
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            LIVE
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
        <section className={`flex-1 relative bg-onyx dark:bg-onyx-deep flex-col items-center justify-center p-2 lg:p-6 ${mobilePanel === "map" ? "flex" : "hidden lg:flex"}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none" />

          {/* Map Area */}
          <div className="w-full h-full border border-border/30 rounded-xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm shadow-[0_0_30px_rgba(37,99,235,0.05)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f005_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f005_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px]"></div>

            <AfricaMap
              selectedCountryCodes={selectedCodes}
              onToggleCountry={(code) => {
                setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
              }}
              timeValue={timeValue}
            />

            {/* Selected Country Banner */}
            {selectedCountries.length > 0 && (
              <div className="absolute top-4 left-4 px-3 py-2 bg-green-500/20 border border-green-500/60 rounded-lg text-[11px] font-mono backdrop-blur-md shadow-lg text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                FILTERING: <strong>{selectedCountries.length === 1 ? selectedCountries[0].name.toUpperCase() : `${selectedCountries.length} COUNTRIES`}</strong>
                <button
                  onClick={() => setSelectedCodes([])}
                  className="ml-2 px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white transition-colors text-[9px] font-bold"
                >CLEAR</button>
              </div>
            )}

            {selectedCountries.length === 0 && (
              <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
                <div className="px-4 py-2 bg-panel/80 border border-border rounded-full text-[10px] font-mono backdrop-blur-md shadow-lg text-cobalt bg-white/10 dark:bg-black/20">
                  D3 GEO ENGINE // CLICK A COUNTRY TO FILTER
                </div>
              </div>
            )}

            {/* Time Series Slider overlay */}
            <div className="absolute bottom-20 inset-x-0 flex justify-center px-4 pointer-events-auto">
              <div className="bg-panel/90 backdrop-blur-md border border-border rounded-xl p-3 shadow-2xl flex flex-col gap-2 w-full max-w-sm">
                <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-light">
                  <span>2015</span>
                  <span className="text-cobalt bg-cobalt/10 px-2 py-0.5 rounded border border-cobalt/30">
                    {timeValue === currentYear ? `CURRENT (${currentYear})` : timeValue}
                  </span>
                  <span>{currentYear}</span>
                </div>
                <input
                  type="range"
                  min="2015"
                  max={currentYear}
                  value={timeValue}
                  onChange={(e) => setTimeValue(parseInt(e.target.value))}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-cobalt outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel: Friction Engine */}
        <div className={`${mobilePanel === "intel" ? "flex" : "hidden"} lg:flex`}>
          <FrictionEngine mode={mode} filterCountries={selectedCodes.length > 0 ? selectedCodes : null} />
        </div>
      </main>

      {/* Bottom Ticker */}
      <div className="hidden lg:block">
        <ContinentalGoalsTicker />
      </div>

      {/* Fixed Bottom Mobile Navigation */}
      <div className="flex lg:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-panel/95 backdrop-blur-md z-50">
        <button
          onClick={() => setMobilePanel("index")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 transition-all ${mobilePanel === "index" ? "text-cobalt" : "text-slate-light hover:text-foreground"}`}
        >
          <List className="w-5 h-5" />
          <span className="text-[9px] font-bold tracking-wider">INDEX</span>
        </button>
        <button
          onClick={() => setMobilePanel("map")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 transition-all ${mobilePanel === "map" ? "text-green-500" : "text-slate-light hover:text-foreground"}`}
        >
          <Map className="w-5 h-5" />
          <span className="text-[9px] font-bold tracking-wider">MAP</span>
        </button>
        <button
          onClick={() => setMobilePanel("intel")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 transition-all ${mobilePanel === "intel" ? "text-orange-500" : "text-slate-light hover:text-foreground"}`}
        >
          <ShieldAlert className="w-5 h-5" />
          <span className="text-[9px] font-bold tracking-wider">INTEL</span>
        </button>
      </div>

      {/* Modals */}
      <MissionModal isOpen={missionOpen} onClose={() => setMissionOpen(false)} />
    </div>
  );
}
