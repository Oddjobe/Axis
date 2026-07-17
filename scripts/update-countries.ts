import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ALL_SOVEREIGN_DATA } from "../src/lib/mock-data";
import {
  computeCompositeScores,
} from "../src/lib/intelligence/score-methodology";
import {
  loadWorldBankObservations,
  type ObservationLoadResult,
  type WorldBankLoadOptions,
} from "../src/lib/intelligence/score-observations";
import {
  evaluateScoreReadiness,
  MIN_TRUSTED_SCORE_CONFIDENCE,
  MIN_TRUSTED_SCORE_COVERAGE,
  serializeScoreReadinessReport,
  type ScoreReadinessReport,
} from "../src/lib/intelligence/score-readiness";
import {
  AFRICAN_ISO3_CODES,
  africanIso3Schema,
} from "../src/lib/intelligence/trust";
import {
  classifyLegacyRecord,
  stableRecordHash,
  type LegacyRecord,
  type RolloutItem,
} from "../src/lib/intelligence/trust-rollout";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;
export interface CountryRow {
  id: string;
  name: string;
  axisScore: number;
  trend: string;
  resourceWealth: number;
  population: number;
  gdp: number;
  topExport: string;
  fdiClimate: string;
  strategicFocus: string;
  updated_at: string;
}

const SCORE_SOURCE_URL = "https://axis-mocha.vercel.app/methodology";
const DEFAULT_READINESS_REPORT =
  "quality-reports/score-readiness-report.json";
export {
  MIN_TRUSTED_SCORE_CONFIDENCE,
  MIN_TRUSTED_SCORE_COVERAGE,
};

function missingScoreReleaseMigration(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202"
    || error.code === "42883"
    || (
      message.includes("publish_country_score_release")
      && (
        message.includes("schema cache")
        || message.includes("could not find")
        || message.includes("does not exist")
      )
    )
  );
}

export function buildTrustedScoreRelease(
  scores: ReturnType<typeof computeCompositeScores>,
  generatedAt = new Date().toISOString(),
): { releaseId: string; releaseHash: string; records: LegacyRecord[] } {
  if (
    scores.length !== AFRICAN_ISO3_CODES.length
    || new Set(scores.map((score) => score.country)).size
      !== AFRICAN_ISO3_CODES.length
  ) {
    throw new Error("Trusted score releases require exactly 54 unique countries.");
  }
  const readiness = evaluateScoreReadiness(scores, { generatedAt });
  if (!readiness.summary.promotable) {
    const blocked = readiness.countries.find((country) => !country.ready);
    throw new Error(
      blocked
        ? `Trusted score release rejected for ${blocked.country}: `
          + `${blocked.blockers.join(", ")} (fresh coverage ${blocked.coverage}, `
          + `fresh confidence ${blocked.confidence}).`
        : "Trusted score release rejected: readiness gates did not pass.",
    );
  }
  const readinessByCountry = new Map(
    readiness.countries.map((country) => [country.country, country]),
  );
  const releaseBody = scores.map((score) => {
    const countryReadiness = readinessByCountry.get(score.country)!;
    const publisherTimestamps = score.indicators
      .filter((indicator) => !indicator.imputed && indicator.year !== null)
      .map((indicator) => indicator.provenance.sourcePublishedAt)
      .filter((timestamp): timestamp is string =>
        typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))
      );
    if (
      publisherTimestamps.length
        !== score.indicators.filter(
          (indicator) => !indicator.imputed && indicator.year !== null,
        ).length
    ) {
      throw new Error(
        `Trusted score release rejected for ${score.country}: explicit publisher timestamps are required for every source observation.`,
      );
    }
    const sourcePublishedAt = publisherTimestamps.sort(
      (left, right) => Date.parse(right) - Date.parse(left),
    )[0];
    return {
      dataset: "country-score",
      country: score.country,
      id: score.country,
      axisScore: score.axisScore,
      status: score.status,
      dimensions: score.dimensions,
      indicators: score.indicators,
      coverage: countryReadiness.coverage,
      confidence: {
        ...score.confidence,
        overall: countryReadiness.confidence,
        completeness: countryReadiness.coverage,
        recency: countryReadiness.recency,
      },
      sources: score.sources,
      methodologyVersion: score.methodologyVersion,
      source: "World Bank",
      sourceUrl: SCORE_SOURCE_URL,
      canonicalUrl: SCORE_SOURCE_URL,
      observedAt: countryReadiness.asOf,
      sourcePublishedAt,
    };
  });
  const releaseHash = stableRecordHash(releaseBody);
  const latestAsOf = releaseBody.reduce(
    (latest, record) =>
      Date.parse(record.observedAt) > Date.parse(latest)
        ? record.observedAt
        : latest,
    releaseBody[0]?.observedAt ?? generatedAt,
  );
  const releaseId =
    `country-score:${latestAsOf.slice(0, 10)}:${releaseHash.slice(0, 16)}`;
  const records = releaseBody.map((record) => {
    const prepared = {
      ...record,
      releaseId,
      releaseHash,
      retrievedAt: generatedAt,
    };
    const classified = classifyLegacyRecord(
      "country-score",
      prepared,
      new Date(generatedAt),
    );
    assertPublishableScoreClassification(record.country, classified);
    return {
      ...prepared,
      classificationDisposition: classified.disposition,
      classificationConfidence: classified.confidence,
      contentHash: stableRecordHash(prepared),
    };
  });
  return { releaseId, releaseHash, records };
}

