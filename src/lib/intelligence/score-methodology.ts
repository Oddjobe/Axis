import {
  AFRICAN_ISO3_CODES,
  STATIC_SCORE_BASELINE_AS_OF,
  deriveSovereigntyStatus,
  type AfricanIso3,
  type SovereigntyStatus,
} from "./trust";
import {
  BASELINE_OBSERVATION_TUPLES,
  SCORE_BASELINE_RETRIEVED_AT,
} from "./score-baseline";

export const SCORE_METHODOLOGY_VERSION = "axis-sovereignty-1.0.0";
export const SCORE_BASELINE_AS_OF = STATIC_SCORE_BASELINE_AS_OF;

export type DimensionId =
  | "infrastructureControl"
  | "policyIndependence"
  | "currencyStability"
  | "resourceWealth";
export type IndicatorDirection = "higher" | "lower";

export interface IndicatorDefinition {
  id: string;
  name: string;
  dimension: DimensionId;
  weight: number;
  direction: IndicatorDirection;
  unit: string;
  normalization: { min: number; max: number };
  source: {
    publisher: "World Bank";
    title: string;
    url: string;
  };
}

export interface ScoreObservation {
  country: AfricanIso3;
  indicatorId: string;
  value: number;
  year: number;
}

export interface ScoredIndicator {
  id: string;
  name: string;
  value: number | null;
  year: number | null;
  normalizedScore: number;
  imputed: boolean;
  sourceUrl: string;
}

export interface CountryCompositeScore {
  country: AfricanIso3;
  axisScore: number;
  status: SovereigntyStatus;
  dimensions: Record<DimensionId, number>;
  indicators: ScoredIndicator[];
  coverage: number;
  confidence: {
    overall: number;
    label: "high" | "medium" | "low";
    sourceQuality: number;
    completeness: number;
    recency: number;
  };
  sources: Array<{
    indicatorId: string;
    publisher: string;
    title: string;
    url: string;
    observationYear: number;
  }>;
  asOf: string;
  methodologyVersion: string;
}

const source = (code: string, title: string): IndicatorDefinition["source"] => ({
  publisher: "World Bank",
  title,
  url: `https://data.worldbank.org/indicator/${code}`,
});

export const INDICATOR_DEFINITIONS: readonly IndicatorDefinition[] = [
  {
    id: "EG.ELC.ACCS.ZS",
    name: "Access to electricity",
    dimension: "infrastructureControl",
    weight: 0.5,
    direction: "higher",
    unit: "% of population",
    normalization: { min: 20, max: 100 },
    source: source("EG.ELC.ACCS.ZS", "Access to electricity (% of population)"),
  },
  {
    id: "IT.NET.USER.ZS",
    name: "Individuals using the Internet",
    dimension: "infrastructureControl",
    weight: 0.5,
    direction: "higher",
    unit: "% of population",
    normalization: { min: 10, max: 90 },
    source: source("IT.NET.USER.ZS", "Individuals using the Internet (% of population)"),
  },
  {
    id: "GC.TAX.TOTL.GD.ZS",
    name: "Domestic tax revenue",
    dimension: "policyIndependence",
    weight: 0.5,
    direction: "higher",
    unit: "% of GDP",
    normalization: { min: 5, max: 30 },
    source: source("GC.TAX.TOTL.GD.ZS", "Tax revenue (% of GDP)"),
  },
  {
    id: "DT.TDS.DECT.EX.ZS",
    name: "External debt service burden",
    dimension: "policyIndependence",
    weight: 0.5,
    direction: "lower",
    unit: "% of exports",
    normalization: { min: 0, max: 50 },
    source: source("DT.TDS.DECT.EX.ZS", "Total debt service (% of exports)"),
  },
  {
    id: "FP.CPI.TOTL.ZG",
    name: "Consumer price inflation",
    dimension: "currencyStability",
    weight: 0.5,
    direction: "lower",
    unit: "annual %",
    normalization: { min: 0, max: 25 },
    source: source("FP.CPI.TOTL.ZG", "Inflation, consumer prices (annual %)"),
  },
  {
    id: "FI.RES.TOTL.MO",
    name: "Reserve adequacy",
    dimension: "currencyStability",
    weight: 0.5,
    direction: "higher",
    unit: "months of imports",
    normalization: { min: 0, max: 12 },
    source: source("FI.RES.TOTL.MO", "Total reserves in months of imports"),
  },
  {
    id: "NY.GDP.TOTL.RT.ZS",
    name: "Natural resource endowment",
    dimension: "resourceWealth",
    weight: 0.5,
    direction: "higher",
    unit: "% of GDP in rents",
    normalization: { min: 0, max: 30 },
    source: source("NY.GDP.TOTL.RT.ZS", "Total natural resources rents (% of GDP)"),
  },
  {
    id: "NV.IND.MANF.ZS",
    name: "Domestic manufacturing value capture",
    dimension: "resourceWealth",
    weight: 0.5,
    direction: "higher",
    unit: "% of GDP",
    normalization: { min: 2, max: 25 },
    source: source("NV.IND.MANF.ZS", "Manufacturing, value added (% of GDP)"),
  },
] as const;

