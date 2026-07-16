import type { Metadata } from "next";
import Link from "next/link";
import { AXIS_TAGLINE } from "@/lib/brand";
import { SCORE_METHODOLOGY } from "@/lib/intelligence/score-methodology";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "The transparent, deterministic and versioned methodology behind the AXIS sovereignty composite.",
  alternates: { canonical: "https://axis-mocha.vercel.app/methodology" },
};

const colors = [
  "border-blue-500/50 bg-blue-500/10 text-blue-400",
  "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  "border-amber-500/50 bg-amber-500/10 text-amber-400",
  "border-purple-500/50 bg-purple-500/10 text-purple-400",
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="font-mono text-xs tracking-[0.3em] text-slate-light transition-colors hover:text-cobalt"
          >
            ← BACK TO DASHBOARD
          </Link>
          <span className="hidden font-mono text-[10px] tracking-widest text-slate-light sm:inline">
            AXIS AFRICA // METHODOLOGY
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-8 sm:py-20">
        <section className="max-w-3xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How the <span className="text-cobalt">AXIS Score</span> Works
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-cobalt">
            {AXIS_TAGLINE}
          </p>
          <p className="font-mono text-sm leading-relaxed text-slate-light sm:text-base">
            The AXIS Score is a reproducible 0–100 composite of eight named
            World Bank indicators. It measures infrastructure capacity, fiscal
            and policy capacity, monetary resilience, and resource endowment
            with domestic value capture. It is not an AI-generated score.
          </p>
          <div className="flex flex-wrap gap-2 font-mono text-[10px]">
            <span className="rounded border border-cobalt/40 bg-cobalt/10 px-3 py-1 text-cobalt">
              VERSION {SCORE_METHODOLOGY.version}
            </span>
            <span className="rounded border border-border px-3 py-1 text-slate-light">
              BASELINE AS OF {SCORE_METHODOLOGY.baselineAsOf.slice(0, 10)}
            </span>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-cobalt/30 bg-cobalt/5 p-6 sm:p-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-cobalt">
            Composite Formula
          </h2>
          <p className="font-mono text-base text-foreground sm:text-lg">
            AXIS = 0.25 × Infrastructure + 0.25 × Policy + 0.25 × Monetary
            Resilience + 0.25 × Resource &amp; Value Capture
          </p>
          <p className="font-mono text-xs leading-relaxed text-slate-light">
            Within each dimension, both indicators carry 50% weight. Values
            are clamped to the fixed bounds below, linearly normalized to
            0–100, and inverted where lower is better. The final composite is
            rounded to the nearest integer.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-slate-light">
            Dimensions, Inputs &amp; Citations
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {SCORE_METHODOLOGY.dimensions.map((dimension, index) => {
              const color = colors[index];
              return (
                <article
                  key={dimension.id}
                  className={`space-y-4 rounded-xl border p-6 ${color}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                      {dimension.name}
                    </h3>
                    <span className="whitespace-nowrap rounded-full border border-current px-2 py-0.5 font-mono text-[10px]">
                      WEIGHT {dimension.weight * 100}%
                    </span>
                  </div>
                  <p className="font-mono text-xs leading-relaxed text-slate-light">
                    {dimension.description}
                  </p>
                  <div className="space-y-3">
                    {dimension.indicators.map((indicator) => (
                      <div
                        key={indicator.id}
                        className="rounded border border-border/70 bg-background/40 p-3"
                      >
                        <a
                          href={indicator.source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs font-semibold text-foreground hover:underline"
                        >
                          {indicator.name} ↗
                        </a>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-light">
                          {indicator.id} · {indicator.weight * 100}% of dimension
                          · {indicator.direction === "higher" ? "higher is better" : "lower is better"}
                          {" · "}bounds {indicator.normalization.min}–
                          {indicator.normalization.max} {indicator.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-cobalt">
              Missing Data &amp; Coverage
            </h2>
            <p className="font-mono text-xs leading-relaxed text-slate-light">
              {SCORE_METHODOLOGY.missingDataPolicy}
            </p>
            <p className="font-mono text-xs leading-relaxed text-slate-light">
              {SCORE_METHODOLOGY.coverage}
            </p>
          </div>
          <div className="space-y-3 rounded-xl border border-border p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-cobalt">
              Confidence
            </h2>
            <p className="font-mono text-xs leading-relaxed text-slate-light">
              {SCORE_METHODOLOGY.confidence}
            </p>
            <p className="font-mono text-xs leading-relaxed text-slate-light">
              High confidence is ≥ 0.80, medium is 0.60–0.79, and low is below
              0.60. The API identifies every imputed input and returns
              country-level coverage, confidence, sources, observation years,
              and methodology version.
            </p>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-slate-light">
            Sovereignty Classifications
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["OPTIMAL", "75–100", "text-green-400 border-green-500/40 bg-green-500/10"],
              ["STABLE", "60–74", "text-blue-400 border-blue-500/40 bg-blue-500/10"],
              ["IMPROVING", "51–59", "text-amber-400 border-amber-500/40 bg-amber-500/10"],
              ["EXTRACTIVE", "0–50", "text-red-400 border-red-500/40 bg-red-500/10"],
            ].map(([band, range, color]) => (
              <div key={band} className={`space-y-1 rounded-lg border p-4 text-center ${color}`}>
                <div className="font-mono text-xs font-bold tracking-widest">{band}</div>
                <div className="font-mono text-lg font-bold">{range}</div>
              </div>
            ))}
          </div>
          <p className="font-mono text-[11px] text-slate-light">
            Status is derived exclusively from the published numeric score.
          </p>
        </section>

        <section className="space-y-3 border-t border-border pt-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-slate-light">
            Provenance &amp; Limitations
          </h2>
          <p className="max-w-3xl font-mono text-xs leading-relaxed text-slate-light">
            The bundled baseline contains the latest available 2019–2024
            observations retrieved from the World Bank Indicator API on{" "}
            {SCORE_METHODOLOGY.baselineRetrievedAt.slice(0, 10)}. Fixed
            normalization bounds make the same inputs produce the same score
            and allow historical comparisons without cross-country rank drift.
            The score is a strategic analytical aid, not investment advice,
            and does not claim to directly observe every aspect of sovereignty.
          </p>
          <p className="font-mono text-[11px] text-slate-light/70">
            Machine-readable methodology and country-level evidence:{" "}
            <Link href="/api/public/scores" className="text-cobalt hover:underline">
              /api/public/scores
            </Link>
          </p>
          <p className="font-mono text-xs text-slate-light/60">
            © {new Date().getFullYear()} AXIS AFRICA · {SCORE_METHODOLOGY.version}
          </p>
        </section>
      </div>
    </main>
  );
}
