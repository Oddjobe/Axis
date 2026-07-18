import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAtomicPublicationItems,
  type PublicationPersistenceOptions,
  type PublicationPersistenceResult,
} from "@/lib/intelligence/publication-storage";

import type { IngestionPersistence } from "./types";

export function createSupabaseIngestionPersistence(
  supabase: SupabaseClient,
  options: PublicationPersistenceOptions = {},
): IngestionPersistence {
  return async (dataset, decisions, signal) => {
    signal.throwIfAborted();
    if (options.allowLegacyWithoutTrustStorage) {
      throw new Error(
        "Legacy-only persistence is incompatible with atomic ingestion.",
      );
    }
    const response = await supabase
      .rpc("persist_publication_batch_atomic", {
        p_dataset: dataset,
        p_items: buildAtomicPublicationItems(decisions),
        p_deadline_at: options.deadlineAt
          ? new Date(options.deadlineAt).toISOString()
          : null,
      })
      .abortSignal(signal);
    if (response.error) {
      const err = response.error;
      const detail = [err.message, err.details, err.hint, err.code]
        .filter(Boolean)
        .join(" | ");
      throw new Error(
        `Atomic persistence RPC failed for ${dataset}: ${detail || JSON.stringify(err)}`,
      );
    }
    signal.throwIfAborted();
    if (!response.data || typeof response.data !== "object") {
      throw new Error("Atomic persistence returned an invalid result.");
    }
    return response.data as PublicationPersistenceResult;
  };
}
