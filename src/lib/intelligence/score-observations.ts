import {
  getBundledBaselineObservations,
  INDICATOR_DEFINITIONS,
  type IndicatorDefinition,
  type ScoreObservation,
} from "./score-methodology";
import {
  AFRICAN_ISO3_CODES,
  africanIso3Schema,
} from "./trust";

const WORLD_BANK_API_ROOT = "https://api.worldbank.org/v2";
const isoCodes = new Set<string>(AFRICAN_ISO3_CODES);

interface WorldBankMetadata {
  lastupdated?: string;
}

interface WorldBankObservation {
  countryiso3code?: string;
  indicator?: { id?: string };
  date?: string;
  value?: number | null;
}

export interface ScoreSourceDiagnostic {
  source: "World Bank";
  indicatorId: string;
  status: "success" | "failed";
  requestedAt: string;
  sourcePublishedAt: string | null;
  liveObservationCount: number;
  bundledObservationCount: number;
  error: string | null;
}

export interface ObservationLoadResult {
  observations: ScoreObservation[];
  diagnostics: ScoreSourceDiagnostic[];
}

export interface WorldBankLoadOptions {
  fetchImpl?: typeof fetch;
  indicators?: readonly IndicatorDefinition[];
  startYear?: number;
  endYear?: number;
  retrievedAt?: string;
  timeoutMs?: number;
}

function toSourceTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? `${value.trim()}T00:00:00.000Z`
    : value;
  const parsed = new Date(dateOnly);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchWorldBankIndicator(
  indicator: IndicatorDefinition,
  {
    fetchImpl = fetch,
    startYear,
    endYear,
    retrievedAt = new Date().toISOString(),
    timeoutMs = 8_000,
  }: Omit<WorldBankLoadOptions, "indicators"> = {},
): Promise<{
  observations: ScoreObservation[];
  sourcePublishedAt: string | null;
}> {
  const resolvedEndYear = endYear ?? new Date().getUTCFullYear();
  const resolvedStartYear = startYear ?? resolvedEndYear - 6;
  const countries = AFRICAN_ISO3_CODES.join(";");
  const url = new URL(
    `${WORLD_BANK_API_ROOT}/country/${countries}/indicator/${indicator.id}`,
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("date", `${resolvedStartYear}:${resolvedEndYear}`);
  url.searchParams.set("per_page", "2000");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let payload: unknown;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `World Bank ${indicator.id} returned HTTP ${response.status}.`,
      );
    }
    payload = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (
    !Array.isArray(payload)
    || typeof payload[0] !== "object"
    || payload[0] === null
    || !Array.isArray(payload[1])
  ) {
    throw new Error(`World Bank ${indicator.id} returned an invalid payload.`);
  }

  const sourcePublishedAt = toSourceTimestamp(
    (payload[0] as WorldBankMetadata).lastupdated,
  );
  const latest = new Map<string, ScoreObservation>();
  for (const candidate of payload[1] as WorldBankObservation[]) {
    const country = candidate.countryiso3code?.toUpperCase();
    const year = Number(candidate.date);
    const value = candidate.value;
    if (
      !country
      || !isoCodes.has(country)
      || candidate.indicator?.id !== indicator.id
      || !Number.isInteger(year)
      || year < resolvedStartYear
      || year > resolvedEndYear
      || typeof value !== "number"
      || !Number.isFinite(value)
    ) {
      continue;
    }
    const current = latest.get(country);
    if (current && current.year >= year) continue;
    latest.set(country, {
      country: africanIso3Schema.parse(country),
      indicatorId: indicator.id,
      value,
      year,
      observedAt: `${year}-12-31T00:00:00.000Z`,
      sourcePublishedAt,
      retrievedAt,
      provenanceKind: "world-bank-api",
    });
  }
  return {
    observations: [...latest.values()].sort(
      (left, right) => left.country.localeCompare(right.country),
    ),
    sourcePublishedAt,
  };
}

function mergeObservations(
  bundled: readonly ScoreObservation[],
  live: readonly ScoreObservation[],
): ScoreObservation[] {
  const merged = new Map<string, ScoreObservation>();
  for (const observation of [...bundled, ...live]) {
    const key = `${observation.country}:${observation.indicatorId}`;
    const current = merged.get(key);
    if (
      !current
      || observation.year > current.year
      || (
        observation.year === current.year
        && observation.provenanceKind === "world-bank-api"
      )
    ) {
      merged.set(key, observation);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.country.localeCompare(right.country)
    || left.indicatorId.localeCompare(right.indicatorId)
  );
}

export async function loadWorldBankObservations(
  options: WorldBankLoadOptions = {},
): Promise<ObservationLoadResult> {
  const indicators = options.indicators ?? INDICATOR_DEFINITIONS;
  const bundled = getBundledBaselineObservations().filter((observation) =>
    indicators.some((indicator) => indicator.id === observation.indicatorId)
  );
  const requestedAt = options.retrievedAt ?? new Date().toISOString();
  const results = await Promise.all(
    indicators.map(async (indicator) => {
      const fallback = bundled.filter(
        (observation) => observation.indicatorId === indicator.id,
      );
      try {
        const live = await fetchWorldBankIndicator(indicator, {
          ...options,
          retrievedAt: requestedAt,
        });
        return {
          observations: live.observations,
          diagnostic: {
            source: "World Bank",
            indicatorId: indicator.id,
            status: "success",
            requestedAt,
            sourcePublishedAt: live.sourcePublishedAt,
            liveObservationCount: live.observations.length,
            bundledObservationCount: fallback.length,
            error: null,
          } satisfies ScoreSourceDiagnostic,
        };
      } catch (error) {
        return {
          observations: [] as ScoreObservation[],
          diagnostic: {
            source: "World Bank",
            indicatorId: indicator.id,
            status: "failed",
            requestedAt,
            sourcePublishedAt: null,
            liveObservationCount: 0,
            bundledObservationCount: fallback.length,
            error: errorMessage(error),
          } satisfies ScoreSourceDiagnostic,
        };
      }
    }),
  );

  return {
    observations: mergeObservations(
      bundled,
      results.flatMap((result) => result.observations),
    ),
    diagnostics: results.map((result) => result.diagnostic),
  };
}