export function assertPublishableScoreClassification(
  country: string,
  classification: Pick<RolloutItem, "disposition" | "reasons">,
): void {
  if (classification.disposition !== "quarantine") return;
  throw new Error(
    `Trusted score release validation failed for ${country}: `
    + classification.reasons.map((reason) => reason.code).join(", "),
  );
}

export async function persistScoreRelease(
  client: SupabaseClient,
  rows: readonly CountryRow[],
  records: readonly LegacyRecord[],
): Promise<"trusted"> {
  if (
    rows.length !== AFRICAN_ISO3_CODES.length
    || records.length !== AFRICAN_ISO3_CODES.length
  ) {
    throw new Error("Refusing to publish an incomplete country score release.");
  }
  for (const record of records) {
    const confidence =
      record.confidence && typeof record.confidence === "object"
        ? Number((record.confidence as LegacyRecord).overall)
        : Number.NaN;
    const coverage = Number(record.coverage);
    if (
      record.classificationDisposition !== "clean"
      || !Number.isFinite(confidence)
      || confidence < MIN_TRUSTED_SCORE_CONFIDENCE
      || !Number.isFinite(coverage)
      || coverage < MIN_TRUSTED_SCORE_COVERAGE
    ) {
      throw new Error(
        `Refusing to persist rejected trusted score ${String(record.country)}.`,
      );
    }
  }
  const atomicWrite = await client.rpc("publish_country_score_release", {
    p_release_records: records,
    p_country_rows: rows,
    p_minimum_confidence: MIN_TRUSTED_SCORE_CONFIDENCE,
    p_minimum_coverage: MIN_TRUSTED_SCORE_COVERAGE,
  });
  if (!atomicWrite.error) return "trusted";
  throw new Error(
    missingScoreReleaseMigration(atomicWrite.error)
      ? "Trusted score promotion migration is unavailable; previous trusted release retained: "
        + atomicWrite.error.message
      : "Atomic trusted score publication failed; previous trusted release retained: "
        + atomicWrite.error.message,
  );
}

function parseMetricSafe(
  value: string | number | undefined,
  isGdp = false,
): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return Math.floor(value);

  let cleanValue = value.replace(/,/g, "").replace(/\$/g, "");
  let multiplier = 1;
  if (cleanValue.toUpperCase().endsWith("B")) {
    multiplier = isGdp ? 1_000 : 1_000_000_000;
    cleanValue = cleanValue.slice(0, -1);
  } else if (cleanValue.toUpperCase().endsWith("M")) {
    multiplier = isGdp ? 1 : 1_000_000;
    cleanValue = cleanValue.slice(0, -1);
  }

  return Math.min(
    Math.round(Number.parseFloat(cleanValue) * multiplier) || 0,
    2_147_483_647,
  );
}

