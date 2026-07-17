import {
  AFRICAN_ISO3_CODES,
  getDataMode,
  toIsoTimestamp,
  type Dataset,
} from "./trust";
import { COMMODITY_IDS } from "./ingestion/commodity-sources";

export const TRUST_HEALTH_LABELS = [
  "trusted-current",
  "trusted-stale",
  "legacy live-ingested",
  "cached",
  "static fallback",
  "unavailable",
] as const;

export type TrustHealthLabel = (typeof TRUST_HEALTH_LABELS)[number];
export type TrustHealthDataset =
  | "country-scores"
  | "commodities"
  | "intelligence"
  | "blogs";

export interface TrustHealthProbe {
  ok: boolean;
  status: number | null;
  payload: unknown;
}

export interface DatasetTrustHealth {
  label: TrustHealthLabel;
  currentTrusted: boolean;
  records: number;
  total: number | null;
  asOf: string | null;
}

export interface AggregateTrustHealth {
  contractVersion: "1.0.0";
  status: "healthy" | "degraded" | "unavailable";
  currentTrusted: boolean;
  generatedAt: string;
  summary: Record<TrustHealthLabel, number>;
  datasets: Record<TrustHealthDataset, DatasetTrustHealth>;
}

const DATASET_CONFIG: Record<
  TrustHealthDataset,
  { trustDataset: Dataset; expectedTotal: number | null }
