"use client";

import { motion } from "framer-motion";
import { Hammer, Zap, Train, Building2, Factory, Ship, Cpu } from "lucide-react";

type ProjectSector = "ENERGY" | "INFRASTRUCTURE" | "MINING" | "TECH" | "INDUSTRIAL";

interface MegaProject {
  id: string;
  name: string;
  country: string;
  isoCode: string;
  value: string;
  sector: ProjectSector;
  status: "ACTIVE" | "COMPLETED" | "PLANNED" | "CONSTRUCTION";
}

const MEGA_PROJECTS: MegaProject[] = [
  { id: "1", name: "Grand Ethiopian Renaissance Dam", country: "Ethiopia", isoCode: "ETH", value: "$5B", sector: "ENERGY", status: "ACTIVE" },
  { id: "2", name: "Lekki Deep Sea Port", country: "Nigeria", isoCode: "NGA", value: "Multi", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "3", name: "Dangote Petroleum Refinery", country: "Nigeria", isoCode: "NGA", value: "Multi", sector: "ENERGY", status: "ACTIVE" },
  { id: "4", name: "Dakhla Atlantic Port", country: "Western Sahara", isoCode: "ESH", value: "$1.2-$1.6B", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "5", name: "Egypt's high-speed rail", country: "Egypt", isoCode: "EGY", value: "Multi", sector: "INFRASTRUCTURE", status: "CONSTRUCTION" },
  { id: "6", name: "Suez Canal Expansion", country: "Egypt", isoCode: "EGY", value: "$8B", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "7", name: "Google Equiano", country: "South Africa", isoCode: "ZAF", value: "Multi", sector: "TECH", status: "ACTIVE" },
  { id: "8", name: "Kazungula Bridge", country: "Botswana/Zambia", isoCode: "BWA", value: "Multi", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "9", name: "Ethiopia-Kenya Electricity Highway", country: "Ethiopia/Kenya", isoCode: "ETH", value: "Multi", sector: "ENERGY", status: "ACTIVE" },
  { id: "10", name: "Namibia Walvis Bay New Container Termina", country: "Namibia", isoCode: "NAM", value: "$300M", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "11", name: "Lobito Corridor Railway", country: "Angola", isoCode: "AGO", value: "Multi", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "12", name: "The New Administrative Capital", country: "Egypt", isoCode: "EGY", value: "Multi", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "13", name: "The Kazungula Bridge", country: "Botswana/Zambia", isoCode: "BWA", value: "Multi", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "14", name: "African Continental Free Trade Area (AfC", country: "Multiple", isoCode: "MUL", value: "Multi", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "15", name: "Trans-African Highway Network", country: "Multiple", isoCode: "MUL", value: "Multi", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "16", name: "Mombasa-Nairobi Standard Gauge Railway", country: "Kenya", isoCode: "KEN", value: "Multi", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "17", name: "Algeria East-West Motorway", country: "Algeria", isoCode: "DZA", value: "Multi", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "18", name: "Nairobi Expressway", country: "Kenya", isoCode: "KEN", value: "Multi", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "19", name: "Banjul International Airport Expansion", country: "Gambia", isoCode: "GMB", value: "Multi", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "20", name: "West African Gas Pipeline", country: "Nigeria/Benin/Togo", isoCode: "NGA", value: "Multi", sector: "ENERGY", status: "ACTIVE" },
];

const getSectorIcon = (sector: ProjectSector) => {
  switch (sector) {
    case "ENERGY": return <Zap className="w-3 h-3 text-amber-500" />;
    case "INFRASTRUCTURE": return <Building2 className="w-3 h-3 text-cobalt" />;
    case "MINING": return <Hammer className="w-3 h-3 text-orange-500" />;
    case "INDUSTRIAL": return <Factory className="w-3 h-3 text-green-500" />;
    case "TECH": return <Cpu className="w-3 h-3 text-purple-500" />;
    default: return <Ship className="w-3 h-3 text-cobalt" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "ACTIVE": return "text-emerald-500";
    case "COMPLETED": return "text-cobalt";
    case "CONSTRUCTION": return "text-amber-500";
    case "PLANNED": return "text-slate-light";
    default: return "text-white";
  }
};

export default function MegaProjectsTicker() {
  return (
    <div className="flex h-7 lg:h-8 w-full border-b border-border bg-gradient-to-r from-background via-panel to-background backdrop-blur-sm overflow-hidden text-[10px] font-mono shrink-0 shadow-inner group">
      {/* Title block */}
      <div className="hidden md:flex items-center gap-2 px-4 bg-background border-r border-border shrink-0 z-10 shadow-[5px_0_15px_-5px_rgba(0,0,0,0.5)] h-full relative">
        <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500" />
        <Building2 className="w-3 h-3 text-amber-500" />
        <span className="font-bold tracking-widest text-slate-light">AFRICA MEGA-PROJECTS</span>
      </div>

      <div className="flex-1 overflow-hidden h-full flex items-center relative mask-image-[linear-gradient(to_right,transparent,black_50px,black_calc(100%-50px),transparent)]">
        <motion.div
           className="flex items-center h-full whitespace-nowrap min-w-full group-hover:[animation-play-state:paused]"
           animate={{ x: [0, -100 * MEGA_PROJECTS.length] }}
           transition={{ ease: "linear", duration: 60, repeat: Infinity }}
           style={{ gap: "2rem", paddingLeft: "1rem" }}
        >
          {MEGA_PROJECTS.map((project, idx) => (
            <div key={`proj-1-${project.id}-${idx}`} className="flex items-center gap-3 shrink-0 cursor-default hover:bg-white/5 px-2 py-0.5 rounded transition-colors">
              <div className="flex items-center gap-1.5 opacity-80">
                {getSectorIcon(project.sector)}
                <span className="font-bold text-slate-300 tracking-wider uppercase">{project.name}</span>
              </div>
              
              <div className="flex items-center gap-1.5 opacity-60 bg-black/20 dark:bg-white/5 px-1.5 rounded">
                <span className="text-[9px] tracking-widest">{project.isoCode}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className="font-bold text-emerald-400">{project.value}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className={`text-[8px] font-bold uppercase tracking-widest ${getStatusColor(project.status)}`}>{project.status}</span>
              </div>
            </div>
          ))}
          {/* Duplicate set for seamless looping */}
          {MEGA_PROJECTS.map((project, idx) => (
            <div key={`proj-2-${project.id}-${idx}`} className="flex items-center gap-3 shrink-0 cursor-default hover:bg-white/5 px-2 py-0.5 rounded transition-colors">
              <div className="flex items-center gap-1.5 opacity-80">
                {getSectorIcon(project.sector)}
                <span className="font-bold text-slate-300 tracking-wider uppercase">{project.name}</span>
              </div>
              
              <div className="flex items-center gap-1.5 opacity-60 bg-black/20 dark:bg-white/5 px-1.5 rounded">
                <span className="text-[9px] tracking-widest">{project.isoCode}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className="font-bold text-emerald-400">{project.value}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className={`text-[8px] font-bold uppercase tracking-widest ${getStatusColor(project.status)}`}>{project.status}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
