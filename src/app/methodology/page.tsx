import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Methodology",
    description:
        "How the AXIS Score is calculated — a composite index measuring African sovereignty through Infrastructure Control, Policy Independence, Currency Stability, and Resource Wealth.",
    alternates: { canonical: "https://axis-mocha.vercel.app/methodology" },
};

const pillars = [
    {
        label: "Infrastructure Control",
        weight: "25 %",
        color: "border-blue-500/50 bg-blue-500/10",
        accent: "text-blue-400",
        description:
            "Measures the degree to which critical infrastructure — ports, rail, energy grids, and digital backbone — is domestically owned, operated, and financed. Higher scores indicate fewer concession agreements with external actors and greater reinvestment of infrastructure revenue into the national economy.",
        indicators: [
            "Domestic ownership share of transport corridors",
            "Energy grid self-sufficiency ratio",
            "Telecom backbone local equity stake",
            "Active infrastructure concession exposure",
        ],
    },
    {
        label: "Policy Independence",
        weight: "25 %",
        color: "border-emerald-500/50 bg-emerald-500/10",
        accent: "text-emerald-400",
        description:
            "Evaluates legislative and regulatory autonomy — the ability of a government to set trade terms, mining codes, and beneficiation policies without undue external pressure. Countries that have enacted raw-material export bans or local-processing mandates score higher.",
        indicators: [
            "Beneficiation legislation strength index",
            "IMF / World Bank conditionality exposure",
            "Trade agreement autonomy score",
            "Mining code local-content requirements",
        ],
    },
    {
        label: "Currency Stability",
        weight: "25 %",
        color: "border-amber-500/50 bg-amber-500/10",
        accent: "text-amber-400",
        description:
            "Tracks exchange-rate volatility, dollarization risk, and central-bank reserve adequacy. A stable, convertible currency that retains purchasing power signals economic sovereignty. CFA-zone membership and currency-board constraints are factored in.",
        indicators: [
            "12-month exchange-rate volatility (σ)",
            "Foreign-reserve import-cover months",
            "Dollarization / CFA-peg dependency flag",
            "Inflation differential vs. trade partners",
        ],
    },
    {
        label: "Resource Wealth",
        weight: "25 %",
        color: "border-purple-500/50 bg-purple-500/10",
        accent: "text-purple-400",
        description:
            "Quantifies the breadth and strategic value of a nation's natural endowment — particularly minerals critical to the global energy transition (lithium, cobalt, graphite, rare earths). This pillar does not reward extraction alone; it rewards domestic value capture from those resources.",
        indicators: [
            "Strategic mineral diversity count",
            "Global supply-chain share for critical minerals",
            "In-country refining / smelting capacity",
            "Export revenue retained domestically",
        ],
    },
];

