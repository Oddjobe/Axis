import { COMMODITY_IDS } from "@/lib/intelligence/ingestion/commodity-sources";
import { AFRICAN_ISO3_CODES, toIsoTimestamp, type DataMode } from "@/lib/intelligence/trust";

export type PublicationTier = "trusted" | "mixed" | "legacy";
export type PublicationStatus = "current" | "stale" | "unavailable";
export const PUBLICATION_DISPLAY_STATES = [
  "trusted-current",
  "trusted-stale",
  "legacy-live-ingested",
  "cached",
  "static-fallback",
  "unavailable",
] as const;
export type PublicationDisplayState =
  (typeof PUBLICATION_DISPLAY_STATES)[number];

export interface PublicationSummaryInput {
  success?: boolean;
  displayState?: PublicationDisplayState;
  source?: string | null;
  publicationTier?: PublicationTier | null;
  dataMode?: DataMode | null;
  fallbackUsed?: boolean | null;
  sourceUpdatedAt?: string | null;
  observedAt?: string | null;
  generatedAt?: string | null;
}

export interface PublicationPresentation {
  state: PublicationDisplayState;
  status: PublicationStatus;
  label: string;
  sourcePublishedAt: string | null;
  sourceObservedAt: string | null;
  requestGeneratedAt: string | null;
  tooltip: string;
}

export type PresentationTone = "positive" | "caution" | "degraded" | "critical";

export interface PresentationToneClasses {
  dot: string;
  text: string;
  border: string;
  bg: string;
}

const TONE_BY_STATE: Record<PublicationDisplayState, PresentationTone> = {
  "trusted-current": "positive",
  "trusted-stale": "caution",
  "legacy-live-ingested": "caution",
  cached: "caution",
  "static-fallback": "degraded",
  unavailable: "critical",
};

export function isPublicationDisplayState(
  value: unknown,
): value is PublicationDisplayState {
  return PUBLICATION_DISPLAY_STATES.includes(value as PublicationDisplayState);
}