export function buildLegacyCountryRows(
  scores: ReturnType<typeof computeCompositeScores>,
): CountryRow[] {
  const scoreByIso = new Map(scores.map((score) => [score.country, score]));
  return ALL_SOVEREIGN_DATA.map((country) => {
    const score = scoreByIso.get(africanIso3Schema.parse(country.country));
    if (!score) throw new Error(`No deterministic score for ${country.country}.`);

    return {
      id: country.country,
      name: country.name,
      axisScore: score.axisScore,
      trend: country.trend,
      resourceWealth: Math.round(score.dimensions.resourceWealth),
      population: parseMetricSafe(country.population),
      gdp: parseMetricSafe(country.gdp ?? "10B", true),
      topExport: country.topExport ?? country.keyResources[0] ?? "Commodities",
      fdiClimate: country.fdiClimate ?? "Stable",
      strategicFocus: country.strategicFocus ?? "Infrastructure Capacity",
      updated_at: score.asOf,
    };
  });
}

export async function persistLegacyCountryRefresh(
  client: SupabaseClient,
  rows: readonly CountryRow[],
): Promise<void> {
  if (
    rows.length !== AFRICAN_ISO3_CODES.length
    || new Set(rows.map((row) => row.id)).size !== AFRICAN_ISO3_CODES.length
  ) {
    throw new Error("Country score update must contain exactly 54 unique ISO-3 rows.");
  }
  const legacyWrite = await client.from("countries").upsert(rows);
  if (legacyWrite.error) {
    throw new Error(`Legacy countries refresh failed: ${legacyWrite.error.message}`);
  }
}

export type ScoreRefreshFailurePhase =
  | "configuration"
  | "legacy_refresh"
  | "trusted_promotion";

export class ScoreRefreshOperationalError extends Error {
  constructor(
    readonly phase: ScoreRefreshFailurePhase,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ScoreRefreshOperationalError";
  }
}

export function withScoreOperationalFailure(
  report: ScoreReadinessReport,
  phase: ScoreRefreshFailurePhase,
  error: unknown,
): ScoreReadinessReport {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    ...report,
    legacyRefresh:
      phase === "configuration"
        ? {
            status: "not_attempted",
            detail: "Supabase configuration is missing.",
          }
        : phase === "legacy_refresh"
          ? { status: "failed", detail }
          : {
              status: "refreshed",
              detail:
                "Legacy countries were refreshed before trusted promotion failed.",
            },
    promotion: {
      status: "retained",
      previousTrustedReleaseRetained: true,
      detail:
        "An operational failure prevented trusted promotion; the previous trusted release remains authoritative.",
    },
    operation: {
      status: "failed",
      phase,
      detail,
    },
  };
}

