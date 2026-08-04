import type { SupabaseClient } from "@supabase/supabase-js";

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

export function selectLatestCurrentTrustedRecord(
  dataset: RolloutDataset,
  records: readonly LegacyRecord[],
): LegacyRecord | null {
  return (
    records.find((record) =>
      trustedRecordMatchesCurrentPolicy(dataset, record),
    ) ?? null
  );
}

export async function getLatestCurrentTrustedRecordByIdentity(
  client: SupabaseClient,
  dataset: RolloutDataset,
  identity: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ record: LegacyRecord | null; error: string | null }> {
  const pageSize = 100;

  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from("trusted_published_records")
      .select("record,source_published_at,published_at")
      .eq("dataset", dataset)
      .eq("record->>id", identity)
      .order("source_published_at", { ascending: false })
      .order("published_at", { ascending: false });
    if (signal) query = query.abortSignal(signal);
    const result = await query.range(offset, offset + pageSize - 1);

    if (result.error) {
      const code =
        typeof result.error.code === "string"
          ? ` (${result.error.code})`
          : "";
      return {
        record: null,
        error: `trusted selection query failed${code}: ${result.error.message}`,
      };
    }

    const records = (result.data ?? [])
      .map(trustedRecord)
      .filter(
        (record) =>
          textAt(record, "commodityId", "countryCode", "iso3", "id")
            .toLowerCase() === identity.toLowerCase(),
      );
    const record = selectLatestCurrentTrustedRecord(dataset, records);
    if (record) {
      const rejectedCount = offset + records.indexOf(record);
      if (rejectedCount > 0) {
        console.warn(
          `Rejected ${rejectedCount} newer obsolete trusted ${dataset} record(s) for ${identity} under source registry ${SOURCE_REGISTRY_VERSION}.`,
        );
      }
      return { record, error: null };
    }
    if (records.length < pageSize) {
      const rejectedCount = offset + records.length;
      if (rejectedCount > 0) {
        console.warn(
          `Rejected ${rejectedCount} obsolete trusted ${dataset} record(s) for ${identity} under source registry ${SOURCE_REGISTRY_VERSION}.`,
        );
      }
      return { record: null, error: null };
    }
  }
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

export interface TrustedIdentityReadOptions {
  /**
   * Read trusted rows even when global trusted publication is disabled.
   *
   * The global flag enforces an all-or-nothing contract because country scores
   * must never be served from a partial release. Datasets that already render
   * per-identity fallbacks — and label them as such — can safely surface the
   * trusted rows they do have without waiting for that flag. Without this,
   * validated records are written to trust storage every day and never read.
   */
  allowWithoutGlobalFlag?: boolean;
}

export async function getLatestTrustedPublishedRecordsByIdentity(
  dataset: RolloutDataset,
  identities: readonly string[],
  options: TrustedIdentityReadOptions = {},
): Promise<LegacyRecord[] | null> {
  if (
    !trustedPublicationSelectionEnabled() &&
    !options.allowWithoutGlobalFlag
  ) {
    return null;
  }
  const results = await Promise.all(
    identities.map((identity) =>
      getLatestCurrentTrustedRecordByIdentity(
        supabase,
        dataset,
        identity,
      ),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error(
      `Trusted ${dataset} identity selection unavailable; failing closed:`,
      failed.error,
    );
    return [];
  }
  return results.flatMap(({ record }) =>
    record ? [record] : [],
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
