import type { SupabaseClient } from "@supabase/supabase-js";

import {
  contentHash,
  normalizeDate,
  normalizeText,
  normalizeUrl,
  type GateReasonCode,
  type PublicationDecision,
  toLegacyRecord,
} from "@/lib/intelligence/publication-gate";

export interface PublicationPersistenceOptions {
  allowLegacyWithoutTrustStorage?: boolean;
  deadlineAt?: number;
}

export interface PublicationPersistenceResult {
  published: number;
  quarantined: number;
  auditRecorded: number;
  trustStorageAvailable: boolean;
  warnings: string[];
  errors: string[];
}

export interface AtomicPublicationDecision {
  decision: "publish" | "quarantine";
  dataset: "intelligence" | "blog" | "commodity";
  rawCandidate: unknown;
  evaluatedAt: string;
  normalized: {
    dataset: "intelligence" | "blog" | "commodity";
    source: string;
    sourceUrl: string;
    canonicalUrl: string;
    sourcePublishedAt: string;
    retrievedAt: string;
    contentHash?: string;
    isoCode?: string;
  } | null;
  identity: {
    canonicalUrl: string;
    contentHash: string;
    idempotencyKey: string;
  } | null;
  confidence: {
    confidence: { overall: number };
  };
  reasons: readonly {
    code: GateReasonCode;
    detail: string;
    retryable: boolean;
  }[];
}

const TRUST_REASON_MAP: Record<GateReasonCode, string> = {
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
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isMissingTrustStorage(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  const trustTables = [
    "intelligence_source_evidence",
    "intelligence_raw_observations",
    "intelligence_candidates",
    "intelligence_evidence_publications",
    "intelligence_quarantine_items",
  ];
  return (
    trustTables.some((table) => message.includes(table)) &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("not find"))
  );
}

export interface AtomicPublicationItem {
  duplicate: boolean;
  decision: "publish" | "quarantine";
  idempotencyKey: string | null;
  schemaValid: boolean;
  evidence: AuditMaterial;
  confidence: number;
  reasons: Array<{
    code: string;
    detail: string;
    retryable: boolean;
  }>;
  legacyRecord: Record<string, unknown> | null;
}

interface AuditMaterial {
  sourceUrl: string;
  canonicalUrl: string | null;
  sourceName: string;
  sourcePublishedAt: string | null;
  retrievedAt: string;
  contentHash: string;
  sourceRecordId: string;
  rawPayload: Record<string, unknown>;
  normalizedValue: Record<string, unknown>;
  countryCode: string | null;
  observedAt: string;
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as unknown;
  } catch {
    return String(value);
  }
}

function rawRecord(value: unknown): Record<string, unknown> {
  const safe = jsonSafe(value);
  return typeof safe === "object" && safe !== null && !Array.isArray(safe)
    ? (safe as Record<string, unknown>)
    : { value: safe };
}

function atomicAuditMaterial(decision: AtomicPublicationDecision): AuditMaterial {
  if (decision.normalized && decision.identity) {
    const candidate = decision.normalized;
    return {
      sourceUrl: candidate.sourceUrl,
      canonicalUrl: decision.identity.canonicalUrl,
      sourceName: candidate.source,
      sourcePublishedAt: candidate.sourcePublishedAt,
      retrievedAt: candidate.retrievedAt,
      contentHash: decision.identity.contentHash,
      sourceRecordId: decision.identity.idempotencyKey,
      rawPayload: {
        dataset: decision.dataset,
        rawCandidate: jsonSafe(decision.rawCandidate),
        normalizedCandidate: candidate,
      },
      normalizedValue: candidate,
      countryCode:
        candidate.dataset === "intelligence" ? candidate.isoCode ?? null : null,
      observedAt: candidate.sourcePublishedAt,
    };
  }

  const raw = rawRecord(decision.rawCandidate);
  const sourceUrl =
    normalizeUrl(raw.sourceUrl ?? raw.url ?? raw.link) ??
    "urn:axis:unresolved-source";
  const sourceName =
    normalizeText(raw.source ?? raw.publisher ?? raw.author) ||
    "Unresolved source";
  const sourcePublishedAt = normalizeDate(
    raw.sourcePublishedAt ??
      raw.isoDate ??
      raw.pubDate ??
      raw.publishedAt ??
      raw.date,
    new Date(decision.evaluatedAt),
  );
  const serialized = JSON.stringify({
    dataset: decision.dataset,
    rawCandidate: raw,
  });
  const rawHash = contentHash(serialized);
  return {
    sourceUrl,
    canonicalUrl: normalizeUrl(raw.canonicalUrl) ?? normalizeUrl(sourceUrl),
    sourceName,
    sourcePublishedAt,
    retrievedAt: decision.evaluatedAt,
    contentHash: rawHash,
    sourceRecordId: contentHash(`${decision.dataset}\nraw\n${rawHash}`),
    rawPayload: { dataset: decision.dataset, rawCandidate: raw },
    normalizedValue: { dataset: decision.dataset, rawCandidate: raw },
    countryCode: null,
    observedAt: sourcePublishedAt ?? decision.evaluatedAt,
  };
}

