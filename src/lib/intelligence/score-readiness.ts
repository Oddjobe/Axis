import type { CountryCompositeScore } from "./score-methodology";
import type { ScoreSourceDiagnostic } from "./score-observations";
import {
  AFRICAN_ISO3_CODES,
  DATASET_TRUST_POLICIES,
  type AfricanIso3,
} from "./trust";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const MIN_TRUSTED_SCORE_CONFIDENCE =
  DATASET_TRUST_POLICIES["country-score"].minimumConfidence;
export const MIN_TRUSTED_SCORE_COVERAGE = 0.8;

export type ScoreReadinessBlocker =
  | "coverage_below_threshold"
  | "confidence_below_threshold"
  | "missing_or_invalid_as_of"
  | "stale_score";

export interface CountryScoreReadiness {
  country: AfricanIso3;
  ready: boolean;
  coverage: number;
  confidence: number;
  recency: number;
  asOf: string;
  reportedCoverage: number;
  reportedConfidence: number;
  reportedAsOf: string;
  blockers: ScoreReadinessBlocker[];
  indicatorGaps: string[];
  staleObservationIds: string[];
}

export interface ScoreReadinessReport {
  schemaVersion: "axis-score-readiness/v1";
  dataset: "country-score";
  generatedAt: string;
  methodologyVersion: string | null;
  gates: {
    requiredUniqueCountries: 54;
    minimumConfidence: number;
    minimumCoverage: number;
    maximumAgeDays: number;
  };
  summary: {
    scoredCountries: number;
    uniqueCountries: number;
    readyCountries: number;
    blockedCountries: number;
    promotable: boolean;
  };
  missingCountries: AfricanIso3[];
  duplicateCountries: AfricanIso3[];
  countries: CountryScoreReadiness[];
  sources: ScoreSourceDiagnostic[];
  legacyRefresh: {
    status: "pending" | "refreshed" | "failed" | "not_attempted";
    detail: string;
  };
  promotion: {
    status: "eligible" | "published" | "retained";
    previousTrustedReleaseRetained: boolean;
    detail: string;
  };
  operation: {
    status: "pending" | "success" | "failed";
    phase: "readiness" | "configuration" | "legacy_refresh" | "trusted_promotion";
    detail: string;
  };
}

function isStale(
  timestamp: string | null | undefined,
  generatedAt: string,
): boolean {
  const observed = timestamp ? Date.parse(timestamp) : Number.NaN;
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(generated)) return true;
  const age = generated - observed;
  return age < -DAY_MS
    || age > DATASET_TRUST_POLICIES["country-score"].maximumAgeMs;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function observationRecency(timestamp: string, generatedAt: string): number {
  const ageMs = Math.max(0, Date.parse(generatedAt) - Date.parse(timestamp));
  const ageYears = Math.floor(ageMs / (365 * DAY_MS));
  return Math.max(0.5, 1 - ageYears * 0.1);
}

