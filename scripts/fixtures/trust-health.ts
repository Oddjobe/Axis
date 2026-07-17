import type { PublicTrustStateInput } from "../../src/lib/intelligence/trust-health";

export const TRUST_STATE_FIXTURES: Array<{
  name: string;
  input: PublicTrustStateInput;
  expected: string;
}> = [
  {
    name: "fresh trusted publication",
    input: {
      publicationTier: "trusted",
      dataMode: "live",
      fallbackUsed: false,
      source: "trusted",
    },
    expected: "trusted-current",
  },
  {
    name: "stale trusted publication",
    input: {
      publicationTier: "trusted",
      dataMode: "stale",
      fallbackUsed: false,
      source: "trusted",
    },
    expected: "trusted-stale",
  },
  {
    name: "legacy live ingestion without publisher timestamp",
    input: {
      publicationTier: "legacy",
      dataMode: "stale",
      fallbackUsed: false,
      source: "legacy/supabase",
    },
    expected: "legacy-live-ingested",
  },
  {
    name: "browser cache",
    input: {
      publicationTier: "trusted",
      dataMode: "cached",
      fallbackUsed: false,
      source: "trusted",
    },
    expected: "cached",
  },
  {
    name: "static fallback",
    input: {
      publicationTier: "legacy",
      dataMode: "stale",
      fallbackUsed: true,
      source: "legacy/static",
    },
    expected: "static-fallback",
  },
  {
    name: "unavailable route",
    input: {
      available: false,
      publicationTier: "trusted",
      dataMode: "stale",
      fallbackUsed: false,
      source: "trusted/unavailable",
    },
    expected: "unavailable",
  },
  {
    name: "trusted response without valid freshness",
    input: {
      publicationTier: "trusted",
      fallbackUsed: false,
      source: "trusted",
    },
    expected: "unavailable",
  },
];

export const CURRENT_PRODUCTION_CONTRACT = {
  countryScores: {
    payload: {
      success: true,
      source: "legacy/static",
      publicationTier: "legacy",
      fallbackUsed: true,
      dataMode: "stale",
      count: 54,
      asOf: "2024-12-31T00:00:00.000Z",
      data: [],
    },
    expected: "static-fallback",
  },
  intelligence: {
    payload: {
      success: true,
      source: "legacy/supabase",
      publicationTier: "legacy",
      fallbackUsed: false,
      dataMode: "stale",
      asOf: "2026-07-17T18:00:00.000Z",
      data: [{ id: "legacy-alert" }],
    },
    expected: "legacy-live-ingested",
  },
  blogs: {
    payload: {
      success: true,
      source: "legacy/supabase",
      publicationTier: "legacy",
      fallbackUsed: false,
      dataMode: "stale",
      asOf: "2026-07-17T18:00:00.000Z",
      data: [{ id: "legacy-blog" }],
    },
    expected: "legacy-live-ingested",
  },
  commodities: {
    payload: {
      success: true,
      source: "legacy/static",
      publicationTier: "legacy",
      fallbackUsed: true,
      dataMode: "fallback",
      asOf: "2026-07-16T00:00:00.000Z",
      trustedCoverage: { records: 0, total: 5, ratio: 0, missingIds: [] },
      data: [{ id: "gold" }],
    },
    expected: "static-fallback",
  },
} as const;