function auditMaterial(decision: PublicationDecision): AuditMaterial {
  return atomicAuditMaterial(decision);
}

function atomicLegacyRecord(
  decision: AtomicPublicationDecision,
): Record<string, unknown> | null {
  if (decision.decision !== "publish" || !decision.normalized) return null;
  if (decision.dataset !== "commodity") {
    return toLegacyRecord(decision as PublicationDecision);
  }
  return {
    ...decision.normalized,
    id: String(
      (decision.normalized as Record<string, unknown>).id ??
        (decision.normalized as Record<string, unknown>).commodityId ??
        "",
    ),
    updated_at: decision.normalized.sourcePublishedAt,
  };
}

export function buildAtomicPublicationItems(
  decisions: readonly AtomicPublicationDecision[],
): AtomicPublicationItem[] {
  return decisions.map((decision) => ({
    duplicate: decision.reasons.some(
      (item) => item.code === "duplicate_candidate",
    ),
    decision: decision.decision,
    idempotencyKey: decision.identity?.idempotencyKey ?? null,
    schemaValid: decision.normalized !== null,
    evidence: atomicAuditMaterial(decision),
    confidence: decision.confidence.confidence.overall,
    reasons: decision.reasons.map((item) => ({
      code: TRUST_REASON_MAP[item.code],
      detail: `${item.code}: ${item.detail}`,
      retryable: item.retryable,
    })),
    legacyRecord: atomicLegacyRecord(decision),
  }));
}

