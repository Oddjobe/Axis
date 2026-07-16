import { createHash } from "node:crypto";

import {
  canonicalizeUrl,
  evaluatePublicationCandidate,
  normalizeDate,
  type GateReasonCode,
  type PublicationDecision,
} from "@/lib/intelligence/publication-gate";
import {
  DATASET_TRUST_POLICIES,
  type Dataset,
} from "@/lib/intelligence/trust";

export type RolloutDataset =
  | "intelligence"
  | "blog"
  | "country-score"
  | "commodity";
export type RolloutDisposition = "clean" | "backfillable" | "quarantine";
export type LegacyRecord = Record<string, unknown>;

export interface RolloutReason {
  code: GateReasonCode | "invalid_value" | "missing_confidence";
  detail: string;
}

export interface RolloutItem {
  key: string;
  dataset: RolloutDataset;
  disposition: RolloutDisposition;
  backfills: Record<string, string>;
  reasons: RolloutReason[];
  confidence: number;
  prepared: LegacyRecord | null;
  sourceTable: string;
}

export interface RolloutInventory {
  source: "fixtures" | "supabase";
  records: Record<RolloutDataset, LegacyRecord[]>;
  warnings: string[];
}

const SOURCE_PUBLICATION_FIELDS = [
  "sourcePublishedAt",
  "source_published_at",
  "publishedAt",
  "published_at",
] as const;

const RETRIEVAL_TIME_FIELDS = ["retrievedAt", "retrieved_at"] as const;

const TABLES: Record<RolloutDataset, string> = {
  intelligence: "intelligence_alerts",
  blog: "blog_posts",
  "country-score": "countries",
  commodity: "commodity_prices",
};

function objectValue(value: unknown): LegacyRecord | null {
  return value !== null && typeof value === "object"
    ? (value as LegacyRecord)
    : null;
}