export const DIMENSION_DEFINITIONS = [
  {
    id: "infrastructureControl" as const,
    name: "Infrastructure Capacity",
    weight: 0.25,
    description: "Domestic access to foundational electricity and digital infrastructure.",
  },
  {
    id: "policyIndependence" as const,
    name: "Fiscal & Policy Capacity",
    weight: 0.25,
    description: "Domestic revenue capacity and freedom from external debt-service pressure.",
  },
  {
    id: "currencyStability" as const,
    name: "Monetary Resilience",
    weight: 0.25,
    description: "Price stability and reserves available to absorb external shocks.",
  },
  {
    id: "resourceWealth" as const,
    name: "Resource Endowment & Value Capture",
    weight: 0.25,
    description: "Natural-resource endowment balanced with domestic manufacturing value capture.",
  },
] as const;

export const SCORE_METHODOLOGY = {
  name: "AXIS Sovereignty Composite",
  version: SCORE_METHODOLOGY_VERSION,
  scoreRange: { min: 0, max: 100 },
  baselineAsOf: SCORE_BASELINE_AS_OF,
  baselineRetrievedAt: SCORE_BASELINE_RETRIEVED_AT,
  dimensions: DIMENSION_DEFINITIONS.map((dimension) => ({
    ...dimension,
    indicators: INDICATOR_DEFINITIONS.filter(
      (indicator) => indicator.dimension === dimension.id,
    ),
  })),
  normalization:
    "Each indicator is clamped to published, versioned policy bounds and linearly scaled to 0–100. Lower-direction indicators are inverted.",
  missingDataPolicy:
    "A missing observation receives that indicator's fixed bundled-baseline median normalized value. Imputed values affect the score but not coverage; every imputation is identified in the response.",
  coverage:
    "Coverage is the sum of non-imputed indicator weights divided by all indicator weights.",
  confidence:
    "Overall confidence = coverage × 0.95 source quality × weighted observation recency. Recency is 1.0 for 2024+, then falls 0.1 per year to a 0.5 floor.",
  rounding:
    "Indicators and dimensions retain two decimals; the published composite is rounded to the nearest integer.",
  citations: INDICATOR_DEFINITIONS.map((indicator) => ({
    indicatorId: indicator.id,
    ...indicator.source,
  })),
} as const;

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalize(value: number, indicator: IndicatorDefinition): number {
  const { min, max } = indicator.normalization;
  const bounded = Math.min(max, Math.max(min, value));
  const scaled = ((bounded - min) / (max - min)) * 100;
  return round(indicator.direction === "higher" ? scaled : 100 - scaled);
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function getBundledBaselineObservations(): ScoreObservation[] {
  return AFRICAN_ISO3_CODES.flatMap((country) => {
    const tuples = BASELINE_OBSERVATION_TUPLES[country];
    if (tuples.length !== INDICATOR_DEFINITIONS.length) {
      throw new Error(`Invalid score baseline width for ${country}.`);
    }
    return tuples.flatMap((tuple, index) =>
      tuple
        ? [{
            country,
            indicatorId: INDICATOR_DEFINITIONS[index].id,
            year: tuple[0],
            value: tuple[1],
          }]
        : [],
    );
  });
}

const baselineObservations = getBundledBaselineObservations();
const baselineImputationScores = Object.fromEntries(
  INDICATOR_DEFINITIONS.map((indicator) => [
    indicator.id,
    round(median(
      baselineObservations
        .filter((observation) => observation.indicatorId === indicator.id)
        .map((observation) => normalize(observation.value, indicator)),
    )),
  ]),
) as Record<string, number>;

export function computeCompositeScores(
  observations: readonly ScoreObservation[],
): CountryCompositeScore[] {
  const observationMap = new Map(
    observations.map((observation) => [
      `${observation.country}:${observation.indicatorId}`,
      observation,
    ]),
  );

  return AFRICAN_ISO3_CODES.map((country) => {
    const indicators: ScoredIndicator[] = INDICATOR_DEFINITIONS.map((definition) => {
      const observation = observationMap.get(`${country}:${definition.id}`);
      return {
        id: definition.id,
        name: definition.name,
        value: observation?.value ?? null,
        year: observation?.year ?? null,
        normalizedScore: observation
          ? normalize(observation.value, definition)
          : baselineImputationScores[definition.id],
        imputed: !observation,
        sourceUrl: definition.source.url,
      };
    });

    const dimensions = Object.fromEntries(
      DIMENSION_DEFINITIONS.map((dimension) => {
        const definitions = INDICATOR_DEFINITIONS.filter(
          (indicator) => indicator.dimension === dimension.id,
        );
        const score = definitions.reduce((total, definition) => {
          const indicator = indicators.find((item) => item.id === definition.id);
          return total + (indicator?.normalizedScore ?? 0) * definition.weight;
        }, 0);
        return [dimension.id, round(score)];
      }),
    ) as Record<DimensionId, number>;

    const composite = DIMENSION_DEFINITIONS.reduce(
      (total, dimension) => total + dimensions[dimension.id] * dimension.weight,
      0,
    );
    const present = indicators.filter((indicator) => !indicator.imputed);
    const coverage = round(present.length / INDICATOR_DEFINITIONS.length);
    const recency = present.length
      ? round(
          present.reduce((total, indicator) => {
            const age = Math.max(0, 2024 - (indicator.year ?? 2024));
            return total + Math.max(0.5, 1 - age * 0.1);
          }, 0) / present.length,
        )
      : 0;
    const overall = round(coverage * 0.95 * recency);
    const axisScore = Math.round(composite);
    const years = present
      .map((indicator) => indicator.year)
      .filter((year): year is number => year !== null);

    return {
      country,
      axisScore,
      status: deriveSovereigntyStatus(axisScore),
      dimensions,
      indicators,
      coverage,
      confidence: {
        overall,
        label: overall >= 0.8 ? "high" : overall >= 0.6 ? "medium" : "low",
        sourceQuality: 0.95,
        completeness: coverage,
        recency,
      },
      sources: present.map((indicator) => {
        const definition = INDICATOR_DEFINITIONS.find(
          (candidate) => candidate.id === indicator.id,
        );
        if (!definition || indicator.year === null) {
          throw new Error(`Missing indicator definition for ${indicator.id}.`);
        }
        return {
          indicatorId: definition.id,
          ...definition.source,
          observationYear: indicator.year,
        };
      }),
      asOf: years.length
        ? `${Math.max(...years)}-12-31T00:00:00.000Z`
        : SCORE_BASELINE_AS_OF,
      methodologyVersion: SCORE_METHODOLOGY_VERSION,
    };
  });
}

export const BASELINE_COUNTRY_SCORES = computeCompositeScores(
  baselineObservations,
);

export const BASELINE_SCORE_BY_ISO = Object.fromEntries(
  BASELINE_COUNTRY_SCORES.map((score) => [score.country, score]),
) as Record<AfricanIso3, CountryCompositeScore>;