export default function MethodologyPage() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            {/* Header bar */}
            <header className="border-b border-border bg-black/20 backdrop-blur-md sticky top-0 z-40">
                <div className="max-w-5xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
                    <Link
                        href="/"
                        className="text-xs font-mono tracking-[0.3em] text-slate-light hover:text-cobalt transition-colors"
                    >
                        ← BACK TO DASHBOARD
                    </Link>
                    <span className="text-[10px] font-mono text-slate-light tracking-widest hidden sm:inline">
                        AXIS AFRICA // METHODOLOGY
                    </span>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20 space-y-16">
                {/* Title */}
                <section className="space-y-4 max-w-3xl">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        How the <span className="text-cobalt">AXIS Score</span> Works
                    </h1>
                    <p className="text-sm sm:text-base font-mono text-slate-light leading-relaxed">
                        The AXIS Score is a composite sovereignty index ranging from{" "}
                        <strong className="text-foreground">0</strong> (fully
                        extractive) to{" "}
                        <strong className="text-foreground">100</strong> (fully
                        sovereign). It is derived from four equally-weighted
                        pillars that together capture how much value an African
                        nation retains from its own resources, policies, and
                        economic infrastructure.
                    </p>
                </section>

                {/* Formula banner */}
                <section className="border border-cobalt/30 bg-cobalt/5 rounded-xl p-6 sm:p-8 space-y-3">
                    <h2 className="text-xs font-mono tracking-widest text-cobalt uppercase">
                        Composite Formula
                    </h2>
                    <p className="font-mono text-lg sm:text-xl text-foreground">
                        AXIS&nbsp;=&nbsp;0.25&thinsp;×&thinsp;
                        <span className="text-blue-400">IC</span>
                        &ensp;+&ensp;0.25&thinsp;×&thinsp;
                        <span className="text-emerald-400">PI</span>
                        &ensp;+&ensp;0.25&thinsp;×&thinsp;
                        <span className="text-amber-400">CS</span>
                        &ensp;+&ensp;0.25&thinsp;×&thinsp;
                        <span className="text-purple-400">RW</span>
                    </p>
                    <p className="text-[11px] font-mono text-slate-light">
                        IC = Infrastructure Control · PI = Policy Independence ·
                        CS = Currency Stability · RW = Resource Wealth
                    </p>
                </section>

                {/* Pillar cards */}
                <section className="space-y-6">
                    <h2 className="text-xs font-mono tracking-widest text-slate-light uppercase">
                        The Four Pillars
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {pillars.map((p) => (
                            <div
                                key={p.label}
                                className={`border ${p.color} rounded-xl p-6 space-y-4`}
                            >
                                <div className="flex items-center justify-between">
                                    <h3
                                        className={`text-sm font-bold font-mono tracking-wider uppercase ${p.accent}`}
                                    >
                                        {p.label}
                                    </h3>
                                    <span className="text-[10px] font-mono text-slate-light border border-border rounded-full px-2 py-0.5">
                                        WEIGHT {p.weight}
                                    </span>
                                </div>
                                <p className="text-xs font-mono text-slate-light leading-relaxed">
                                    {p.description}
                                </p>
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-mono text-slate-light uppercase tracking-wider">
                                        Key Indicators
                                    </span>
                                    {p.indicators.map((ind) => (
                                        <div
                                            key={ind}
                                            className="flex items-center gap-2 text-[11px] font-mono text-foreground/80"
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${p.accent} bg-current shrink-0`} />
                                            {ind}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Classification bands */}
                <section className="space-y-6">
                    <h2 className="text-xs font-mono tracking-widest text-slate-light uppercase">
                        Sovereignty Classifications
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { band: "OPTIMAL", range: "75–100", color: "text-green-400 border-green-500/40 bg-green-500/10" },
                            { band: "STABLE", range: "60–74", color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
                            { band: "IMPROVING", range: "45–59", color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
                            { band: "EXTRACTIVE", range: "0–44", color: "text-red-400 border-red-500/40 bg-red-500/10" },
                        ].map((b) => (
                            <div
                                key={b.band}
                                className={`border ${b.color} rounded-lg p-4 text-center space-y-1`}
                            >
                                <div className="text-xs font-mono font-bold tracking-widest">
                                    {b.band}
                                </div>
                                <div className="text-lg font-bold font-mono">
                                    {b.range}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Disclaimer */}
                <section className="border-t border-border pt-8 space-y-3">
                    <h2 className="text-xs font-mono tracking-widest text-slate-light uppercase">
                        Data Sources & Disclaimer
                    </h2>
                    <p className="text-xs font-mono text-slate-light leading-relaxed max-w-3xl">
                        AXIS Africa aggregates publicly available data from the African Development Bank, 
                        World Bank, IMF, LME, COMEX, LBMA, Fastmarkets, national mining ministries, and 
                        credible OSINT sources. Scores are intended as a strategic intelligence tool, 
                        not as investment advice. The trajectory projections shown in the dashboard are 
                        modeled estimates based on current trend direction, not historical measurements.
                    </p>
                    <p className="text-xs font-mono text-slate-light/60">
                        © {new Date().getFullYear()} AXIS AFRICA · V1.0
                    </p>
                </section>
            </div>
        </main>
    );
}
