"use client"

import { useState } from "react";
import { Globe, Users, Info } from "lucide-react";
import AfricaMap from "@/components/africa-map";
import FrictionEngine from "@/components/friction-engine";
import AfcftaMatrix from "@/components/afcfta-matrix";
import ContinentalGoalsTicker from "@/components/continental-goals-ticker";
import MissionModal from "@/components/mission-modal";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

const TOTAL_POPULATION = 1_444; // ~1.44 billion

export default function Home() {
  const [mode, setMode] = useState<"SOVEREIGNTY" | "WESTERN RISK">("SOVEREIGNTY");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);

  const selectedCountry = selectedCode
    ? ALL_SOVEREIGN_DATA.find(c => c.country === selectedCode) ?? null
    : null;

  const displayPop = selectedCountry
    ? selectedCountry.population
    : `${(TOTAL_POPULATION / 1000).toFixed(2)}B`;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Navigation / Dashboard Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-panel backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Globe className="w-6 h-6 text-cobalt" />
          <h1 className="text-xl font-bold tracking-widest uppercase">
            Axis <span className="text-cobalt">Africa</span>
          </h1>
          <div className="h-6 w-px bg-border mx-2" />
          <span className="text-xs font-mono text-slate-light dark:text-zinc-400 tracking-wider">
            PAN-AFRICAN INTELLIGENCE PLATFORM // V1.0
          </span>
        </div>

        <div className="flex items-center gap-5">
          {/* Population Counter */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-mono">
            <Users className="w-3.5 h-3.5 text-green-500" />
            <span className="text-slate-light">
              {selectedCountry ? selectedCountry.name.toUpperCase() : "CONTINENTAL"}
            </span>
            <span className="font-bold text-green-500 ml-1">{displayPop}</span>
          </div>

          {/* Info / Mission Button */}
          <button
            onClick={() => setMissionOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cobalt/10 border border-cobalt/40 rounded-lg text-xs font-bold text-cobalt hover:bg-cobalt/20 transition-all"
          >
            <Info className="w-3.5 h-3.5" /> ABOUT
          </button>

          {/* Dashboard Mode Toggle */}
          <div className="flex items-center gap-3 bg-background border border-border rounded-full p-1 shadow-inner">
            <button
              onClick={() => setMode("SOVEREIGNTY")}
              className={`px-4 py-1 text-xs font-bold rounded-full transition-all ${mode === "SOVEREIGNTY" ? "bg-cobalt text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]" : "text-slate-light hover:text-foreground"}`}
            >
              SOVEREIGNTY
            </button>
            <button
              onClick={() => setMode("WESTERN RISK")}
              className={`px-4 py-1 text-xs font-bold rounded-full transition-all ${mode === "WESTERN RISK" ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.5)]" : "text-slate-light hover:text-foreground"}`}
            >
              WESTERN RISK
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            LIVE
          </div>
        </div>
      </header>

      {/* Main Grid Interface */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: 54-Nation Matrix */}
        <AfcftaMatrix selectedCode={selectedCode} onSelectCode={setSelectedCode} />

        {/* Center Panel: Map Engine */}
        <section className="flex-1 relative bg-onyx dark:bg-onyx-deep flex flex-col items-center justify-center p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none" />

          {/* Map Area */}
          <div className="w-full h-full border border-border/30 rounded-xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm shadow-[0_0_30px_rgba(37,99,235,0.05)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f005_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f005_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px]"></div>

            <AfricaMap selectedCountryCode={selectedCode} onSelectCountry={setSelectedCode} />

            {/* Selected Country Banner */}
            {selectedCountry && (
              <div className="absolute top-4 left-4 px-3 py-2 bg-green-500/20 border border-green-500/60 rounded-lg text-[11px] font-mono backdrop-blur-md shadow-lg text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                FILTERING: <strong>{selectedCountry.name.toUpperCase()}</strong>
                <button
                  onClick={() => setSelectedCode(null)}
                  className="ml-2 text-green-500/70 hover:text-green-500 text-base leading-none"
                >×</button>
              </div>
            )}

            {!selectedCountry && (
              <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
                <div className="px-4 py-2 bg-panel/80 border border-border rounded-full text-[10px] font-mono backdrop-blur-md shadow-lg text-cobalt bg-white/10 dark:bg-black/20">
                  D3 GEO ENGINE // CLICK A COUNTRY TO FILTER
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Panel: Friction Engine */}
        <FrictionEngine mode={mode} filterCountry={selectedCountry?.name ?? null} />
      </main>

      {/* Bottom Ticker */}
      <ContinentalGoalsTicker />

      {/* Modals */}
      <MissionModal isOpen={missionOpen} onClose={() => setMissionOpen(false)} />
    </div>
  );
}
