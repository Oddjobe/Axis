const fs = require('fs');
let c = fs.readFileSync('src/app/page.tsx', 'utf-8');
c = c.replace('import type { CountryData } from "@/components/country-dossier-modal";', 'import type { CountryData } from "@/components/country-dossier-modal";\nimport kpiData from "@/lib/kpi-data.json";');
c = c.replace('<span className="font-bold text-emerald-500 leading-tight">$67.0B</span>', '<span className="font-bold text-emerald-500 leading-tight">{kpiData.fdi}</span>');
c = c.replace('<span className="font-bold text-red-500 leading-tight">$631.4B</span>', '<span className="font-bold text-red-500 leading-tight">{kpiData.capitalFlight}</span>');
fs.writeFileSync('src/app/page.tsx', c);
console.log("Replaced");
