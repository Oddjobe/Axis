import { Activity, TrendingUp, Pickaxe } from "lucide-react";

export default function AfcftaMatrix() {
    const sovereignData = [
        {
            country: "ZAF",
            name: "South Africa",
            axisScore: 82,
            trend: "+1.2%",
            highlights: ["Battery Metals", "Tech Transfer"],
            status: "OPTIMAL"
        },
        {
            country: "NGA",
            name: "Nigeria",
            axisScore: 76,
            trend: "+0.8%",
            highlights: ["Fintech Growth", "Energy Reform"],
            status: "STABLE"
        },
        {
            country: "COD",
            name: "DR Congo",
            axisScore: 45,
            trend: "-2.1%",
            highlights: ["Cobalt Export", "Resource Drain"],
            status: "EXTRACTIVE"
        },
        {
            country: "KEN",
            name: "Kenya",
            axisScore: 79,
            trend: "+3.4%",
            highlights: ["Green Energy", "Digital Grid"],
            status: "OPTIMAL"
        },
        {
            country: "ZWE",
            name: "Zimbabwe",
            axisScore: 61,
            trend: "+0.5%",
            highlights: ["Lithium Ban", "Local Refining"],
            status: "IMPROVING"
        }
    ];

    const getScoreColor = (score: number) => {
        if (score >= 75) return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]";
        if (score >= 60) return "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]";
        return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "OPTIMAL": return "text-green-500 border-green-500/30 bg-green-500/10";
            case "STABLE": return "text-cobalt border-cobalt/30 bg-cobalt/10";
            case "IMPROVING": return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
            case "EXTRACTIVE": return "text-red-500 border-red-500/30 bg-red-500/10";
            default: return "text-slate-light border-slate-light/30 bg-slate-light/10";
        }
    };

    return (
        <aside className="w-80 border-r border-border bg-panel backdrop-blur-sm flex flex-col shrink-0">
            <div className="p-4 border-b border-border">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cobalt" />
                    Sovereignty Index
                </h2>
                <p className="text-[10px] text-slate-light mt-1 font-mono">
                    AGGREGATING RESOURCE BENEFICIATION
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
                {sovereignData.map((data, i) => (
                    <div key={i} className="p-3 border border-border/50 rounded-md bg-background/50 hover:bg-background/80 transition-colors cursor-pointer group">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold flex items-center gap-2">
                                {data.country}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getStatusColor(data.status)}`}>
                                    {data.status}
                                </span>
                            </span>
                            <span className={`text-xs ${data.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                                {data.trend}
                            </span>
                        </div>

                        <div className="text-[10px] text-slate-light mb-3 tracking-wide">
                            {data.name.toUpperCase()}
                        </div>

                        <div className="flex justify-between items-center text-[10px] mb-1">
                            <span>AXIS SCORE</span>
                            <span>{data.axisScore}/100</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-3">
                            <div
                                className={`h-full transition-all duration-1000 ${getScoreColor(data.axisScore)}`}
                                style={{ width: `${data.axisScore}%` }}
                            ></div>
                        </div>

                        <div className="flex gap-2">
                            {data.highlights.map((highlight, idx) => (
                                <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-white/5 dark:bg-black/20 border border-border/50 rounded flex items-center gap-1 text-slate-light">
                                    {idx === 0 ? <Pickaxe className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                                    {highlight.toUpperCase()}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
