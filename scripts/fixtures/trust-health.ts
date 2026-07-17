import type {
  TrustHealthDataset,
  TrustHealthProbe,
} from "../../src/lib/intelligence/trust-health";
import { AFRICAN_ISO3_CODES } from "../../src/lib/intelligence/trust";
import { COMMODITY_IDS } from "../../src/lib/intelligence/ingestion/commodity-sources";

export const TRUST_HEALTH_NOW = new Date("2026-07-18T00:00:00.000Z");
export const CURRENT_TIMESTAMP = "2026-07-17T12:00:00.000Z";
export const STALE_TIMESTAMP = "2025-01-01T00:00:00.000Z";

function record(
  timestamp: string,
  publisher: string | null,
  dataMode: "live" | "stale",
) {
  return {
    publicationTier: "trusted",
    fallbackUsed: false,
    dataMode,
    provenance: {
      publisher,
      sourcePublishedAt: timestamp,
    },
  };
}

export function trustedProbe(
  dataset: TrustHealthDataset,
  options: {
    timestamp?: string;
    dataMode?: "live" | "stale";
    publisher?: string | null;
  } = {},
): TrustHealthProbe {
  const timestamp = options.timestamp ?? CURRENT_TIMESTAMP;
  const dataMode = options.dataMode ?? "live";
  const data = dataset === "country-scores"
    ? AFRICAN_ISO3_CODES.map((country) => ({
        ...record(timestamp, options.publisher ?? "Fixture Publisher", dataMode),
        country,
      }))
    : dataset === "commodities"
      ? COMMODITY_IDS.map((id) => ({
          ...record(timestamp, options.publisher ?? "Fixture Publisher", dataMode),
          id,
        }))
      : Array.from({ length: 2 }, () =>
          record(timestamp, options.publisher ?? "Fixture Publisher", dataMode));
  const total = data.length;
  const payload: Record<string, unknown> = {
    success: true,
    source: "trusted",
    publicationTier: "trusted",
    fallbackUsed: false,
    dataMode,
    asOf: timestamp,
    data,
  };
  if (dataset === "country-scores") {
    payload.countries = data;
    payload.count = total;
    payload.total = total;
  }
  if (dataset === "commodities") {
    payload.coverageMode = "trusted";
    payload.trustedCoverage = {
      records: total,
      total,
      ratio: 1,
      missingIds: [],
    };
  }
  return { ok: true, status: 200, payload };
}

export function legacyLiveProbe(): TrustHealthProbe {
  return {
    ok: true,
    status: 200,
    payload: {
      success: true,
      source: "legacy/supabase",
      publicationTier: "legacy",
      fallbackUsed: false,
      dataMode: "live",
      asOf: CURRENT_TIMESTAMP,
      data: [{ publicationTier: "legacy" }],
    },
  };
}

export function cachedProbe(): TrustHealthProbe {
  return {
    ok: true,
    status: 200,
    payload: {
      success: true,
      source: "browser/cache",
      publicationTier: "legacy",
      fallbackUsed: false,
      dataMode: "cached",
      asOf: CURRENT_TIMESTAMP,
      data: [{}],
    },
  };
}

export function staticFallbackProbe(): TrustHealthProbe {
  return {
    ok: true,
    status: 200,
    payload: {
      success: true,
      source: "legacy/static",
      publicationTier: "legacy",
      fallbackUsed: true,
      dataMode: "stale",
      asOf: STALE_TIMESTAMP,
      data: [{}],
    },
  };
}

export function unavailableProbe(): TrustHealthProbe {
  return {
    ok: false,
    status: 503,
    payload: {
      success: false,
      error: "fixture secret that must never be returned",
    },
  };
}
