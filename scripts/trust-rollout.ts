import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  classifyInventory,
  stableRecordHash,
  trustRolloutFixtures,
  type LegacyRecord,
  type RolloutDataset,
  type RolloutInventory,
  type RolloutItem,
} from "../src/lib/intelligence/trust-rollout";

const CONFIRMATION = "APPLY_TRUST_ROLLOUT";
const DEFAULT_REPORT = "quality-reports/trust-rollout-report.json";
const DATASETS: RolloutDataset[] = [
  "intelligence",
  "blog",
  "country-score",
  "commodity",
];
const TABLES: Record<RolloutDataset, string> = {
  intelligence: "intelligence_alerts",
  blog: "blog_posts",
  "country-score": "countries",
  commodity: "commodity_prices",
};

interface ApplySummary {
  attempted: number;
  recorded: number;
  skipped: number;
  published: number;
  quarantined: number;
}

interface FixtureValidation {
  approvedDatasets: RolloutDataset[];
  blockedDatabaseTimestampFallback: boolean;
  retrievalKeptDistinct: boolean;
  productionWritesAuthorized: false;
}

function argument(name: string): string | undefined {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function clientForInventory(apply: boolean): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

async function inventorySupabase(
  client: SupabaseClient,
  limit: number,
): Promise<RolloutInventory> {
  const records: Record<RolloutDataset, LegacyRecord[]> = {
    intelligence: [],
    blog: [],
    "country-score": [],
    commodity: [],
  };
  const warnings: string[] = [];

  for (const dataset of DATASETS) {
    const result = await client.from(TABLES[dataset]).select("*").limit(limit);
    if (result.error) {
      warnings.push(
        `${TABLES[dataset]} inventory failed: ${result.error.message}`,
      );
      continue;
    }
    records[dataset] = (result.data ?? []) as LegacyRecord[];
  }
  return { source: "supabase", records, warnings };
}

function sourceType(dataset: RolloutDataset): "news" | "commercial" | "other" {
  if (dataset === "intelligence") return "news";
  if (dataset === "commodity") return "commercial";
  return "other";
}

function candidateType(
  dataset: RolloutDataset,
): "alert" | "score_input" | "other" {
  if (dataset === "intelligence") return "alert";
  if (dataset === "country-score") return "score_input";
  return "other";
}

function mappedReason(code: RolloutItem["reasons"][number]["code"]): string {
  const map: Record<string, string> = {
    schema_invalid: "schema_invalid",
    missing_provenance: "missing_provenance",
    country_unresolved: "country_unresolved",
    duplicate_candidate: "duplicate_candidate",
    confidence_below_threshold: "confidence_below_threshold",
    source_untrusted: "source_untrusted",
    stale_source: "source_untrusted",
    summary_missing: "schema_invalid",
    africa_relevance_failed: "source_untrusted",
    classification_incoherent: "schema_invalid",
    invalid_value: "value_out_of_range",
    missing_confidence: "confidence_below_threshold",
  };
  return map[code] ?? "processing_error";
}

async function migrationPresent(client: SupabaseClient): Promise<void> {
  const probe = await client
    .from("intelligence_source_evidence")
    .select("id")
    .limit(1);
  if (probe.error) {
    throw new Error(
      `Trust migration is not available: ${probe.error.message}. Deploy supabase_trust_storage_migration.sql first.`,
    );
  }
}

async function findOrCreateEvidence(
  client: SupabaseClient,
  item: RolloutItem,
): Promise<string> {
  const prepared = item.prepared!;
  const canonicalUrl = String(prepared.canonicalUrl ?? prepared.sourceUrl);
  const hash = stableRecordHash(prepared);
  const existing = await client
    .from("intelligence_source_evidence")
    .select("id")
    .eq("canonical_url", canonicalUrl)
    .eq("content_sha256", hash)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return String(existing.data.id);

  const inserted = await client
    .from("intelligence_source_evidence")
    .insert({
      source_url: String(prepared.sourceUrl),
      canonical_url: canonicalUrl,
      source_name: String(
        prepared.source ?? prepared.publisher ?? prepared.author,
      ),
      source_type: sourceType(item.dataset),
      source_published_at: prepared.sourcePublishedAt,
      retrieved_at: prepared.retrievedAt,
      media_type: "application/json",
      content_sha256: hash,
      raw_payload: prepared,
      capture_metadata: {
        rollout: "trust-rollout/v1",
        legacy_table: item.sourceTable,
        legacy_key: item.key,
        backfilled_fields: Object.keys(item.backfills),
      },
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function findOrCreateObservation(
  client: SupabaseClient,
  item: RolloutItem,
  evidenceId: string,
): Promise<string> {
  const existing = await client
    .from("intelligence_raw_observations")
    .select("id")
    .eq("evidence_id", evidenceId)
    .eq("source_record_id", item.key)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return String(existing.data.id);

  const country =
    item.dataset === "intelligence" || item.dataset === "country-score"
      ? String(
          item.prepared?.isoCode ??
            item.prepared?.country ??
            item.prepared?.id ??
            "",
        ).toUpperCase() || null
      : null;
  const inserted = await client
    .from("intelligence_raw_observations")
    .insert({
      evidence_id: evidenceId,
      source_record_id: item.key,
      country_code: country,
      observed_at: item.prepared?.sourcePublishedAt,
      payload: item.prepared,
      extraction_method: "trust-rollout",
      extractor_version: "1",
      payload_sha256: stableRecordHash(item.prepared),
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function findOrCreateCandidate(
  client: SupabaseClient,
  item: RolloutItem,
  observationId: string,
): Promise<string> {
  const validationState =
    item.disposition === "quarantine" ? "quarantined" : "accepted";
  const values = {
    candidate_type: candidateType(item.dataset),
    country_code:
      item.dataset === "intelligence" || item.dataset === "country-score"
        ? String(
            item.prepared?.isoCode ??
              item.prepared?.country ??
              item.prepared?.id ??
              "",
          ).toUpperCase() || null
        : null,
    normalized_value: item.prepared,
    confidence: item.confidence,
    validation_state: validationState,
    validation_errors: item.reasons,
    validated_by: "trust-rollout/v1",
    validated_at: new Date().toISOString(),
  };
  const existing = await client
    .from("intelligence_candidates")
    .select("id")
    .eq("raw_observation_id", observationId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    const update = await client
      .from("intelligence_candidates")
      .update(values)
      .eq("id", existing.data.id);
    if (update.error) throw update.error;
    return String(existing.data.id);
  }
  const inserted = await client
    .from("intelligence_candidates")
    .insert({ raw_observation_id: observationId, ...values })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function applyItem(
  client: SupabaseClient,
  item: RolloutItem,
): Promise<"published" | "quarantined" | "skipped"> {
  if (!item.prepared) return "skipped";
  const evidenceId = await findOrCreateEvidence(client, item);
  const observationId = await findOrCreateObservation(
    client,
    item,
    evidenceId,
  );
  const candidateId = await findOrCreateCandidate(
    client,
    item,
    observationId,
  );
  const published = item.disposition !== "quarantine";
  const publication = await client
    .from("intelligence_evidence_publications")
    .upsert(
      {
        evidence_id: evidenceId,
        publication_state: published ? "published" : "draft",
        published_at: published ? new Date().toISOString() : null,
      },
      { onConflict: "evidence_id" },
    );
  if (publication.error) throw publication.error;

  if (!published) {
    for (const reason of item.reasons) {
      const reasonCode = mappedReason(reason.code);
      const existing = await client
        .from("intelligence_quarantine_items")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("reason_code", reasonCode)
        .in("review_state", ["pending", "in_review", "retry_scheduled"])
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) continue;
      const inserted = await client.from("intelligence_quarantine_items").insert({
        candidate_id: candidateId,
        reason_code: reasonCode,
        reason_detail: `${reason.code}: ${reason.detail}`,
        review_state: "pending",
        max_retries: reason.code === "schema_invalid" ? 0 : 3,
      });
      if (inserted.error) throw inserted.error;
    }
  }
  return published ? "published" : "quarantined";
}

async function applyPlan(
  client: SupabaseClient,
  items: RolloutItem[],
): Promise<ApplySummary> {
  await migrationPresent(client);
  const summary: ApplySummary = {
    attempted: items.length,
    recorded: 0,
    skipped: 0,
    published: 0,
    quarantined: 0,
  };
  for (const item of items) {
    const outcome = await applyItem(client, item);
    if (outcome === "skipped") summary.skipped += 1;
    else {
      summary.recorded += 1;
      summary[outcome] += 1;
    }
  }
  return summary;
}

function validateFixtures(items: RolloutItem[]): FixtureValidation {
  const unsafe = items.find(
    (item) => item.key === "intelligence:fixture-intelligence-quarantine",
  );
  const approvedDatasets = DATASETS.filter((dataset) =>
    items.some(
      (item) =>
        item.dataset === dataset && item.disposition !== "quarantine",
    ),
  );
  const retrievalKeptDistinct = items
    .filter((item) => item.disposition !== "quarantine")
    .every(
      (item) =>
        item.prepared?.sourcePublishedAt &&
        item.prepared?.retrievedAt &&
        item.prepared.sourcePublishedAt !== item.prepared.retrievedAt,
    );
  const blockedDatabaseTimestampFallback =
    unsafe?.disposition === "quarantine" &&
    unsafe.prepared === null &&
    unsafe.reasons.some(
      (reason) =>
        reason.code === "missing_provenance" &&
        reason.detail.includes("database creation"),
    );
  if (
    approvedDatasets.length !== DATASETS.length ||
    !blockedDatabaseTimestampFallback ||
    !retrievalKeptDistinct
  ) {
    throw new Error(
      "Fixture safety validation failed: expected valid records to be approved, database timestamp fallback to be blocked, and retrieval timestamps to remain distinct.",
    );
  }
  return {
    approvedDatasets,
    blockedDatabaseTimestampFallback,
    retrievalKeptDistinct,
    productionWritesAuthorized: false,
  };
}

async function main(): Promise<void> {
  const apply = flag("--apply");
  const fixtures = flag("--fixtures");
  const reportPath = resolve(argument("--output") ?? DEFAULT_REPORT);
  const limit = Number(argument("--limit") ?? 5_000);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50_000) {
    throw new Error("--limit must be an integer from 1 to 50000.");
  }
  if (apply && fixtures) {
    throw new Error("--apply cannot be combined with --fixtures.");
  }
  if (apply) {
    if (argument("--confirm") !== CONFIRMATION) {
      throw new Error(
        `--apply requires --confirm=${CONFIRMATION}. No writes were attempted.`,
      );
    }
    if (
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
    ) {
      throw new Error(
        "--apply requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL). No writes were attempted.",
      );
    }
  }

  const client = clientForInventory(apply);
  const inventory =
    fixtures || !client
      ? trustRolloutFixtures()
      : await inventorySupabase(client, limit);
  if (!client && !fixtures) {
    inventory.warnings.push(
      "No Supabase read credentials were found; deterministic fixtures were used.",
    );
  }
  const generatedAt = new Date().toISOString();
  const items = classifyInventory(inventory, new Date(generatedAt));
  const fixtureValidation = fixtures ? validateFixtures(items) : null;
  const applySummary = apply
    ? await applyPlan(client!, items)
    : {
        attempted: 0,
        recorded: 0,
        skipped: 0,
        published: 0,
        quarantined: 0,
      };
  const report = {
    version: 1,
    mode: apply ? "apply" : "dry-run",
    generatedAt,
    inventory: {
      source: inventory.source,
      counts: Object.fromEntries(
        DATASETS.map((dataset) => [
          dataset,
          inventory.records[dataset].length,
        ]),
      ),
      warnings: inventory.warnings,
    },
    summary: {
      total: items.length,
      clean: items.filter((item) => item.disposition === "clean").length,
      backfillable: items.filter(
        (item) => item.disposition === "backfillable",
      ).length,
      quarantine: items.filter(
        (item) => item.disposition === "quarantine",
      ).length,
    },
    cleanupPlan: items
      .filter((item) => item.disposition === "backfillable")
      .map((item) => ({
        key: item.key,
        dataset: item.dataset,
        backfills: item.backfills,
        legacyAction: "retain",
      })),
    quarantinePlan: items
      .filter((item) => item.disposition === "quarantine")
      .map((item) => ({
        key: item.key,
        dataset: item.dataset,
        reasons: item.reasons,
        action: item.prepared
          ? "record-in-trust-quarantine-on-apply"
          : "manual-review-no-write",
      })),
    items,
    apply: applySummary,
    fixtureValidation,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${apply ? "APPLY" : "DRY-RUN"} trust rollout: ${report.summary.total} inventoried, ${report.summary.clean} clean, ${report.summary.backfillable} backfillable, ${report.summary.quarantine} quarantine.`,
  );
  console.log(`Report: ${reportPath}`);
  if (apply) {
    console.log(
      `Trust storage: ${applySummary.recorded} recorded (${applySummary.published} published, ${applySummary.quarantined} quarantined), ${applySummary.skipped} skipped.`,
    );
  } else {
    console.log("No database writes were attempted.");
  }
}

main().catch((error) => {
  console.error(`Trust rollout failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