export function evaluateScoreReadiness(
  scores: readonly CountryCompositeScore[],
  {
    generatedAt = new Date().toISOString(),
    sourceDiagnostics = [],
  }: {
    generatedAt?: string;
    sourceDiagnostics?: readonly ScoreSourceDiagnostic[];
  } = {},
): ScoreReadinessReport {
  const counts = new Map<string, number>();
  for (const score of scores) {
    counts.set(score.country, (counts.get(score.country) ?? 0) + 1);
  }
  const expected = new Set<string>(AFRICAN_ISO3_CODES);
  const missingCountries = AFRICAN_ISO3_CODES.filter(
    (country) => !counts.has(country),
  );
  const duplicateCountries = AFRICAN_ISO3_CODES.filter(
    (country) => (counts.get(country) ?? 0) > 1,
  );
  const byCountry = new Map(scores.map((score) => [score.country, score]));

  const countries = AFRICAN_ISO3_CODES.flatMap((country) => {
    const score = byCountry.get(country);
    if (!score) return [];
    const observed = score.indicators.filter((indicator) => !indicator.imputed);
    const stale = observed.filter((indicator) =>
      isStale(indicator.provenance.observedAt, generatedAt)
    );
    const fresh = observed.filter((indicator) =>
      !isStale(indicator.provenance.observedAt, generatedAt)
    );
    const coverage = round(fresh.length / score.indicators.length);
    const recency = fresh.length
      ? round(
          fresh.reduce(
            (total, indicator) =>
              total
              + observationRecency(
                indicator.provenance.observedAt!,
                generatedAt,
              ),
            0,
          ) / fresh.length,
        )
      : 0;
    const confidence = round(
      coverage * score.confidence.sourceQuality * recency,
    );
    const evidenceDates = fresh
      .map((indicator) => indicator.provenance.observedAt!)
      .sort((left, right) => Date.parse(left) - Date.parse(right));
    const staleDates = stale
      .map((indicator) => indicator.provenance.observedAt!)
      .sort((left, right) => Date.parse(left) - Date.parse(right));
    const evidenceAsOf = evidenceDates[0] ?? staleDates[0] ?? score.asOf;
    const blockers: ScoreReadinessBlocker[] = [];
    if (coverage < MIN_TRUSTED_SCORE_COVERAGE) {
      blockers.push("coverage_below_threshold");
    }
    if (confidence < MIN_TRUSTED_SCORE_CONFIDENCE) {
      blockers.push("confidence_below_threshold");
    }
    if (fresh.length === 0 || !Number.isFinite(Date.parse(evidenceAsOf))) {
      blockers.push("missing_or_invalid_as_of");
    }
    if (fresh.length === 0 && stale.length > 0) {
      blockers.push("stale_score");
    }
    return [{
      country,
      ready: blockers.length === 0,
      coverage,
      confidence,
      recency,
      asOf: evidenceAsOf,
      reportedCoverage: score.coverage,
      reportedConfidence: score.confidence.overall,
      reportedAsOf: score.asOf,
      blockers,
      indicatorGaps: score.indicators
        .filter((indicator) => indicator.imputed)
        .map((indicator) => indicator.id),
      staleObservationIds: stale.map((indicator) => indicator.id),
    }];
  });

  const uniqueCountries = [...counts.keys()].filter((country) =>
    expected.has(country)
  ).length;
  const readyCountries = countries.filter((country) => country.ready).length;
  const promotable =
    scores.length === AFRICAN_ISO3_CODES.length
    && uniqueCountries === AFRICAN_ISO3_CODES.length
    && missingCountries.length === 0
    && duplicateCountries.length === 0
    && readyCountries === AFRICAN_ISO3_CODES.length;
  const methodologyVersions = new Set(
    scores.map((score) => score.methodologyVersion),
  );

  return {
    schemaVersion: "axis-score-readiness/v1",
    dataset: "country-score",
    generatedAt,
    methodologyVersion:
      methodologyVersions.size === 1
        ? scores[0]?.methodologyVersion ?? null
        : null,
    gates: {
      requiredUniqueCountries: 54,
      minimumConfidence: MIN_TRUSTED_SCORE_CONFIDENCE,
      minimumCoverage: MIN_TRUSTED_SCORE_COVERAGE,
      maximumAgeDays:
        DATASET_TRUST_POLICIES["country-score"].maximumAgeMs / DAY_MS,
    },
    summary: {
      scoredCountries: scores.length,
      uniqueCountries,
      readyCountries,
      blockedCountries: AFRICAN_ISO3_CODES.length - readyCountries,
      promotable,
    },
    missingCountries,
    duplicateCountries,
    countries,
    sources: [...sourceDiagnostics],
    legacyRefresh: {
      status: "pending",
      detail: "Legacy country refresh has not run.",
    },
    promotion: promotable
      ? {
          status: "eligible",
          previousTrustedReleaseRetained: true,
          detail: "All trusted release gates passed; promotion has not run.",
        }
      : {
          status: "retained",
          previousTrustedReleaseRetained: true,
          detail:
            "Trusted promotion was blocked; the previous trusted release remains authoritative.",
        },
    operation: {
      status: "pending",
      phase: "readiness",
      detail: "Readiness was evaluated; persistence has not run.",
    },
  };
}

export function serializeScoreReadinessReport(
  report: ScoreReadinessReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
