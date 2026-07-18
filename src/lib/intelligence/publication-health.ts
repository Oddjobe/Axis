import { COMMODITY_IDS } from "@/lib/intelligence/ingestion/commodity-sources";
import {
  AFRICAN_ISO3_CODES,
  getDataMode,
  toIsoTimestamp,
  type DataMode,
  type Dataset,
} from "@/lib/intelligence/trust";

export type PublicationTier = "trusted" | "mixed" | "legacy";
export type PublicationStatus = "current" | "stale" | "unavailable";
export type PublicationDisplayState =
  | "trusted-current"
  | "trusted-stale"
  | "legacy-live-ingested"
  | "cached"
  | "static-fallback"
  | "unavailable";

export interface PublicationSummaryInput {
  success?: boolean;
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

  let state: PublicationDisplayState;
  if (unavailable) {
    state = "unavailable";
  } else if (input.dataMode === "cached") {
    state = "cached";
  } else if (
    input.fallbackUsed === true ||
    input.dataMode === "fallback" ||
    source.includes("static")
  ) {
    state = "static-fallback";
  } else if (input.publicationTier === "trusted") {
    state = status === "current" ? "trusted-current" : "trusted-stale";
  } else if (
    source.includes("legacy/supabase") ||
    input.dataMode === "live"
  ) {
    state = "legacy-live-ingested";
  } else {
    state = "static-fallback";
  }

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

type JsonRecord = Record<string, unknown>;
type TrustDataset = "countryScores" | "intelligence" | "blogs" | "commodities";

export type TrustHealthReasonCode =
  | "cached-data"
  | "incomplete-identity-coverage"
  | "legacy-live-ingested"
  | "legacy-publication"
  | "publisher-missing"
  | "record-fallback"
  | "source-observation-time-missing"
  | "source-publication-time-missing"
  | "source-stale"
  | "static-fallback"
  | "trusted-coverage-partial"
  | "trusted-coverage-zero"
  | "trusted-publication-unavailable"
  | "upstream-unavailable";

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
    missingPublisherIdentities: string[];
    missingTrustedIdentities: string[];
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

function fingerprint(value: string): string {
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;
  for (let position = 0; position < value.length; position += 1) {
    const code = value.charCodeAt(position);
    primary = Math.imul(
      primary ^ code,
      0x01000193,
    );
    secondary = Math.imul(secondary ^ code, 0x85ebca6b);
  }
  return `record-${(primary >>> 0).toString(16).padStart(8, "0")}${(secondary >>> 0).toString(16).padStart(8, "0")}`;
}

function feedIdentity(row: JsonRecord): string | null {
  const fingerprintSource =
    text(row.canonicalUrl) ??
    text(row.sourceUrl) ??
    text(row.url) ??
    text(row.contentHash);
  return fingerprintSource;
}

function feedReportIdentity(row: JsonRecord, index: number): string {
  const value = feedIdentity(row);
  return value ? fingerprint(value) : `record-${index + 1}`;
}

function placeholderPublisher(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    PLACEHOLDER_PUBLISHERS.has(normalized) ||
    /^(?:tba|tbd|unknown(?: publisher| source)?|not (?:available|applicable|provided)|pending|placeholder(?: publisher)?|[-–—]+)$/.test(
      normalized,
    )
  );
}

function provenance(row: JsonRecord): JsonRecord {
  return record(row.provenance);
}

const PLACEHOLDER_PUBLISHERS = new Set([
  "axis africa",
  "axis editorial fallback",
  "axis fallback snapshot",
  "n/a",
  "none",
  "null",
  "unknown",
  "undefined",
  "unavailable",
]);

function publisher(row: JsonRecord): string | null {
  const recordProvenance = provenance(row);
  const value = text(recordProvenance.publisher);
  return value && !placeholderPublisher(value)
    ? value
    : null;
}

