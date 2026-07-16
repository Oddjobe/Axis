import { createClient } from "@supabase/supabase-js";

import { BLOG_SOURCES, INTELLIGENCE_SOURCES } from "./ingestion/sources";
import { DATASET_TRUST_POLICIES } from "./trust";

interface TimedRow {
  created_at?: string | null;
  retrieved_at?: string | null;
}

function ageHours(value: string | null | undefined, now: number): number | null {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp)
    ? Number((Math.max(0, now - timestamp) / 3_600_000).toFixed(2))
    : null;
}

export interface StorageHealth {
  status: "healthy" | "degraded" | "not-configured" | "unavailable";
  counts: {
    candidates: number | null;
    published: number | null;
    quarantined: number | null;
  };
  agesHours: {
    latestEvidence: number | null;
    oldestOpenQuarantine: number | null;
  };
  rejectionReasons: Record<string, number>;
  sources: Array<{
    source: string;
    dataset: "intelligence" | "blog";
    status: "current" | "stale" | "missing";
    latestAgeHours: number | null;
  }>;
}

const emptyCounts = {
  candidates: null,
  published: null,
  quarantined: null,
};

function unavailableStorage(
  status: StorageHealth["status"],
): StorageHealth {
  return {
    status,
    counts: emptyCounts,
    agesHours: {
      latestEvidence: null,
      oldestOpenQuarantine: null,
    },
    rejectionReasons: {},
    sources: [],
  };
}

export async function getStorageHealth(
  generatedAt = new Date(),
): Promise<StorageHealth> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return unavailableStorage("not-configured");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [
    candidateCount,
    publicationCount,
    quarantineCount,
    rejections,
    evidence,
    latestEvidence,
    oldestQuarantine,
  ] = await Promise.all([
    client
      .from("intelligence_candidates")
      .select("id", { count: "exact", head: true }),
    client
      .from("intelligence_evidence_publications")
      .select("evidence_id", { count: "exact", head: true })
      .eq("publication_state", "published"),
    client
      .from("intelligence_candidates")
      .select("id", { count: "exact", head: true })
      .eq("validation_state", "quarantined"),
    client
      .from("intelligence_quarantine_items")
      .select("reason_code")
      .in("review_state", ["pending", "in_review", "retry_scheduled"])
      .limit(1_000),
    client
      .from("intelligence_source_evidence")
      .select("source_name,retrieved_at")
      .order("retrieved_at", { ascending: false })
      .limit(1_000),
    client
      .from("intelligence_source_evidence")
      .select("retrieved_at")
      .order("retrieved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("intelligence_quarantine_items")
      .select("created_at")
      .in("review_state", ["pending", "in_review", "retry_scheduled"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const responses = [
    candidateCount,
    publicationCount,
    quarantineCount,
    rejections,
    evidence,
    latestEvidence,
    oldestQuarantine,
  ];
  if (responses.some((response) => response.error)) {
    return unavailableStorage("unavailable");
  }

  const rejectionReasons: Record<string, number> = {};
  for (const row of rejections.data ?? []) {
    const code = String(row.reason_code);
    rejectionReasons[code] = (rejectionReasons[code] ?? 0) + 1;
  }

  const latestBySource = new Map<string, string>();
  for (const row of evidence.data ?? []) {
    const source = String(row.source_name);
    if (!latestBySource.has(source) && row.retrieved_at) {
      latestBySource.set(source, String(row.retrieved_at));
    }
  }
  const now = generatedAt.getTime();
  const sourceDefinitions = [
    ...INTELLIGENCE_SOURCES.map((source) => ({
      source: source.name,
      dataset: "intelligence" as const,
      maximumAgeMs: DATASET_TRUST_POLICIES.intelligence.maximumAgeMs,
    })),
    ...BLOG_SOURCES.map((source) => ({
      source: source.name,
      dataset: "blog" as const,
      maximumAgeMs: DATASET_TRUST_POLICIES.blog.maximumAgeMs,
    })),
  ];
  const sources = sourceDefinitions.map((definition) => {
    const latest = latestBySource.get(definition.source);
    const latestAgeHours = ageHours(latest, now);
    return {
      source: definition.source,
      dataset: definition.dataset,
      status: (
        latestAgeHours === null
          ? "missing"
          : latestAgeHours * 3_600_000 > definition.maximumAgeMs
            ? "stale"
            : "current"
      ) as "current" | "stale" | "missing",
      latestAgeHours,
    };
  });

  return {
    status: sources.some((source) => source.status !== "current")
      ? "degraded"
      : "healthy",
    counts: {
      candidates: candidateCount.count ?? 0,
      published: publicationCount.count ?? 0,
      quarantined: quarantineCount.count ?? 0,
    },
    agesHours: {
      latestEvidence: ageHours(
        (latestEvidence.data as TimedRow | null)?.retrieved_at,
        now,
      ),
      oldestOpenQuarantine: ageHours(
        (oldestQuarantine.data as TimedRow | null)?.created_at,
        now,
      ),
    },
    rejectionReasons: Object.fromEntries(
      Object.entries(rejectionReasons).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    sources,
  };
}
