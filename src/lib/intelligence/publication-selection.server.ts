import { supabase } from "@/lib/supabase";
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
    .limit(limit);
  if (result.error || !result.data?.length) {
    if (result.error) {
      console.error(
        `Trusted ${dataset} selection unavailable; retaining legacy fallback:`,
        result.error.message,
      );
    }
    return null;
  }
  return result.data.map((row) => ({
    ...((row.record as LegacyRecord | null) ?? {}),
    sourcePublishedAt: row.source_published_at,
    trustedPublishedAt: row.published_at,
    publicationTier: "trusted",
  }));
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