function publicationTime(row: JsonRecord): string | null {
  const recordProvenance = provenance(row);
  return toIsoTimestamp(
    recordProvenance.sourcePublishedAt ??
      row.sourcePublishedAt ??
      row.source_published_at ??
      row.sourceUpdatedAt ??
      row.source_updated_at,
  );
}

function hasTrustedRecordMode(row: JsonRecord): boolean {
  const rowMode = mode(row.dataMode);
  const source = text(row.source)?.toLowerCase() ?? "";
  return (
    (rowMode === "live" || rowMode === "stale") &&
    row.fallbackUsed === false &&
    !source.includes("static") &&
    !source.includes("cache")
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
  trustedCoverage,
  trustDataset,
  generatedAt,
}: {
  payload: JsonRecord;
  field: "countries" | "data";
  expectedIdentities?: readonly string[];
  trustedCoverage?: JsonRecord;
  trustDataset: Dataset;
  generatedAt: string;
}): TrustHealthDataset {
  const availableRows = rows(payload, field);
  const expected = expectedIdentities ? [...expectedIdentities] : null;
  const feedDataset = expected === null;
  const availableIdentityValues = availableRows.map((row, index) =>
    feedDataset ? feedIdentity(row) : identity(row, index)
  );
  const availableIdentities = new Set(
    availableIdentityValues
      .filter((value): value is string => value !== null)
      .map((value) => feedDataset ? value : value.toUpperCase()),
  );
  const claimedPublicationTier = tier(payload.publicationTier);
  const trustedRows = availableRows.filter(
    (row) => row.publicationTier === "trusted",
  );
  const trustedIdentityValues = trustedRows.map((row, index) =>
    feedDataset ? feedIdentity(row) : identity(row, index)
  );
  const trustedIdentities = new Set(
    trustedIdentityValues
      .filter((value): value is string => value !== null)
      .map((value) => feedDataset ? value : value.toUpperCase()),
  );
  const computedMissingTrusted =
    expected?.filter((id) => !trustedIdentities.has(id.toUpperCase())) ?? [];
  const reportedTrustedRecords =
    typeof trustedCoverage?.records === "number"
      ? trustedCoverage.records
      : trustedIdentities.size;
  const coverageTrustedRecords = Math.min(
    reportedTrustedRecords,
    trustedIdentities.size,
  );
  const reportedCoverageMissing = Array.isArray(trustedCoverage?.missingIds)
    ? trustedCoverage.missingIds.map(String)
    : [];
  const coverageMissing = [
    ...new Set([...computedMissingTrusted, ...reportedCoverageMissing]),
  ];
  const expectedCoverageComplete = expected === null
    ? availableRows.length > 0 &&
      availableIdentityValues.every((value) => value !== null) &&
      availableIdentities.size === availableRows.length
    : (
        availableRows.length === expected.length &&
        availableIdentities.size === expected.length &&
        expected.every((id) => availableIdentities.has(id.toUpperCase()))
      );
  const trustedIdentityCoverageComplete = expected === null
    ? (
        trustedRows.length === availableRows.length &&
        trustedRows.length > 0 &&
        trustedIdentityValues.every((value) => value !== null) &&
        trustedIdentities.size === trustedRows.length
      )
    : (
        trustedRows.length === expected.length &&
        trustedIdentities.size === expected.length &&
        expected.every((id) => trustedIdentities.has(id.toUpperCase()))
      );
  const reportedCoverageComplete = trustedCoverage
    ? (
        trustedCoverage.records === expected?.length &&
        trustedCoverage.total === expected?.length &&
        trustedCoverage.ratio === 1 &&
        Array.isArray(trustedCoverage.missingIds) &&
        trustedCoverage.missingIds.length === 0 &&
        payload.coverageMode === "trusted"
      )
    : expected === null || (
        payload.count === expected.length &&
        payload.total === expected.length
      );
  const missingPublicationTimeIdentities = availableRows
    .map((row, index) => ({
      id: feedDataset
        ? feedReportIdentity(row, index)
        : identity(row, index),
      time: publicationTime(row),
    }))
    .filter((item) => !item.time)
    .map((item) => item.id);
  const missingPublisherIdentities = availableRows
    .map((row, index) => ({
      id: feedDataset
        ? feedReportIdentity(row, index)
        : identity(row, index),
      value: publisher(row),
    }))
    .filter((item) => !item.value)
    .map((item) => item.id);
  const invalidRecordModeIdentities = availableRows
    .map((row, index) => ({
      id: feedDataset
        ? feedReportIdentity(row, index)
        : identity(row, index),
      valid: hasTrustedRecordMode(row),
    }))
    .filter((item) => !item.valid)
    .map((item) => item.id);
  const source = text(payload.source);
  const payloadMode = mode(payload.dataMode);
  const trustedEvidence = (
    claimedPublicationTier === "trusted" &&
    source === "trusted" &&
    payload.success !== false &&
    payload.fallbackUsed === false &&
    (payload.coverageMode === undefined || payload.coverageMode === "trusted") &&
    (payloadMode === "live" || payloadMode === "stale") &&
    availableRows.length > 0 &&
    expectedCoverageComplete &&
    trustedIdentityCoverageComplete &&
    reportedCoverageComplete &&
    missingPublicationTimeIdentities.length === 0 &&
    missingPublisherIdentities.length === 0 &&
    invalidRecordModeIdentities.length === 0
  );
  const publicationTier: PublicationTier = trustedEvidence
    ? "trusted"
    : claimedPublicationTier === "mixed" || trustedRows.length > 0
      ? "mixed"
      : "legacy";
  const generatedAtMs = Date.parse(generatedAt);
  const trustedRecordStale = trustedEvidence && availableRows.some((row) =>
    row.dataMode === "stale" ||
    getDataMode(
      publicationTime(row),
      trustDataset,
      "live",
      Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now(),
    ) === "stale"
  );
  const presentation = getPublicationPresentation({
    success: payload.success !== false,
    source: trustedEvidence || publicationTier === "legacy"
      ? source
      : "legacy/supabase",
    publicationTier,
    dataMode: trustedRecordStale ? "stale" : payloadMode,
    fallbackUsed: payload.fallbackUsed === true,
    sourceUpdatedAt: text(payload.sourceUpdatedAt),
    observedAt: text(payload.observedAt),
    generatedAt: text(payload.generatedAt),
  });
  const reasonCodes = new Set<TrustHealthReasonCode>();
  if (presentation.status === "unavailable") reasonCodes.add("upstream-unavailable");
  if (
    claimedPublicationTier === "trusted" &&
    presentation.status === "unavailable"
  ) {
    reasonCodes.add("trusted-publication-unavailable");
  }
  if (publicationTier !== "trusted") reasonCodes.add("legacy-publication");
  if (missingPublisherIdentities.length > 0) {
    reasonCodes.add("publisher-missing");
  }
  if (invalidRecordModeIdentities.length > 0) {
    reasonCodes.add("record-fallback");
  }
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
  if (!expectedCoverageComplete) {
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
        expected?.filter((id) => !availableIdentities.has(id.toUpperCase())) ?? [],
      missingPublisherIdentities,
      missingTrustedIdentities: coverageMissing,
      missingPublicationTimeIdentities,
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
      trustDataset: "country-score",
      generatedAt,
    }),
    intelligence: buildDataset({
      payload: intelligence,
      field: "data",
      trustDataset: "intelligence",
      generatedAt,
    }),
    blogs: buildDataset({
      payload: blogs,
      field: "data",
      trustDataset: "blog",
      generatedAt,
    }),
    commodities: buildDataset({
      payload: commodities,
      field: "data",
      expectedIdentities: COMMODITY_IDS,
      trustedCoverage: record(commodities.trustedCoverage),
      trustDataset: "commodity",
      generatedAt,
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
