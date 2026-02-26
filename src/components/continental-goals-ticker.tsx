"use client"

import { motion } from "framer-motion"

const GOALS = [
    { id: "01", title: "AFCFTA INTEGRATION", value: "FREE TRADE AGREEMENT", status: "ACCELERATING" },
    { id: "02", title: "RESOURCE BENEFICIATION", value: "OWNING LOCAL MINERALS", status: "DOWNSTREAM REFINING" },
    { id: "03", title: "FINANCIAL SOVEREIGNTY", value: "SIRA / PAPSS CURRENCY", status: "PILOT PHASE" },
    { id: "04", title: "ENERGY INDEPENDENCE", value: "LOCAL OIL PRODUCTION", status: "REDUCING EXPORTS" },
    { id: "05", title: "POPULATION DIVIDEND", value: "1.4B CITIZENS", status: "YOUTH UPSKILLING" },
    { id: "06", title: "MINERAL VALUE", value: "LITHIUM/COBALT VALUATION", status: "RENEGOTIATING DEALS" },
    { id: "07", title: "FOOD SECURITY", value: "60% ARABLE LAND", status: "AGRI-TECH INITIATIVES" },
    { id: "08", title: "BORDERLESS MOVEMENT", value: "AFRICAN PASSPORT", status: "REGIONAL ROLLOUT" },
    { id: "09", title: "INFRASTRUCTURE", value: "CONTINENTAL RAILWAYS", status: "CONNECTING PORTS" },
    { id: "10", title: "DEBT COMMUTATION", value: "RESOURCE-BACKED", status: "REJECTING IMF CONDITIONALITY" }
];

export default function ContinentalGoalsTicker() {
    return (
        <footer className="h-10 border-t border-border bg-panel flex items-center overflow-hidden shrink-0 font-mono relative">
            {/* Fixed Title Box on the Left */}
            <div className="absolute left-0 top-0 bottom-0 bg-cobalt text-white text-[10px] font-bold px-4 flex items-center z-10 shadow-[5px_0_15px_rgba(0,0,0,0.5)] whitespace-nowrap">
                TOP 10 CONTINENTAL GOALS //
            </div>

            {/* Infinite Scrolling Marquee */}
            <div className="flex w-full overflow-hidden relative">
                <motion.div
                    className="flex items-center whitespace-nowrap pl-48"
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{ ease: "linear", duration: 40, repeat: Infinity }}
                >
                    {/* We render the list twice for seamless looping */}
                    {[...GOALS, ...GOALS].map((goal, idx) => (
                        <div key={idx} className="flex items-center mx-6 gap-3 text-[10px]">
                            <span className="text-slate-light/60">[{goal.id}]</span>
                            <span className="font-bold text-foreground tracking-wider">{goal.title}</span>
                            <span className="text-cobalt opacity-50">///</span>
                            <span className="text-foreground/80">{goal.value}</span>
                            <span className="text-cobalt opacity-50">///</span>
                            <span className="text-green-500 font-bold">{goal.status}</span>
                        </div>
                    ))}
                </motion.div>
            </div>
        </footer>
    );
}