> = {
  "country-scores": {
    trustDataset: "country-score",
    expectedTotal: AFRICAN_ISO3_CODES.length,
  },
  commodities: {
    trustDataset: "commodity",
    expectedTotal: COMMODITY_IDS.length,
  },
  intelligence: {
    trustDataset: "intelligence",
    expectedTotal: null,
  },
  blogs: {
    trustDataset: "blog",
    expectedTotal: null,
  },
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dataRecords(
  dataset: TrustHealthDataset,
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  const value = dataset === "country-scores"
    ? payload.countries ?? payload.data
    : payload.data;
  return Array.isArray(value)
    ? value.map(record).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function hasPublisherProvenance(item: Record<string, unknown>): boolean {
  const provenance = record(item.provenance);
  return Boolean(provenance && text(provenance.publisher));
}

function hasSourceTimestamp(item: Record<string, unknown>): boolean {
  const provenance = record(item.provenance);
  return Boolean(
    provenance && toIsoTimestamp(provenance.sourcePublishedAt),
  );
}

function hasTrustedRecordMode(item: Record<string, unknown>): boolean {
  return (
    (item.dataMode === "live" || item.dataMode === "stale") &&
    item.fallbackUsed !== true
  );
}

function exactIdentityCoverage(
  expectedIds: readonly string[],
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
): boolean {
  const identities = new Set(
    records.map((item) => {
      for (const key of keys) {
        const identity = text(item[key]);
        if (identity) return identity.toUpperCase();
      }
      return "";
    }),
  );
  return (
    identities.size === expectedIds.length &&
    expectedIds.every((identity) => identities.has(identity.toUpperCase()))
  );
}

function sourceTimestamp(item: Record<string, unknown>): string | null {
  return toIsoTimestamp(record(item.provenance)?.sourcePublishedAt);
}

function hasCompleteCoverage(
  dataset: TrustHealthDataset,
  payload: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): boolean {
  const expectedTotal = DATASET_CONFIG[dataset].expectedTotal;
  if (expectedTotal === null) return records.length > 0;

  if (dataset === "country-scores") {
    return (
      records.length === expectedTotal &&
      number(payload.count) === expectedTotal &&
      number(payload.total) === expectedTotal &&
      exactIdentityCoverage(
        AFRICAN_ISO3_CODES,
        records,
        ["country", "id"],
      )
    );
  }

  const coverage = record(payload.trustedCoverage);
  const missingIds = coverage?.missingIds;
  return Boolean(
    records.length === expectedTotal &&
    coverage &&
    number(coverage.records) === expectedTotal &&
    number(coverage.total) === expectedTotal &&
    number(coverage.ratio) === 1 &&
    Array.isArray(missingIds) &&
    missingIds.length === 0 &&
    payload.coverageMode === "trusted" &&
    exactIdentityCoverage(
      COMMODITY_IDS,
      records,
      ["id", "commodityId"],
    ),
  );
}

function isTrustedEvidence(
  dataset: TrustHealthDataset,
  payload: Record<string, unknown>,
  records: readonly Record<string, unknown>[],
): boolean {
  return (
    payload.publicationTier === "trusted" &&
    payload.source === "trusted" &&
    payload.fallbackUsed === false &&
    (payload.coverageMode === undefined ||
      payload.coverageMode === "trusted") &&
    records.every((item) => item.publicationTier === "trusted") &&
    records.every(hasTrustedRecordMode) &&
    records.every(hasPublisherProvenance) &&
    records.every(hasSourceTimestamp) &&
    hasCompleteCoverage(dataset, payload, records)
  );
}

function unavailable(
  expectedTotal: number | null,
  records = 0,
  asOf: string | null = null,
): DatasetTrustHealth {
  return {
    label: "unavailable",
    currentTrusted: false,
    records,
    total: expectedTotal,
    asOf,
  };
}

export function classifyTrustHealth(
  dataset: TrustHealthDataset,
  probe: TrustHealthProbe,
  generatedAt = new Date(),
): DatasetTrustHealth {
  const config = DATASET_CONFIG[dataset];
  const payload = record(probe.payload);
  if (
    !probe.ok ||
    probe.status === null ||
    probe.status < 200 ||
    probe.status >= 300 ||
    !payload ||
    payload.success === false
  ) {
    return unavailable(config.expectedTotal);
  }

  const records = dataRecords(dataset, payload);
  const asOf = toIsoTimestamp(
    payload.asOf ?? payload.sourceUpdatedAt ?? payload.observedAt,
  );
  const total = config.expectedTotal ?? records.length;
  if (records.length === 0) {
    return unavailable(config.expectedTotal, 0, asOf);
  }

  const source = text(payload.source).toLowerCase();
  const dataMode = text(payload.dataMode).toLowerCase();
  if (dataMode === "cached" || source.includes("cache")) {
    return {
      label: "cached",
      currentTrusted: false,
      records: records.length,
      total,
      asOf,
    };
  }
  if (
    payload.fallbackUsed === true ||
    dataMode === "fallback" ||
    source.includes("static")
  ) {
    return {
      label: "static fallback",
      currentTrusted: false,
      records: records.length,
      total,
      asOf,
    };
  }

  const trustedEvidence = isTrustedEvidence(dataset, payload, records);
  if (trustedEvidence && asOf) {
    const declaredRecordModes = records.map((item) => item.dataMode);
    const recordModes = records.map((item) =>
      getDataMode(
        sourceTimestamp(item),
        config.trustDataset,
        "live",
        generatedAt.getTime(),
      ),
    );
    if (
      dataMode === "stale" ||
      declaredRecordModes.some((mode) => mode === "stale") ||
      recordModes.some((mode) => mode === "stale")
    ) {
      return {
        label: "trusted-stale",
        currentTrusted: false,
        records: records.length,
        total,
        asOf,
      };
    }
    if (
      dataMode === "live" &&
      recordModes.every((mode) => mode === "live")
    ) {
      return {
        label: "trusted-current",
        currentTrusted: true,
        records: records.length,
        total,
        asOf,
      };
    }
  }

  if (dataMode === "live") {
    return {
      label: "legacy live-ingested",
      currentTrusted: false,
      records: records.length,
      total,
      asOf,
    };
  }
  return unavailable(config.expectedTotal, records.length, asOf);
}

export function buildAggregateTrustHealth(
  probes: Record<TrustHealthDataset, TrustHealthProbe>,
  generatedAt = new Date(),
): AggregateTrustHealth {
  const datasets = Object.fromEntries(
    (Object.keys(DATASET_CONFIG) as TrustHealthDataset[]).map((dataset) => [
      dataset,
      classifyTrustHealth(dataset, probes[dataset], generatedAt),
    ]),
  ) as Record<TrustHealthDataset, DatasetTrustHealth>;
  const reports = Object.values(datasets);
  const summary = Object.fromEntries(
    TRUST_HEALTH_LABELS.map((label) => [
      label,
      reports.filter((report) => report.label === label).length,
    ]),
  ) as Record<TrustHealthLabel, number>;
  const currentTrusted = reports.every((report) => report.currentTrusted);
  const allUnavailable = reports.every(
    (report) => report.label === "unavailable",
  );

  return {
    contractVersion: "1.0.0",
    status: currentTrusted
      ? "healthy"
      : allUnavailable
        ? "unavailable"
        : "degraded",
    currentTrusted,
    generatedAt: generatedAt.toISOString(),
    summary,
    datasets,
  };
}