const TONE_CLASSES: Record<PresentationTone, PresentationToneClasses> = {
  positive: {
    dot: "bg-emerald-500",
    text: "text-emerald-500",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
  caution: {
    dot: "bg-amber-500",
    text: "text-amber-500",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
  },
  degraded: {
    dot: "bg-orange-500",
    text: "text-orange-500",
    border: "border-orange-500/30",
    bg: "bg-orange-500/10",
  },
  critical: {
    dot: "bg-red-500",
    text: "text-red-500",
    border: "border-red-500/30",
    bg: "bg-red-500/10",
  },
};

/** Deterministic display tone for a publication display state, shared across dashboard surfaces. */
export function getPresentationTone(
  state: PublicationDisplayState,
): PresentationToneClasses {
  return TONE_CLASSES[TONE_BY_STATE[state]];
}

function timestampLabel(label: string, value: string | null): string {
  return `${label}: ${value ?? "unavailable"}`;
}

export function getPublicationPresentation(
  input: PublicationSummaryInput,
): PublicationPresentation {
  const source = input.source ?? "";
  const sourcePublishedAt = toIsoTimestamp(input.sourceUpdatedAt);
  const sourceObservedAt = toIsoTimestamp(input.observedAt);
  const requestGeneratedAt = toIsoTimestamp(input.generatedAt);
  const unavailable =
    input.success === false || source.includes("unavailable");
  const status: PublicationStatus = unavailable
    ? "unavailable"
    : input.dataMode === "stale" || !sourcePublishedAt
      ? "stale"
      : "current";

  let derivedState: PublicationDisplayState;
  if (unavailable) {
    derivedState = "unavailable";
  } else if (input.dataMode === "cached") {
    derivedState = "cached";
  } else if (
    input.fallbackUsed === true ||
    input.dataMode === "fallback" ||
    source.includes("static")
  ) {
    derivedState = "static-fallback";
  } else if (input.publicationTier === "trusted") {
    derivedState = status === "current" ? "trusted-current" : "trusted-stale";
  } else if (
    source.includes("legacy/supabase") ||
    input.dataMode === "live"
  ) {
    derivedState = "legacy-live-ingested";
  } else {
    derivedState = "static-fallback";
  }
  const state =
    isPublicationDisplayState(input.displayState) &&
    input.displayState === derivedState
      ? input.displayState
      : derivedState;

  const labelByState: Record<PublicationDisplayState, string> = {
    "trusted-current": "TRUSTED CURRENT",
    "trusted-stale": "TRUSTED STALE",
    "legacy-live-ingested": "LEGACY LIVE-INGESTED",
    cached: "CACHED",
    "static-fallback": "STATIC FALLBACK",
    unavailable: "UNAVAILABLE",
  };
  const tooltip = [
    labelByState[state],
    timestampLabel("Source publication", sourcePublishedAt),
    timestampLabel("Source observation", sourceObservedAt),
    timestampLabel("Request generated", requestGeneratedAt),
  ].join("; ");

  return {
    state,
    status,
    label: labelByState[state],
    sourcePublishedAt,
    sourceObservedAt,
    requestGeneratedAt,
    tooltip,
  };
}

export function getRefreshFailurePresentation(
  hasRetainedData: boolean,
  previous?: PublicationPresentation,
): PublicationPresentation {
  if (!hasRetainedData) {
    return getPublicationPresentation({ success: false });
  }

  return getPublicationPresentation({
    dataMode: "cached",
    sourceUpdatedAt: previous?.sourcePublishedAt,
    observedAt: previous?.sourceObservedAt,
    generatedAt: previous?.requestGeneratedAt,
  });
}

type JsonRecord = Record<string, unknown>;
type TrustDataset = "countryScores" | "intelligence" | "blogs" | "commodities";

export const TRUST_HEALTH_REASON_CODES = [
  "cached-data",
  "incomplete-identity-coverage",
  "legacy-live-ingested",
  "legacy-publication",
  "source-observation-time-missing",
  "source-publication-time-missing",
  "source-stale",
  "static-fallback",
  "trusted-coverage-partial",
  "trusted-coverage-zero",
  "trusted-publication-unavailable",
  "upstream-unavailable",
] as const;
export type TrustHealthReasonCode =
  (typeof TRUST_HEALTH_REASON_CODES)[number];

export interface TrustHealthDataset {
  publicationTier: PublicationTier;
  status: PublicationStatus;
  displayState: PublicationDisplayState;
  coverage: {
    availableRecords: number;
    expectedRecords: number | null;
    trustedRecords: number;
    trustedExpectedRecords: number | null;
    missingIdentities: string[];
    missingTrustedIdentities: string[];
    missingPublicationTimeRecords: number;
    missingPublicationTimeIdentities: string[];
  };
  freshness: {
    sourcePublishedAt: string | null;
    sourceObservedAt: string | null;
  };
  fallback: {
    used: boolean;
    state: "none" | "cached" | "static" | "legacy-live" | "unavailable";
  };
  reasonCodes: TrustHealthReasonCode[];
}

export interface TrustHealthPayload {
  version: "1";
  status: PublicationStatus;
  generatedAt: string;
  trustedPublicationsEnabled: boolean;
  datasets: Record<TrustDataset, TrustHealthDataset>;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function rows(payload: JsonRecord, field: "countries" | "data"): JsonRecord[] {
  const value = payload[field];
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tier(value: unknown): PublicationTier {
  return value === "trusted" || value === "mixed" ? value : "legacy";
}

function mode(value: unknown): DataMode | null {
  return value === "live" ||
    value === "cached" ||
    value === "fallback" ||
    value === "stale"
    ? value
    : null;
}

function identity(row: JsonRecord, index: number): string {
  return (
    text(row.country) ??
    text(row.id) ??
    text(row.isoCode) ??
    `record-${index + 1}`
  );
}

function publicationTime(row: JsonRecord): string | null {
  return toIsoTimestamp(
    row.sourcePublishedAt ??
      row.source_published_at ??
      row.sourceUpdatedAt ??
      row.source_updated_at,
  );
}

function fallbackState(
  presentation: PublicationPresentation,
): TrustHealthDataset["fallback"]["state"] {
  if (presentation.state === "unavailable") return "unavailable";
  if (presentation.state === "cached") return "cached";
  if (presentation.state === "static-fallback") return "static";
  if (presentation.state === "legacy-live-ingested") return "legacy-live";
  return "none";
}

function buildDataset({
  payload,
  field,
  expectedIdentities,
  exposePublicIdentities = false,
  trustedCoverage,
}: {
  payload: JsonRecord;
  field: "countries" | "data";
  expectedIdentities?: readonly string[];
  exposePublicIdentities?: boolean;
  trustedCoverage?: JsonRecord;
}): TrustHealthDataset {
  const availableRows = rows(payload, field);
  const availableIdentities = new Set(
    availableRows.map((row, index) => identity(row, index)),
  );
  const publicationTier = tier(payload.publicationTier);
  const trustedRows = availableRows.filter(
    (row) =>
      row.publicationTier === "trusted" ||
      (publicationTier === "trusted" && row.publicationTier !== "legacy"),
  );
  const trustedIdentities = new Set(
    trustedRows.map((row, index) => identity(row, index)),
  );
  const expected = expectedIdentities ? [...expectedIdentities] : null;
  const coverageTrustedRecords =
    typeof trustedCoverage?.records === "number"
      ? trustedCoverage.records
      : trustedIdentities.size;
  const coverageMissing = Array.isArray(trustedCoverage?.missingIds)
    ? trustedCoverage.missingIds.map(String)
    : expected?.filter((id) => !trustedIdentities.has(id)) ?? [];
  const presentation = getPublicationPresentation({
    success: payload.success !== false,
    displayState: isPublicationDisplayState(payload.displayState)
      ? payload.displayState
      : undefined,
    source: text(payload.source),
    publicationTier,
    dataMode: mode(payload.dataMode),
    fallbackUsed: payload.fallbackUsed === true,
    sourceUpdatedAt: text(payload.sourceUpdatedAt),
    observedAt: text(payload.observedAt),
    generatedAt: text(payload.generatedAt),
  });
  const missingPublicationTimeRows = availableRows
    .map((row, index) => ({ id: identity(row, index), time: publicationTime(row) }))
    .filter((item) => !item.time);
  const reasonCodes = new Set<TrustHealthReasonCode>();
  if (presentation.status === "unavailable") reasonCodes.add("upstream-unavailable");
  if (
    publicationTier === "trusted" &&
    presentation.status === "unavailable"
  ) {
    reasonCodes.add("trusted-publication-unavailable");
  }
  if (publicationTier !== "trusted") reasonCodes.add("legacy-publication");
  if (!presentation.sourcePublishedAt) {
    reasonCodes.add("source-publication-time-missing");
  }
  if (!presentation.sourceObservedAt) {
    reasonCodes.add("source-observation-time-missing");
  }
  if (presentation.status === "stale") reasonCodes.add("source-stale");
  if (presentation.state === "cached") reasonCodes.add("cached-data");
  if (presentation.state === "static-fallback") reasonCodes.add("static-fallback");
  if (presentation.state === "legacy-live-ingested") {
    reasonCodes.add("legacy-live-ingested");
  }
  if (expected && expected.some((id) => !availableIdentities.has(id))) {
    reasonCodes.add("incomplete-identity-coverage");
  }
  if (expected && coverageTrustedRecords === 0) {
    reasonCodes.add("trusted-coverage-zero");
  } else if (expected && coverageTrustedRecords < expected.length) {
    reasonCodes.add("trusted-coverage-partial");
  }

  return {
    publicationTier,
    status: presentation.status,
    displayState: presentation.state,
    coverage: {
      availableRecords: availableRows.length,
      expectedRecords: expected?.length ?? null,
      trustedRecords: coverageTrustedRecords,
      trustedExpectedRecords: expected?.length ?? null,
      missingIdentities:
        expected?.filter((id) => !availableIdentities.has(id)) ?? [],
      missingTrustedIdentities: coverageMissing,
      missingPublicationTimeRecords: missingPublicationTimeRows.length,
      missingPublicationTimeIdentities: exposePublicIdentities
        ? missingPublicationTimeRows.map((item) => item.id)
        : [],
    },
    freshness: {
      sourcePublishedAt: presentation.sourcePublishedAt,
      sourceObservedAt: presentation.sourceObservedAt,
    },
    fallback: {
      used:
        presentation.state === "cached" ||
        presentation.state === "static-fallback",
      state: fallbackState(presentation),
    },
    reasonCodes: [...reasonCodes].sort(),
  };
}

export function buildTrustHealthPayload(
  payloads: {
    scores: unknown;
    intelligence: unknown;
    blogs: unknown;
    commodities: unknown;
  },
  generatedAt = new Date().toISOString(),
  trustedPublicationsEnabled = false,
): TrustHealthPayload {
  const scores = record(payloads.scores);
  const intelligence = record(payloads.intelligence);
  const blogs = record(payloads.blogs);
  const commodities = record(payloads.commodities);
  const datasets = {
    countryScores: buildDataset({
      payload: scores,
      field: "countries",
      expectedIdentities: AFRICAN_ISO3_CODES,
      exposePublicIdentities: true,
    }),
    intelligence: buildDataset({
      payload: intelligence,
      field: "data",
    }),
    blogs: buildDataset({
      payload: blogs,
      field: "data",
    }),
    commodities: buildDataset({
      payload: commodities,
      field: "data",
      expectedIdentities: COMMODITY_IDS,
      exposePublicIdentities: true,
      trustedCoverage: record(commodities.trustedCoverage),
    }),
  };
  const statuses = Object.values(datasets).map((dataset) => dataset.status);
  const status: PublicationStatus = statuses.includes("unavailable")
    ? "unavailable"
    : statuses.includes("stale")
      ? "stale"
      : "current";

  return {
    version: "1",
    status,
    generatedAt: toIsoTimestamp(generatedAt) ?? new Date().toISOString(),
    trustedPublicationsEnabled,
    datasets,
  };
}
