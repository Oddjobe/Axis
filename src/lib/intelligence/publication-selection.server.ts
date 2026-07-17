import { supabase } from "@/lib/supabase";
import {
  COMMODITY_SOURCES,
} from "@/lib/intelligence/ingestion/commodity-sources";
import {
  configuredSourceQuality,
  SOURCE_REGISTRY_VERSION,
} from "@/lib/intelligence/ingestion/sources";
import { normalizeUrl } from "@/lib/intelligence/publication-gate";
import type {
  LegacyRecord,
  RolloutDataset,
} from "@/lib/intelligence/trust-rollout";

export type PublicationTier = "trusted" | "legacy";

export interface PublicationSelection {
  records: LegacyRecord[];
  source: "trusted" | "legacy/supabase";
  publicationTier: PublicationTier;
}

export function trustedPublicationSelectionEnabled(): boolean {
  return process.env.TRUSTED_PUBLICATIONS_ENABLED === "true";
}

export function trustedSnapshotUnavailable(
  records: readonly unknown[] | null | undefined,
): boolean {
  return trustedPublicationSelectionEnabled() && (!records || records.length === 0);
}

export function recordRetrievalTimestamp(record: LegacyRecord): string | null {
  for (const key of ["retrievedAt", "retrieved_at", "created_at"] as const) {
    const value = record[key];
    const timestamp =
      value instanceof Date
        ? value.getTime()
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function trustedRecord(row: {
  record: unknown;
  source_published_at: unknown;
  published_at: unknown;
}): LegacyRecord {
  return {
    ...((row.record as LegacyRecord | null) ?? {}),
    sourcePublishedAt: row.source_published_at,
    trustedPublishedAt: row.published_at,
    publicationTier: "trusted",
  };
}

function textAt(record: LegacyRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function exactPage(left: string, right: string): boolean {
  const normalizedLeft = normalizeUrl(left);
  const normalizedRight = normalizeUrl(right);
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

export function trustedRecordMatchesCurrentPolicy(
  dataset: RolloutDataset,
  record: LegacyRecord,
): boolean {
  if (dataset === "intelligence" || dataset === "blog") {
    return (
      configuredSourceQuality(
        textAt(record, "source", "publisher"),
        textAt(record, "canonicalUrl", "sourceUrl", "url"),
        dataset,
      ) !== null
    );
  }
  if (dataset === "commodity") {
    const source = COMMODITY_SOURCES.find(
      (candidate) =>
        candidate.id ===
        textAt(record, "commodityId", "id").toLowerCase(),
    );
    return Boolean(
      source &&
        source.publisher.toLowerCase() ===
          textAt(record, "publisher", "source").toLowerCase() &&
        source.market.toLowerCase() ===
          textAt(record, "sourceMarket", "market").toLowerCase() &&
        exactPage(
          source.url,
          textAt(record, "canonicalUrl", "sourceUrl", "url"),
        ),
    );
  }
  return true;
}

function retainCurrentTrustedRecords(
  dataset: RolloutDataset,
  records: LegacyRecord[],
): LegacyRecord[] {
  const retained = records.filter((record) =>
    trustedRecordMatchesCurrentPolicy(dataset, record),
  );
  if (retained.length !== records.length) {
    console.warn(
      `Rejected ${records.length - retained.length} obsolete trusted ${dataset} record(s) under source registry ${SOURCE_REGISTRY_VERSION}.`,
    );
  }
  return retained;
}

export async function getTrustedPublishedRecords(
  dataset: RolloutDataset,
  limit: number,
): Promise<LegacyRecord[] | null> {
  if (!trustedPublicationSelectionEnabled()) return null;
  const result = await supabase
    .from("trusted_published_records")
    .select("record,source_published_at,published_at")
    .eq("dataset", dataset)
    .order(
      dataset === "country-score" ? "published_at" : "source_published_at",
      { ascending: false },
    )
    .limit(dataset === "intelligence" || dataset === "blog" ? 1_000 : limit);
  if (result.error || !result.data?.length) {
    if (result.error) {
      console.error(
        `Trusted ${dataset} selection unavailable; failing closed:`,
        result.error.message,
      );
    }
    return [];
  }
  return retainCurrentTrustedRecords(
    dataset,
    result.data.map(trustedRecord),
  ).slice(0, limit);
}

export async function getLatestTrustedPublishedRecordsByIdentity(
  dataset: RolloutDataset,
  identities: readonly string[],
): Promise<LegacyRecord[] | null> {
  if (!trustedPublicationSelectionEnabled()) return null;
  const results = await Promise.all(
    identities.map((identity) =>
      supabase
        .from("trusted_published_records")
        .select("record,source_published_at,published_at")
        .eq("dataset", dataset)
        .eq("record->>id", identity)
        .order("source_published_at", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error(
      `Trusted ${dataset} identity selection unavailable; failing closed:`,
      failed.error.message,
    );
    return [];
  }
  return retainCurrentTrustedRecords(
    dataset,
    results.flatMap((result) =>
      result.data ? [trustedRecord(result.data)] : [],
    ),
  );
}

export async function selectIntelligencePublications(
  limit: number,
): Promise<PublicationSelection | null> {
  const trusted = await getTrustedPublishedRecords("intelligence", limit);
  if (trusted) {
    return {
      records: trusted,
      source: "trusted",
      publicationTier: "trusted",
    };
  }

  const legacy = await supabase
    .from("intelligence_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (legacy.error || !legacy.data?.length) {
    if (legacy.error) {
      console.error(
        "Legacy intelligence selection unavailable:",
        legacy.error.message,
      );
    }
    return null;
  }
  return {
    records: legacy.data,
    source: "legacy/supabase",
    publicationTier: "legacy",
  };
}
