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
  { id: "1", name: "Dangote Refinery", country: "Nigeria", isoCode: "NGA", value: "$19B", sector: "INDUSTRIAL", status: "COMPLETED" },
  { id: "2", name: "Grand Ethiopian Renaissance Dam", country: "Ethiopia", isoCode: "ETH", value: "$4.8B", sector: "ENERGY", status: "ACTIVE" },
  { id: "3", name: "Simandou Iron Ore", country: "Guinea", isoCode: "GIN", value: "$20B", sector: "MINING", status: "CONSTRUCTION" },
  { id: "4", name: "New Administrative Capital", country: "Egypt", isoCode: "EGY", value: "$58B", sector: "INFRASTRUCTURE", status: "CONSTRUCTION" },
  { id: "5", name: "EACOP Pipeline", country: "Uganda / Tanzania", isoCode: "UGA", value: "$5B", sector: "ENERGY", status: "CONSTRUCTION" },
  { id: "6", name: "Nacala Logistics Corridor", country: "Mozambique", isoCode: "MOZ", value: "$4.5B", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "7", name: "Julius Nyerere Hydropower", country: "Tanzania", isoCode: "TZA", value: "$2.9B", sector: "ENERGY", status: "CONSTRUCTION" },
  { id: "8", name: "Standard Gauge Railway", country: "Kenya", isoCode: "KEN", value: "$3.6B", sector: "INFRASTRUCTURE", status: "ACTIVE" },
  { id: "9", name: "Noor Ouarzazate Solar Complex", country: "Morocco", isoCode: "MAR", value: "$2.5B", sector: "ENERGY", status: "COMPLETED" },
  { id: "10", name: "Konza Technopolis", country: "Kenya", isoCode: "KEN", value: "$14.5B", sector: "TECH", status: "CONSTRUCTION" },
  { id: "11", name: "Inga III Dam", country: "DR Congo", isoCode: "COD", value: "$14B", sector: "ENERGY", status: "PLANNED" },
  { id: "12", name: "Lagos-Calabar Coastal Highway", country: "Nigeria", isoCode: "NGA", value: "$13B", sector: "INFRASTRUCTURE", status: "CONSTRUCTION" },
  { id: "13", name: "Tanger Med Port", country: "Morocco", isoCode: "MAR", value: "$1.3B+", sector: "INFRASTRUCTURE", status: "COMPLETED" },
  { id: "14", name: "Eko Atlantic City", country: "Nigeria", isoCode: "NGA", value: "$6B", sector: "INFRASTRUCTURE", status: "CONSTRUCTION" },
  { id: "15", name: "Mphanda Nkuwa Dam", country: "Mozambique", isoCode: "MOZ", value: "$4.5B", sector: "ENERGY", status: "PLANNED" },
  { id: "16", name: "Lake Turkana Wind Power", country: "Kenya", isoCode: "KEN", value: "$680M", sector: "ENERGY", status: "COMPLETED" },
  { id: "17", name: "Bagamoyo Port", country: "Tanzania", isoCode: "TZA", value: "$10B", sector: "INFRASTRUCTURE", status: "PLANNED" },
  { id: "18", name: "Mambilla Hydroelectric", country: "Nigeria", isoCode: "NGA", value: "$5.8B", sector: "ENERGY", status: "PLANNED" },
  { id: "19", name: "Prieska Copper Zinc Project", country: "South Africa", isoCode: "ZAF", value: "$300M", sector: "MINING", status: "CONSTRUCTION" },
  { id: "20", name: "Trans-Maghreb Highway", country: "Algeria", isoCode: "DZA", value: "Multi", sector: "INFRASTRUCTURE", status: "ACTIVE" },
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
