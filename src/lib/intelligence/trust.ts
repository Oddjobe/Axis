import { z } from "zod";

export const AFRICAN_ISO3_CODES = [
  "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD",
  "COM", "COD", "COG", "CIV", "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH",
  "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR", "LBY", "MDG",
  "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA",
  "STP", "SEN", "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO",
  "TUN", "UGA", "ZMB", "ZWE",
] as const;

export const africanIso3Schema = z.enum(AFRICAN_ISO3_CODES);
export type AfricanIso3 = z.infer<typeof africanIso3Schema>;

export const datasetSchema = z.enum([
  "country-indicator",
  "country-score",
  "intelligence",
  "blog",
  "commodity",
]);
export type Dataset = z.infer<typeof datasetSchema>;

export const publicationStateSchema = z.enum([
  "candidate",
  "published",
  "quarantined",
  "superseded",
]);
export type PublicationState = z.infer<typeof publicationStateSchema>;

export const dataModeSchema = z.enum(["live", "cached", "fallback", "stale"]);
export type DataMode = z.infer<typeof dataModeSchema>;

export const quarantineReasonSchema = z.enum([
  "invalid-schema",
  "invalid-country",
  "invalid-enum",
  "missing-source",
  "missing-source-time",
  "missing-summary",
  "irrelevant-content",
  "incoherent-classification",
  "duplicate-content",
  "stale-source",
  "low-confidence",
  "insufficient-score-coverage",
]);
export type QuarantineReason = z.infer<typeof quarantineReasonSchema>;

export const provenanceSchema = z.object({
  sourceUrl: z.string().url(),
  publisher: z.string().trim().min(1),
  sourcePublishedAt: z.string().datetime().nullable(),
  retrievedAt: z.string().datetime(),
  observedAt: z.string().datetime().nullable(),
  contentHash: z.string().trim().min(16),
  excerpt: z.string().trim().min(1).max(2_000).nullable(),
  extractor: z.string().trim().min(1),
  extractorVersion: z.string().trim().min(1),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const confidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  sourceQuality: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  corroboration: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  classification: z.number().min(0).max(1),
});
export type Confidence = z.infer<typeof confidenceSchema>;

export const trustMetadataSchema = z.object({
  dataset: datasetSchema,
  publicationState: publicationStateSchema,
  dataMode: dataModeSchema,
  provenance: provenanceSchema,
  confidence: confidenceSchema,
  validationErrors: z.array(quarantineReasonSchema).default([]),
  generatedAt: z.string().datetime(),
  asOf: z.string().datetime(),
  methodologyVersion: z.string().trim().min(1).nullable(),
});
export type TrustMetadata = z.infer<typeof trustMetadataSchema>;

export interface DatasetTrustPolicy {
  minimumConfidence: number;
  maximumAgeMs: number;
  requireSourcePublishedAt: boolean;
  requireExcerpt: boolean;
}

const DAY = 24 * 60 * 60 * 1_000;
export const STATIC_SCORE_BASELINE_AS_OF = "2024-12-31T00:00:00.000Z";

export const DATASET_TRUST_POLICIES: Record<Dataset, DatasetTrustPolicy> = {
  "country-indicator": {
    minimumConfidence: 0.8,
    maximumAgeMs: 400 * DAY,
    requireSourcePublishedAt: true,
    requireExcerpt: true,
  },
  "country-score": {
    minimumConfidence: 0.8,
    maximumAgeMs: 400 * DAY,
    requireSourcePublishedAt: true,
    requireExcerpt: false,
  },
  intelligence: {
    minimumConfidence: 0.75,
    maximumAgeMs: 14 * DAY,
    requireSourcePublishedAt: true,
    requireExcerpt: true,
  },
  blog: {
    minimumConfidence: 0.8,
    maximumAgeMs: 30 * DAY,
    requireSourcePublishedAt: true,
    requireExcerpt: true,
  },
  commodity: {
    minimumConfidence: 0.85,
    maximumAgeMs: 8 * DAY,
    requireSourcePublishedAt: true,
    requireExcerpt: false,
  },
};

export type SovereigntyStatus =
  | "OPTIMAL"
  | "STABLE"
  | "IMPROVING"
  | "EXTRACTIVE";

export function deriveSovereigntyStatus(score: number): SovereigntyStatus {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError("Sovereignty score must be between 0 and 100.");
  }
  if (score >= 75) return "OPTIMAL";
  if (score >= 60) return "STABLE";
  if (score >= 51) return "IMPROVING";
  return "EXTRACTIVE";
}

export function getDataMode(
  sourceUpdatedAt: string | null | undefined,
  dataset: Dataset,
  requestedMode: Exclude<DataMode, "stale">,
  now = Date.now(),
): DataMode {
  const updatedAt = sourceUpdatedAt ? Date.parse(sourceUpdatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAt)) return "stale";
  const ageMs = now - updatedAt;
  if (ageMs < -DAY) return "stale";
  return ageMs > DATASET_TRUST_POLICIES[dataset].maximumAgeMs
    ? "stale"
    : requestedMode;
}

export interface FreshnessMetadata {
  dataMode: DataMode;
  sourceUpdatedAt: string | null;
  observedAt: string | null;
  asOf: string | null;
}

export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function getFreshnessMetadata({
  sourceUpdatedAt,
  observedAt,
  dataset,
  requestedMode,
  now = Date.now(),
}: {
  sourceUpdatedAt?: unknown;
  observedAt?: unknown;
  dataset: Dataset;
  requestedMode: Exclude<DataMode, "stale">;
  now?: number;
}): FreshnessMetadata {
  const normalizedSourceUpdatedAt = toIsoTimestamp(sourceUpdatedAt);
  const normalizedObservedAt = toIsoTimestamp(observedAt);
  const asOf = normalizedSourceUpdatedAt ?? normalizedObservedAt;

  return {
    dataMode: getDataMode(asOf, dataset, requestedMode, now),
    sourceUpdatedAt: normalizedSourceUpdatedAt,
    observedAt: normalizedObservedAt,
    asOf,
  };
}

export function getLatestTimestamp(
  values: Array<string | null | undefined>,
): string | null {
  const timestamps = values
    .map(toIsoTimestamp)
    .filter((value): value is string => value !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return timestamps[0] ?? null;
}
