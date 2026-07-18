import type { DataMode } from "./trust";

export const PUBLIC_TRUST_STATES = [
  "trusted-current",
  "trusted-stale",
  "legacy-live-ingested",
  "cached",
  "static-fallback",
  "unavailable",
] as const;

export type PublicTrustState = (typeof PUBLIC_TRUST_STATES)[number];

export interface PublicTrustStateInput {
  available?: boolean;
  publicationTier?: unknown;
  dataMode?: unknown;
  fallbackUsed?: unknown;
  source?: unknown;
}

export interface SanitizedDatasetHealth {
  state: PublicTrustState;
  sourceKind:
    | "trusted-publication"
    | "legacy-ingestion"
    | "browser-cache"
    | "static-snapshot"
    | "none";
  publicationTier: "trusted" | "mixed" | "legacy" | "unavailable";
  dataMode: DataMode | "unavailable";
  asOf: string | null;
  records: number;
  trustedCoverage: {
    records: number;
    total: number;
  } | null;
}

export function isPublicTrustState(value: unknown): value is PublicTrustState {
  return PUBLIC_TRUST_STATES.includes(value as PublicTrustState);
}

export function getPublicTrustStateLabel(state: PublicTrustState): string {
  switch (state) {
    case "trusted-current":
      return "TRUSTED-CURRENT";
    case "trusted-stale":
      return "TRUSTED-STALE";
    case "legacy-live-ingested":
      return "LEGACY LIVE-INGESTED";
    case "cached":
      return "CACHED";
    case "static-fallback":
      return "STATIC FALLBACK";
    case "unavailable":
      return "UNAVAILABLE";
  }
}

export function derivePublicTrustState({
  available = true,
  publicationTier,
  dataMode,
  fallbackUsed,
  source,
}: PublicTrustStateInput): PublicTrustState {
  if (!available) return "unavailable";
  if (
    dataMode !== "live" &&
    dataMode !== "cached" &&
    dataMode !== "fallback" &&
    dataMode !== "stale"
  ) {
    return "unavailable";
  }
  if (dataMode === "cached") return "cached";

  if (publicationTier === "trusted" && fallbackUsed !== true) {
    if (dataMode === "live") return "trusted-current";
    return dataMode === "stale" ? "trusted-stale" : "unavailable";
  }

  if (publicationTier === "mixed") {
    return fallbackUsed === true || dataMode === "fallback"
      ? "static-fallback"
      : "legacy-live-ingested";
  }

  if (
    publicationTier === "legacy" &&
    fallbackUsed === false &&
    typeof source === "string" &&
    source.startsWith("legacy/")
  ) {
    return "legacy-live-ingested";
  }

  return "static-fallback";
}

function normalizedPublicationTier(
  value: unknown,
): SanitizedDatasetHealth["publicationTier"] {
  return value === "trusted" || value === "mixed" || value === "legacy"
    ? value
    : "unavailable";
}

function normalizedDataMode(
  value: unknown,
): SanitizedDatasetHealth["dataMode"] {
  return value === "live" ||
    value === "cached" ||
    value === "fallback" ||
    value === "stale"
    ? value
    : "unavailable";
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizedCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function sourceKind(
  state: PublicTrustState,
): SanitizedDatasetHealth["sourceKind"] {
  switch (state) {
    case "trusted-current":
    case "trusted-stale":
      return "trusted-publication";
    case "legacy-live-ingested":
      return "legacy-ingestion";
    case "cached":
      return "browser-cache";
    case "static-fallback":
      return "static-snapshot";
    case "unavailable":
      return "none";
  }
}

export function sanitizeDatasetHealth(
  payload: Record<string, unknown> | null,
  responseStatus = 200,
): SanitizedDatasetHealth {
  const available =
    responseStatus < 500 && payload !== null && payload.success !== false;
  const state = derivePublicTrustState({
    available,
    publicationTier: payload?.publicationTier,
    dataMode: payload?.dataMode,
    fallbackUsed: payload?.fallbackUsed,
    source: payload?.source,
  });
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const coverage =
    payload?.trustedCoverage &&
    typeof payload.trustedCoverage === "object" &&
    !Array.isArray(payload.trustedCoverage)
      ? (payload.trustedCoverage as Record<string, unknown>)
      : null;
  const coverageRecords = normalizedCount(coverage?.records);
  const coverageTotal = normalizedCount(coverage?.total);

  return {
    state,
    sourceKind: sourceKind(state),
    publicationTier: available
      ? normalizedPublicationTier(payload?.publicationTier)
      : "unavailable",
    dataMode: available
      ? normalizedDataMode(payload?.dataMode)
      : "unavailable",
    asOf: available ? normalizedTimestamp(payload?.asOf) : null,
    records:
      normalizedCount(payload?.count) ??
      normalizedCount(payload?.total) ??
      data.length,
    trustedCoverage:
      coverageRecords !== null && coverageTotal !== null
        ? { records: coverageRecords, total: coverageTotal }
        : null,
  };
}