function timestampFromFields(
  record: LegacyRecord,
  fields: readonly string[],
): string | null {
  for (const key of fields) {
    const value = record[key];
    if (typeof value !== "string" && !(value instanceof Date)) continue;
    const parsed = normalizeDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function existingSourcePublicationTimestamp(
  record: LegacyRecord,
): string | null {
  const direct = timestampFromFields(record, SOURCE_PUBLICATION_FIELDS);
  if (direct) return direct;
  const provenance = objectValue(record.provenance);
  if (provenance) {
    const timestamp = timestampFromFields(
      provenance,
      SOURCE_PUBLICATION_FIELDS,
    );
    if (timestamp) return timestamp;
  }
  if (Array.isArray(record.sources)) {
    for (const source of record.sources) {
      const sourceRecord = objectValue(source);
      if (!sourceRecord) continue;
      const timestamp = timestampFromFields(
        sourceRecord,
        SOURCE_PUBLICATION_FIELDS,
      );
      if (timestamp) return timestamp;
    }
  }
  return null;
}

function existingRetrievalTimestamp(record: LegacyRecord): string | null {
  const direct = timestampFromFields(record, RETRIEVAL_TIME_FIELDS);
  if (direct) return direct;
  const provenance = objectValue(record.provenance);
  return provenance
    ? timestampFromFields(provenance, RETRIEVAL_TIME_FIELDS)
    : null;
}

function existingUrl(record: LegacyRecord): string | null {
  const direct =
    record.sourceUrl ??
    record.source_url ??
    record.url ??
    record.canonicalUrl;
  const canonical = canonicalizeUrl(direct);
  if (canonical) return canonical;
  const provenance = objectValue(record.provenance);
  const provenanceUrl = provenance
    ? canonicalizeUrl(provenance.sourceUrl ?? provenance.url)
    : null;
  if (provenanceUrl) return provenanceUrl;
  if (Array.isArray(record.sources)) {
    for (const source of record.sources) {
      const sourceRecord = objectValue(source);
      const url = sourceRecord
        ? canonicalizeUrl(sourceRecord.url ?? sourceRecord.sourceUrl)
        : null;
      if (url) return url;
    }
  }
  return null;
}

function existingPublisher(record: LegacyRecord): string {
  const provenance = objectValue(record.provenance);
  const sources = Array.isArray(record.sources)
    ? objectValue(record.sources[0])
    : null;
  const value =
    record.source ??
    record.publisher ??
    record.author ??
    provenance?.publisher ??
    sources?.publisher;
  return typeof value === "string" ? value.trim() : "";
}

function recordKey(dataset: RolloutDataset, record: LegacyRecord): string {
  const supplied =
    record.id ??
    record.country ??
    record.isoCode ??
    record.iso_code ??
    record.url ??
    record.title ??
    record.name;
  if (typeof supplied === "string" && supplied.trim()) {
    return `${dataset}:${supplied.trim()}`;
  }
  return `${dataset}:${createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex")
    .slice(0, 16)}`;
}

function publicationInput(
  dataset: "intelligence" | "blog",
  record: LegacyRecord,
): {
  prepared: LegacyRecord;
  backfills: Record<string, string>;
  sourcePublishedAt: string | null;
  retrievedAt: string | null;
} {
  const prepared = { ...record };
  const backfills: Record<string, string> = {};
  const url = existingUrl(record);
  const sourcePublishedAt = existingSourcePublicationTimestamp(record);
  const retrievedAt = existingRetrievalTimestamp(record);
  const publisher = existingPublisher(record);

  if (url) {
    prepared.sourceUrl = url;
    prepared.canonicalUrl = url;
    if (record.sourceUrl !== url) backfills.sourceUrl = url;
    if (record.canonicalUrl !== url) backfills.canonicalUrl = url;
  }
  if (sourcePublishedAt) {
    prepared.sourcePublishedAt = sourcePublishedAt;
    if (record.sourcePublishedAt !== sourcePublishedAt) {
      backfills.sourcePublishedAt = sourcePublishedAt;
    }
  }
  if (retrievedAt) {
    prepared.retrievedAt = retrievedAt;
    if (record.retrievedAt !== retrievedAt) {
      backfills.retrievedAt = retrievedAt;
    }
  }
  if (publisher && record.source !== publisher) {
    prepared.source = publisher;
    backfills.source = publisher;
  }

  // Relative display strings are never allowed to become rollout provenance.
  if (!sourcePublishedAt) prepared.sourcePublishedAt = "";
  if (!retrievedAt) prepared.retrievedAt = "";
  delete prepared.created_at;
  delete prepared.updated_at;
  if (dataset === "intelligence" && typeof prepared.timeAgo !== "string") {
    prepared.timeAgo = sourcePublishedAt?.split("T")[0] ?? "unknown";
  }
  return { prepared, backfills, sourcePublishedAt, retrievedAt };
}

function classifyPublication(
  dataset: "intelligence" | "blog",
  record: LegacyRecord,
  now: Date,
): Pick<RolloutItem, "disposition" | "backfills" | "reasons" | "confidence" | "prepared"> {
  const {
    prepared,
    backfills,
    sourcePublishedAt,
    retrievedAt,
  } = publicationInput(dataset, record);
  const decision: PublicationDecision = evaluatePublicationCandidate(
    dataset,
    prepared,
    { now },
  );
  const reasons: RolloutReason[] = [...decision.reasons];
  if (!sourcePublishedAt) {
    reasons.push({
      code: "missing_provenance",
      detail:
        "An explicit source publication timestamp is required; database creation, update, and retrieval timestamps are not publication evidence.",
    });
  }
  if (!retrievedAt) {
    reasons.push({
      code: "missing_provenance",
      detail:
        "An explicit retrieval timestamp is required and must be recorded separately from source publication time.",
    });
  }
  return {
    disposition:
      decision.decision === "quarantine" ||
      !sourcePublishedAt ||
      !retrievedAt
        ? "quarantine"
        : Object.keys(backfills).length > 0
          ? "backfillable"
          : "clean",
    backfills,
    reasons,
    confidence: decision.confidence.confidence.overall,
    prepared:
      sourcePublishedAt && retrievedAt ? decision.normalized : null,
  };
}

function numberAt(record: LegacyRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function genericInput(
  dataset: "country-score" | "commodity",
  record: LegacyRecord,
): { prepared: LegacyRecord; backfills: Record<string, string> } {
  const sourcePublishedAt = existingSourcePublicationTimestamp(record);
  const retrievedAt = existingRetrievalTimestamp(record);
  const url = existingUrl(record);
  const publisher = existingPublisher(record);
  const prepared: LegacyRecord = { ...record, dataset };
  const backfills: Record<string, string> = {};
  if (url) {
    prepared.sourceUrl = url;
    prepared.canonicalUrl = url;
    if (record.sourceUrl !== url) backfills.sourceUrl = url;
    if (record.canonicalUrl !== url) backfills.canonicalUrl = url;
  }
  if (sourcePublishedAt) {
    prepared.sourcePublishedAt = sourcePublishedAt;
    if (record.sourcePublishedAt !== sourcePublishedAt) {
      backfills.sourcePublishedAt = sourcePublishedAt;
    }
  }
  if (retrievedAt) {
    prepared.retrievedAt = retrievedAt;
    if (record.retrievedAt !== retrievedAt) {
      backfills.retrievedAt = retrievedAt;
    }
  }
  if (publisher) prepared.source = publisher;
  return { prepared, backfills };
}

function classifyGeneric(
  dataset: "country-score" | "commodity",
  record: LegacyRecord,
  now: Date,
): Pick<RolloutItem, "disposition" | "backfills" | "reasons" | "confidence" | "prepared"> {
  const { prepared, backfills } = genericInput(dataset, record);
  const reasons: RolloutReason[] = [];
  const url = typeof prepared.sourceUrl === "string" ? prepared.sourceUrl : null;
  const timestamp =
    typeof prepared.sourcePublishedAt === "string"
      ? prepared.sourcePublishedAt
      : null;
  const retrievedAt =
    typeof prepared.retrievedAt === "string" ? prepared.retrievedAt : null;
  const publisher = existingPublisher(prepared);
  if (!url || !timestamp || !retrievedAt || !publisher) {
    reasons.push({
      code: "missing_provenance",
      detail:
        "A canonical source URL, publisher, explicit source publication timestamp, and distinct retrieval timestamp are required.",
    });
  }

  if (dataset === "country-score") {
    const country = String(
      record.country ?? record.id ?? record.isoCode ?? "",
    ).toUpperCase();
    const score = numberAt(record, "axisScore", "axis_score");
    if (!/^[A-Z]{3}$/.test(country) || score === null || score < 0 || score > 100) {
      reasons.push({
        code: "invalid_value",
        detail: "Score records require an ISO-3 country and an axis score from 0 to 100.",
      });
    }
    prepared.country = country;
    if (score !== null) prepared.axisScore = score;
  } else {
    const price = numberAt(record, "price", "value");
    if (!String(record.id ?? record.name ?? "").trim() || price === null || price < 0) {
      reasons.push({
        code: "invalid_value",
        detail: "Commodity records require an identifier and a non-negative numeric price.",
      });
    }
  }

  if (timestamp) {
    const age = now.getTime() - Date.parse(timestamp);
    if (
      Number.isFinite(age) &&
      age > DATASET_TRUST_POLICIES[dataset as Dataset].maximumAgeMs
    ) {
      reasons.push({
        code: "stale_source",
        detail: "The existing source timestamp is outside the dataset freshness policy.",
      });
    }
  }

  const completeness =
    [url, timestamp, retrievedAt, publisher].filter(Boolean).length / 4;
  const valueValid = !reasons.some((item) => item.code === "invalid_value");
  const recencyValid = !reasons.some((item) => item.code === "stale_source");
  const confidence = Number(
    (0.55 * completeness + 0.25 * Number(valueValid) + 0.2 * Number(recencyValid)).toFixed(4),
  );
  if (confidence < DATASET_TRUST_POLICIES[dataset as Dataset].minimumConfidence) {
    reasons.push({
      code: "missing_confidence",
      detail: `Derived completeness confidence ${confidence.toFixed(4)} is below the dataset threshold.`,
    });
  }

  return {
    disposition:
      reasons.length > 0
        ? "quarantine"
        : Object.keys(backfills).length > 0
          ? "backfillable"
          : "clean",
    backfills,
    reasons,
    confidence,
    prepared: url && timestamp && retrievedAt && publisher ? prepared : null,
  };
}

export function classifyLegacyRecord(
  dataset: RolloutDataset,
  record: LegacyRecord,
  now = new Date(),
): RolloutItem {
  const result =
    dataset === "intelligence" || dataset === "blog"
      ? classifyPublication(dataset, record, now)
      : classifyGeneric(dataset, record, now);
  return {
    key: recordKey(dataset, record),
    dataset,
    sourceTable: TABLES[dataset],
    ...result,
  };
}

export function classifyInventory(
  inventory: RolloutInventory,
  now = new Date(),
): RolloutItem[] {
  return (Object.keys(inventory.records) as RolloutDataset[]).flatMap((dataset) =>
    inventory.records[dataset].map((record) =>
      classifyLegacyRecord(dataset, record, now),
    ),
  );
}

export function trustRolloutFixtures(now = new Date()): RolloutInventory {
  const sourcePublishedAt = new Date(
    now.getTime() - 3_600_000,
  ).toISOString();
  const retrievedAt = new Date(now.getTime() - 300_000).toISOString();
  return {
    source: "fixtures",
    warnings: [],
    records: {
      intelligence: [
        {
          id: "fixture-intelligence-clean",
          title: "Nigeria expands African digital trade infrastructure",
          summary:
            "Nigeria announced a regional digital trade programme supporting African exporters and AfCFTA market access.",
          severity: "MEDIUM",
          category: "SOVEREIGNTY RISK",
          isoCode: "NGA",
          timeAgo: "1 hour ago",
          source: "African Business Magazine",
          sourceUrl: "https://african.business/news/fixture",
          canonicalUrl: "https://african.business/news/fixture",
          sourcePublishedAt,
          retrievedAt,
        },
        {
          id: "fixture-intelligence-quarantine",
          title: "Unattributed regional update",
          summary:
            "An unattributed report describes a regional development without enough source evidence for publication.",
          severity: "LOW",
          category: "SOVEREIGNTY RISK",
          isoCode: "NGA",
          timeAgo: "recent",
          source: "Unknown",
          created_at: retrievedAt,
          updated_at: retrievedAt,
          retrievedAt,
        },
      ],
      blog: [
        {
          id: "fixture-blog-backfill",
          title: "African infrastructure financing enters a new phase",
          summary:
            "A review of how African infrastructure investors are adapting financing models to regional trade priorities.",
          author: "Axis Research",
          tag: "Africa",
          url: "https://medium.com/@axis/fixture?utm_source=rollout",
          publishedAt: sourcePublishedAt,
          retrievedAt,
        },
      ],
      "country-score": [
        {
          id: "NGA",
          country: "NGA",
          axisScore: 61,
          source: "World Bank",
          sourceUrl: "https://data.worldbank.org/country/nigeria",
          sourcePublishedAt,
          retrievedAt,
        },
      ],
      commodity: [
        {
          id: "cobalt",
          name: "COBALT (99.8%)",
          price: 60399,
          unit: "T",
          currency: "USD",
          source: "London Metal Exchange",
          source_url: "https://www.lme.com/en/metals/ev/lme-cobalt",
          source_published_at: sourcePublishedAt,
          retrieved_at: retrievedAt,
        },
      ],
    },
  };
}

export function stableRecordHash(value: unknown): string {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as LegacyRecord)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, stable(nested)]),
      );
    }
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