export async function publishCountryScoreRefresh(
  client: SupabaseClient,
  rows: readonly CountryRow[],
  scores: ReturnType<typeof computeCompositeScores>,
  readiness: ScoreReadinessReport,
): Promise<{
  legacy: "refreshed";
  trusted: "published" | "retained";
  releaseId: string | null;
  readiness: ScoreReadinessReport;
}> {
  try {
    await persistLegacyCountryRefresh(client, rows);
  } catch (error) {
    throw new ScoreRefreshOperationalError(
      "legacy_refresh",
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  if (!readiness.summary.promotable) {
    return {
      legacy: "refreshed",
      trusted: "retained",
      releaseId: null,
      readiness: {
        ...readiness,
        legacyRefresh: {
          status: "refreshed",
          detail:
            "Legacy countries were refreshed independently; trusted promotion remained blocked.",
        },
        operation: {
          status: "success",
          phase: "readiness",
          detail:
            "Non-promotable evidence was reported without attempting trusted promotion.",
        },
      },
    };
  }

  let release: ReturnType<typeof buildTrustedScoreRelease>;
  try {
    release = buildTrustedScoreRelease(scores, readiness.generatedAt);
    await persistScoreRelease(client, rows, release.records);
  } catch (error) {
    throw new ScoreRefreshOperationalError(
      "trusted_promotion",
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  return {
    legacy: "refreshed",
    trusted: "published",
    releaseId: release.releaseId,
    readiness: {
      ...readiness,
      legacyRefresh: {
        status: "refreshed",
        detail: "Legacy countries were refreshed before trusted promotion.",
      },
      promotion: {
        status: "published",
        previousTrustedReleaseRetained: false,
        detail: `Trusted release ${release.releaseId} was atomically published.`,
      },
      operation: {
        status: "success",
        phase: "trusted_promotion",
        detail: "Legacy refresh and trusted promotion completed.",
      },
    },
  };
}

export async function loadValidatedObservations(
  options: WorldBankLoadOptions = {},
): Promise<ObservationLoadResult> {
  return loadWorldBankObservations(options);
}

function readinessReportPath(): string {
  const index = process.argv.indexOf("--readiness-output");
  return resolve(
    index >= 0 && process.argv[index + 1]
      ? process.argv[index + 1]
      : DEFAULT_READINESS_REPORT,
  );
}

async function writeReadinessReport(
  report: ScoreReadinessReport,
): Promise<string> {
  const path = readinessReportPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeScoreReadinessReport(report), "utf8");
  return path;
}

export async function reportScoreOperationalFailure(
  report: ScoreReadinessReport,
  phase: ScoreRefreshFailurePhase,
  error: unknown,
  writeReport: (failed: ScoreReadinessReport) => Promise<unknown> =
    writeReadinessReport,
): Promise<never> {
  const operationalError = error instanceof ScoreRefreshOperationalError
    ? error
    : new ScoreRefreshOperationalError(
        phase,
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
  const failed = withScoreOperationalFailure(
    report,
    operationalError.phase,
    operationalError,
  );
  await writeReport(failed);
  throw operationalError;
}

async function main() {
  console.log("Computing AXIS country scores from cited indicator observations...");
  const generatedAt = new Date().toISOString();
  const loaded = await loadValidatedObservations({ retrievedAt: generatedAt });
  for (const diagnostic of loaded.diagnostics) {
    console.log(JSON.stringify({ type: "score-source", ...diagnostic }));
  }
  const scores = computeCompositeScores(loaded.observations);
  const rows = buildLegacyCountryRows(scores);
  let readiness = evaluateScoreReadiness(scores, {
    generatedAt,
    sourceDiagnostics: loaded.diagnostics,
  });
  await writeReadinessReport(readiness);

  if (!supabase) {
    const error = new ScoreRefreshOperationalError(
      "configuration",
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    console.error("Supabase config missing; no rows written.");
    return await reportScoreOperationalFailure(
      readiness,
      "configuration",
      error,
    );
  }

  let result: Awaited<ReturnType<typeof publishCountryScoreRefresh>>;
  try {
    result = await publishCountryScoreRefresh(
      supabase,
      rows,
      scores,
      readiness,
    );
  } catch (error) {
    const operationalError = error instanceof ScoreRefreshOperationalError
      ? error
      : new ScoreRefreshOperationalError(
          "trusted_promotion",
          error instanceof Error ? error.message : String(error),
          { cause: error },
        );
    console.error(
      `Score refresh failed: ${operationalError.message}`,
    );
    return await reportScoreOperationalFailure(
      readiness,
      operationalError.phase,
      operationalError,
    );
  }
  readiness = result.readiness;
  const reportPath = await writeReadinessReport(readiness);
  console.log(
    JSON.stringify({
      type: "score-readiness",
      reportPath,
      legacy: result.legacy,
      trusted: result.trusted,
      releaseId: result.releaseId,
      ...readiness.summary,
    }),
  );
  if (!readiness.summary.promotable) {
    const blockers = readiness.countries
      .filter((country) => !country.ready)
      .map((country) => ({
        country: country.country,
        blockers: country.blockers,
        indicatorGaps: country.indicatorGaps,
      }));
    console.warn(
      `Trusted score promotion blocked; previous release retained: ${JSON.stringify(blockers)}`,
    );
  }
}

if (process.argv[1]?.endsWith("update-countries.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
