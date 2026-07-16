import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { ALL_SOVEREIGN_DATA } from "../src/lib/mock-data";
import {
  computeCompositeScores,
  getBundledBaselineObservations,
  INDICATOR_DEFINITIONS,
  type ScoreObservation,
} from "../src/lib/intelligence/score-methodology";
import {
  AFRICAN_ISO3_CODES,
  DATASET_TRUST_POLICIES,
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
const isoCodes = new Set<string>(AFRICAN_ISO3_CODES);

interface WorldBankObservation {
  countryiso3code?: string;
  indicator?: { id?: string };
  date?: string;
  value?: number | null;
}

interface CountryRow {
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
const SCORE_TRUST_POLICY = DATASET_TRUST_POLICIES["country-score"];
export const MIN_TRUSTED_SCORE_COVERAGE =
  SCORE_TRUST_POLICY.minimumConfidence;

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
  for (const score of scores) {
    if (score.confidence.overall < SCORE_TRUST_POLICY.minimumConfidence) {
      throw new Error(
        `Trusted score release rejected for ${score.country}: confidence `
        + `${score.confidence.overall} is below ${SCORE_TRUST_POLICY.minimumConfidence}.`,
      );
    }
    if (score.coverage < MIN_TRUSTED_SCORE_COVERAGE) {
      throw new Error(
        `Trusted score release rejected for ${score.country}: coverage `
        + `${score.coverage} is below ${MIN_TRUSTED_SCORE_COVERAGE}.`,
      );
    }
  }
  const releaseBody = scores.map((score) => ({
    dataset: "country-score",
    country: score.country,
    id: score.country,
    axisScore: score.axisScore,
    status: score.status,
    dimensions: score.dimensions,
    indicators: score.indicators,
    coverage: score.coverage,
    confidence: score.confidence,
    sources: score.sources,
    methodologyVersion: score.methodologyVersion,
    source: "World Bank",
    sourceUrl: SCORE_SOURCE_URL,
    canonicalUrl: SCORE_SOURCE_URL,
    sourcePublishedAt: score.asOf,
  }));
  const releaseHash = stableRecordHash(releaseBody);
  const latestAsOf = scores.reduce(
    (latest, score) =>
      Date.parse(score.asOf) > Date.parse(latest) ? score.asOf : latest,
    scores[0]?.asOf ?? generatedAt,
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
): Promise<"trusted" | "legacy"> {
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
      || confidence < SCORE_TRUST_POLICY.minimumConfidence
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
    p_minimum_confidence: SCORE_TRUST_POLICY.minimumConfidence,
    p_minimum_coverage: MIN_TRUSTED_SCORE_COVERAGE,
  });
  if (!atomicWrite.error) return "trusted";
  if (!missingScoreReleaseMigration(atomicWrite.error)) {
    throw new Error(
      "Atomic trusted score publication failed; the previous release was retained: "
      + atomicWrite.error.message,
    );
  }

  console.warn(
    "Score continuity migration unavailable; preserving legacy countries fallback "
    + "without changing the previous trusted release.",
  );
  const legacyWrite = await client.from("countries").upsert(rows);
  if (legacyWrite.error) {
    throw new Error(`Supabase fallback upsert failed: ${legacyWrite.error.message}`);
  }
  return "legacy";
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

async function fetchIndicator(
  indicatorId: string,
  startYear: number,
  endYear: number,
): Promise<ScoreObservation[]> {
  const countries = AFRICAN_ISO3_CODES.join(";");
  const url = new URL(
    `https://api.worldbank.org/v2/country/${countries}/indicator/${indicatorId}`,
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("date", `${startYear}:${endYear}`);
  url.searchParams.set("per_page", "2000");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`World Bank ${indicatorId} returned HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    throw new Error(`World Bank ${indicatorId} returned an invalid payload.`);
  }

  const latest = new Map<string, ScoreObservation>();
  for (const candidate of payload[1] as WorldBankObservation[]) {
    const country = candidate.countryiso3code;
    const year = Number(candidate.date);
    const value = candidate.value;
    if (
      !country
      || !isoCodes.has(country)
      || candidate.indicator?.id !== indicatorId
      || !Number.isInteger(year)
      || year < startYear
      || year > endYear
      || typeof value !== "number"
      || !Number.isFinite(value)
      || latest.has(country)
    ) {
      continue;
    }
    latest.set(country, {
      country: africanIso3Schema.parse(country),
      indicatorId,
      value,
      year,
    });
  }
  return [...latest.values()];
}

export async function loadValidatedObservations(): Promise<ScoreObservation[]> {
  const endYear = new Date().getUTCFullYear();
  const startYear = endYear - 6;
  const bundled = getBundledBaselineObservations();
  const observations: ScoreObservation[] = [];

  for (const indicator of INDICATOR_DEFINITIONS) {
    try {
      const live = await fetchIndicator(indicator.id, startYear, endYear);
      if (live.length < 20) {
        throw new Error(`only ${live.length} valid country observations`);
      }
      observations.push(...live);
      console.log(`World Bank ${indicator.id}: ${live.length} validated observations.`);
    } catch (error) {
      const fallback = bundled.filter(
        (observation) => observation.indicatorId === indicator.id,
      );
      observations.push(...fallback);
      console.warn(
        `World Bank ${indicator.id} unavailable; using ${fallback.length} bundled observations:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return observations;
}

async function main() {
  console.log("Computing AXIS country scores from cited indicator observations...");
  if (!supabase) {
    console.error("Supabase config missing; no rows written.");
    return;
  }

  const observations = await loadValidatedObservations();
  const scores = computeCompositeScores(observations);
  const scoreByIso = new Map(scores.map((score) => [score.country, score]));
  const rows = ALL_SOVEREIGN_DATA.map((country) => {
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

  if (
    rows.length !== AFRICAN_ISO3_CODES.length
    || new Set(rows.map((row) => row.id)).size !== AFRICAN_ISO3_CODES.length
  ) {
    throw new Error("Country score update must contain exactly 54 unique ISO-3 rows.");
  }

  const release = buildTrustedScoreRelease(scores);
  const mode = await persistScoreRelease(supabase, rows, release.records);
  console.log(
    mode === "trusted"
      ? `Atomically published trusted release ${release.releaseId} with ${rows.length} scored rows.`
      : `Successfully upserted ${rows.length} deterministic scored rows in legacy fallback mode.`,
  );
}

if (process.argv[1]?.endsWith("update-countries.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