async function findOrCreateEvidence(
  supabase: SupabaseClient,
  decision: PublicationDecision,
): Promise<string> {
  const material = auditMaterial(decision);
  let lookup = supabase
    .from("intelligence_source_evidence")
    .select("id")
    .eq("content_sha256", material.contentHash);
  if (material.canonicalUrl) {
    lookup = lookup.eq("canonical_url", material.canonicalUrl);
  }
  const existing = await lookup.limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return String(existing.data.id);

  const inserted = await supabase
    .from("intelligence_source_evidence")
    .insert({
      source_url: material.sourceUrl,
      canonical_url: material.canonicalUrl,
      source_name: material.sourceName,
      source_type: decision.dataset === "blog" ? "other" : "news",
      source_published_at: material.sourcePublishedAt,
      retrieved_at: material.retrievedAt,
      media_type: "application/json",
      content_sha256: material.contentHash,
      raw_payload: material.rawPayload,
      capture_metadata: {
        publication_gate: "v1",
        idempotency_key: material.sourceRecordId,
        schema_valid: decision.normalized !== null,
      },
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function findOrCreateObservation(
  supabase: SupabaseClient,
  decision: PublicationDecision,
  evidenceId: string,
): Promise<string> {
  const material = auditMaterial(decision);
  const existing = await supabase
    .from("intelligence_raw_observations")
    .select("id")
    .eq("evidence_id", evidenceId)
    .eq("source_record_id", material.sourceRecordId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return String(existing.data.id);

  const inserted = await supabase
    .from("intelligence_raw_observations")
    .insert({
      evidence_id: evidenceId,
      source_record_id: material.sourceRecordId,
      country_code: material.countryCode,
      observed_at: material.observedAt,
      payload: material.rawPayload,
      extraction_method: "publication-gate",
      extractor_version: "1",
      payload_sha256: material.contentHash,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function findOrCreateCandidate(
  supabase: SupabaseClient,
  decision: PublicationDecision,
  observationId: string,
): Promise<string> {
  const material = auditMaterial(decision);
  const existing = await supabase
    .from("intelligence_candidates")
    .select("id")
    .eq("raw_observation_id", observationId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    const updated = await supabase
      .from("intelligence_candidates")
      .update({
        confidence: decision.confidence.confidence.overall,
        validation_state:
          decision.decision === "publish" ? "accepted" : "quarantined",
        validation_errors: decision.reasons,
        validated_by: "publication-gate/v1",
        validated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id);
    if (updated.error) throw updated.error;
    return String(existing.data.id);
  }

  const inserted = await supabase
    .from("intelligence_candidates")
    .insert({
      raw_observation_id: observationId,
      candidate_type:
        decision.dataset === "intelligence" ? "alert" : "other",
      country_code: material.countryCode,
      normalized_value: material.normalizedValue,
      confidence: decision.confidence.confidence.overall,
      validation_state:
        decision.decision === "publish" ? "accepted" : "quarantined",
      validation_errors: decision.reasons,
      validated_by: "publication-gate/v1",
      validated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return String(inserted.data.id);
}

async function recordAuditDecision(
  supabase: SupabaseClient,
  decision: PublicationDecision,
): Promise<void> {
  const evidenceId = await findOrCreateEvidence(supabase, decision);
  const observationId = await findOrCreateObservation(
    supabase,
    decision,
    evidenceId,
  );
  const candidateId = await findOrCreateCandidate(
    supabase,
    decision,
    observationId,
  );

  const publication = await supabase
    .from("intelligence_evidence_publications")
    .upsert(
      {
        evidence_id: evidenceId,
        publication_state:
          decision.decision === "publish" ? "published" : "draft",
        published_at:
          decision.decision === "publish" ? new Date().toISOString() : null,
      },
      { onConflict: "evidence_id" },
    );
  if (publication.error) throw publication.error;

  if (decision.decision === "quarantine") {
    for (const item of decision.reasons) {
      const mappedReason = TRUST_REASON_MAP[item.code];
      const existing = await supabase
        .from("intelligence_quarantine_items")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("reason_code", mappedReason)
        .in("review_state", ["pending", "in_review", "retry_scheduled"])
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) continue;
      const inserted = await supabase
        .from("intelligence_quarantine_items")
        .insert({
          candidate_id: candidateId,
          reason_code: mappedReason,
          reason_detail: `${item.code}: ${item.detail}`,
          review_state: "pending",
          max_retries: item.retryable ? 3 : 0,
        });
      if (inserted.error) throw inserted.error;
    }
  }
}

export async function persistPublicationDecisions(
  supabase: SupabaseClient,
  dataset: "intelligence" | "blog",
  decisions: readonly PublicationDecision[],
  options: PublicationPersistenceOptions = {},
): Promise<PublicationPersistenceResult> {
  const result: PublicationPersistenceResult = {
    published: 0,
    quarantined: 0,
    auditRecorded: 0,
    trustStorageAvailable: true,
    warnings: [],
    errors: [],
  };
  const auditedAccepted: PublicationDecision[] = [];
  let migrationUnavailable = false;

  for (const decision of decisions) {
    if (
      decision.reasons.some(
        (item) => item.code === "duplicate_candidate",
      )
    ) {
      result.warnings.push(
        `Duplicate ${decision.identity?.idempotencyKey ?? dataset} was rejected without changing the original record's publication state.`,
      );
      continue;
    }
    try {
      await recordAuditDecision(supabase, decision);
      result.auditRecorded += 1;
      if (decision.decision === "publish") {
        auditedAccepted.push(decision);
      } else {
        result.quarantined += 1;
      }
    } catch (error) {
      if (isMissingTrustStorage(error)) {
        result.trustStorageAvailable = false;
        migrationUnavailable = true;
        result.warnings.push(
          options.allowLegacyWithoutTrustStorage
            ? "Trust migration is unavailable; the explicitly enabled legacy-only fallback will publish accepted records without a persisted trust audit."
            : "Trust migration is unavailable; legacy-only publication fallback is disabled, so unaudited records remain unpublished.",
        );
        break;
      }
      result.errors.push(
        `Failed to record ${decision.identity?.idempotencyKey ?? "unknown"} in trust storage: ${errorMessage(error)}`,
      );
    }
  }

  const publishable =
    migrationUnavailable && options.allowLegacyWithoutTrustStorage
      ? decisions.filter((decision) => decision.decision === "publish")
      : auditedAccepted;
  const accepted = publishable.map(toLegacyRecord);
  if (accepted.length > 0) {
    const table = dataset === "intelligence" ? "intelligence_alerts" : "blog_posts";
    const onConflict = dataset === "intelligence" ? "title" : "url";
    const write = await supabase
      .from(table)
      .upsert(accepted, { onConflict, ignoreDuplicates: true });
    if (write.error) {
      result.errors.push(
        `Failed to publish ${accepted.length} accepted ${dataset} record(s): ${write.error.message}`,
      );
    } else {
      result.published = accepted.length;
    }
  }

  result.warnings = [...new Set(result.warnings)];
  return result;
}
