import { createHash } from "node:crypto";
import { z } from "zod";

import {
  AFRICAN_ISO3_CODES,
  DATASET_TRUST_POLICIES,
  africanIso3Schema,
  confidenceSchema,
  type Confidence,
} from "@/lib/intelligence/trust";

export const severitySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const intelligenceCategorySchema = z.enum([
  "SOVEREIGNTY RISK",
  "OUTSIDE INFLUENCE",
]);
export const actorSchema = z.enum([
  "China",
  "United States",
  "EU / CBAM",
  "Russia",
  "IMF / World Bank",
  "France",
  "Gulf States",
  "UK",
]);
export const gateDatasetSchema = z.enum(["intelligence", "blog"]);

export const gateReasonCodeSchema = z.enum([
  "schema_invalid",
  "missing_provenance",
  "country_unresolved",
  "duplicate_candidate",
  "confidence_below_threshold",
  "source_untrusted",
  "stale_source",
  "summary_missing",
  "africa_relevance_failed",
  "classification_incoherent",
]);
export type GateReasonCode = z.infer<typeof gateReasonCodeSchema>;

export const quarantineReasonOutputSchema = z.object({
  code: gateReasonCodeSchema,
  detail: z.string().min(1),
  retryable: z.boolean(),
});
export type QuarantineReasonOutput = z.infer<
  typeof quarantineReasonOutputSchema
>;

const sourceSchema = z.object({
  source: z.string().min(2).max(200),
  sourceUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  sourcePublishedAt: z.string().datetime(),
  retrievedAt: z.string().datetime(),
});

export const normalizedIntelligenceCandidateSchema = sourceSchema.extend({
  dataset: z.literal("intelligence"),
  title: z.string().min(10).max(500),
  summary: z.string().min(40).max(2_000),
  severity: severitySchema,
  category: intelligenceCategorySchema,
  isoCode: africanIso3Schema,
  actor: actorSchema.nullable(),
  timeAgo: z.string().min(1).max(100),
  imageUrl: z.string().url().nullable(),
});

export const normalizedBlogCandidateSchema = sourceSchema.extend({
  dataset: z.literal("blog"),
  title: z.string().min(10).max(500),
  summary: z.string().min(40).max(2_000),
  author: z.string().min(2).max(200),
  tag: z.string().min(2).max(100),
});

export const normalizedPublicationCandidateSchema = z.discriminatedUnion(
  "dataset",
  [normalizedIntelligenceCandidateSchema, normalizedBlogCandidateSchema],
);
export type NormalizedPublicationCandidate = z.infer<
  typeof normalizedPublicationCandidateSchema
>;

export interface ConfidenceExplanation {
  confidence: Confidence;
  weights: Omit<Confidence, "overall">;
  evidence: Record<keyof Omit<Confidence, "overall">, string>;
}

export interface PublicationIdentity {
  canonicalUrl: string;
  contentHash: string;
  idempotencyKey: string;
}

export interface PublicationDecision {
  decision: "publish" | "quarantine";
  dataset: "intelligence" | "blog";
  rawCandidate: unknown;
  evaluatedAt: string;
  normalized: NormalizedPublicationCandidate | null;
  identity: PublicationIdentity | null;
  confidence: ConfidenceExplanation;
  reasons: QuarantineReasonOutput[];
}

export interface PublicationGateOptions {
  now?: Date;
  seen?: ReadonlyArray<NormalizedPublicationCandidate>;
  corroboratingSources?: number;
  approvedSourceQuality?: Readonly<Record<string, number>>;
}

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);
const RETRYABLE_REASONS = new Set<GateReasonCode>([
  "missing_provenance",
  "country_unresolved",
  "confidence_below_threshold",
  "source_untrusted",
  "stale_source",
  "summary_missing",
  "africa_relevance_failed",
  "classification_incoherent",
]);
const AFRICAN_ISO_SET = new Set<string>(AFRICAN_ISO3_CODES);
export const MINIMUM_SOURCE_QUALITY = {
  intelligence: 0.75,
  blog: 0.7,
} as const;
const APPROVED_SOURCE_QUALITY_BY_HOST: Readonly<Record<string, number>> = {
  "worldbank.org": 0.95,
  "imf.org": 0.95,
  "un.org": 0.95,
  "afdb.org": 0.95,
  "africanews.com": 0.88,
  "african.business": 0.88,
  "theafricareport.com": 0.88,
  "dailymaverick.co.za": 0.88,
  "premiumtimesng.com": 0.88,
  "miningweekly.com": 0.88,
  "news.google.com": 0.78,
  "medium.com": 0.75,
};
const AFRICA_TERMS = [
  "africa", "african", "afcfta", "maghreb", "sahel", "sub-saharan",
  "algeria", "angola", "benin", "botswana", "burkina", "burundi",
  "cabo verde", "cameroon", "chad", "comoros", "congo", "ivory coast",
  "côte d'ivoire", "cote d'ivoire", "djibouti", "egypt", "eritrea", "eswatini", "ethiopia",
  "gabon", "gambia", "ghana", "guinea", "kenya", "lesotho", "liberia",
  "libya", "madagascar", "malawi", "mali", "mauritania", "mauritius",
  "morocco", "mozambique", "namibia", "niger", "nigeria", "rwanda",
  "senegal", "seychelles", "sierra leone", "somalia", "south africa",
  "south sudan", "sudan", "tanzania", "togo", "tunisia", "uganda",
  "zambia", "zimbabwe",
];

function reason(
  code: GateReasonCode,
  detail: string,
): QuarantineReasonOutput {
  return { code, detail, retryable: RETRYABLE_REASONS.has(code) };
}

export function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export const canonicalizeUrl = normalizeUrl;

export function normalizeIso3(value: unknown): string | null {
  const iso = normalizeText(value).toUpperCase();
  return AFRICAN_ISO_SET.has(iso) ? iso : null;
}

export function normalizeDate(
  value: unknown,
  now = new Date(),
): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  const text = normalizeText(value);
  if (!text) return null;
  const relative = text.toLowerCase();
  if (relative === "now" || relative === "just now") return now.toISOString();
  if (relative === "yesterday") {
    return new Date(now.getTime() - 86_400_000).toISOString();
  }
  const match = relative.match(
    /^(\d+)\s*(minute|min|hour|hr|day|week|month)s?\s+ago$/,
  );
  if (match) {
    const amount = Number(match[1]);
    const unitMs: Record<string, number> = {
      minute: 60_000,
      min: 60_000,
      hour: 3_600_000,
      hr: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
    };
    return new Date(now.getTime() - amount * unitMs[match[2]]).toISOString();
  }
  const compactMatch = relative.match(/^(\d+)\s*(m|h|d|w)\s*(?:ago)?$/);
  if (compactMatch) {
    const unitMs = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    };
    return new Date(
      now.getTime() -
        Number(compactMatch[1]) *
          unitMs[compactMatch[2] as keyof typeof unitMs],
    ).toISOString();
  }
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getTime() > now.getTime() + 86_400_000) return null;
  return parsed.toISOString();
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPublicationIdentity(
  candidate: NormalizedPublicationCandidate,
): PublicationIdentity {
  const normalizedContent = [
    candidate.dataset,
    candidate.title.toLocaleLowerCase("en"),
    candidate.summary.toLocaleLowerCase("en"),
    candidate.canonicalUrl,
  ].join("\n");
  const hash = contentHash(normalizedContent);
  return {
    canonicalUrl: candidate.canonicalUrl,
    contentHash: hash,
    idempotencyKey: contentHash(
      `${candidate.dataset}\n${candidate.canonicalUrl}\n${hash}`,
    ),
  };
}

function normalizeSeverity(value: unknown): unknown {
  const normalized = normalizeText(value).toUpperCase();
  return severitySchema.safeParse(normalized).success ? normalized : value;
}

function normalizeCategory(value: unknown): unknown {
  const normalized = normalizeText(value).toUpperCase().replace(/[_-]+/g, " ");
  const aliases: Record<string, string> = {
    SOVEREIGNTY: "SOVEREIGNTY RISK",
    "FOREIGN INFLUENCE": "OUTSIDE INFLUENCE",
    "EXTERNAL INFLUENCE": "OUTSIDE INFLUENCE",
  };
  return aliases[normalized] ?? normalized;
}

function normalizeActor(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized || /^(n\/a|none|null|unknown)$/i.test(normalized)) return null;
  const key = normalized.toLowerCase();
  const aliases: Record<string, z.infer<typeof actorSchema>> = {
    china: "China",
    chinese: "China",
    us: "United States",
    usa: "United States",
    "united states": "United States",
    eu: "EU / CBAM",
    cbam: "EU / CBAM",
    "european union": "EU / CBAM",
    russia: "Russia",
    russian: "Russia",
    imf: "IMF / World Bank",
    "world bank": "IMF / World Bank",
    france: "France",
    french: "France",
    gulf: "Gulf States",
    "gulf states": "Gulf States",
    uae: "Gulf States",
    uk: "UK",
    "united kingdom": "UK",
    britain: "UK",
  };
  return aliases[key] ?? normalized;
}

function candidateSourceUrl(raw: Record<string, unknown>): string | null {
  return normalizeUrl(
    raw.sourceUrl ?? raw.url ?? raw.link ?? raw.canonicalUrl,
  );
}

function candidateDate(
  raw: Record<string, unknown>,
  now: Date,
): string | null {
  return normalizeDate(
    raw.sourcePublishedAt ??
      raw.isoDate ??
      raw.pubDate ??
      raw.publishedAt ??
      raw.date ??
      raw.timeAgo,
    now,
  );
}

function normalizeCandidate(
  dataset: "intelligence" | "blog",
  input: unknown,
  now: Date,
): Record<string, unknown> {
  const raw =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const sourceUrl = candidateSourceUrl(raw);
  const source = normalizeText(raw.source ?? raw.publisher ?? raw.author);
  const common = {
    dataset,
    title: normalizeText(raw.title),
    summary: normalizeText(raw.summary ?? raw.description ?? raw.excerpt),
    source,
    sourceUrl,
    canonicalUrl: normalizeUrl(raw.canonicalUrl) ?? sourceUrl,
    sourcePublishedAt: candidateDate(raw, now),
    retrievedAt:
      normalizeDate(raw.retrievedAt, now) ??
      normalizeDate(raw.created_at, now) ??
      now.toISOString(),
  };
  if (dataset === "blog") {
    return {
      ...common,
      author: normalizeText(raw.author),
      tag: normalizeText(raw.tag),
    };
  }
  return {
    ...common,
    severity: normalizeSeverity(raw.severity),
    category: normalizeCategory(raw.category),
    isoCode: normalizeIso3(raw.isoCode ?? raw.iso_code ?? raw.countryCode),
    actor: normalizeActor(raw.actor),
    timeAgo:
      normalizeText(raw.timeAgo) ||
      (common.sourcePublishedAt
        ? new Date(common.sourcePublishedAt).toLocaleDateString("en-CA")
        : ""),
    imageUrl: normalizeUrl(raw.imageUrl ?? raw.image_url),
  };
}

export function isAfricaRelevant(
  candidate: NormalizedPublicationCandidate,
): boolean {
  const haystack = [
    candidate.title,
    candidate.summary,
    candidate.dataset === "blog" ? candidate.tag : "",
  ]
    .join(" ")
    .toLowerCase();
  return AFRICA_TERMS.some((term) => haystack.includes(term));
}

export function isClassificationCoherent(
  candidate: NormalizedPublicationCandidate,
): { coherent: boolean; detail: string } {
  if (candidate.dataset === "blog") {
    return { coherent: true, detail: "Blog fields are structurally coherent." };
  }
  if (candidate.category === "OUTSIDE INFLUENCE" && !candidate.actor) {
    return {
      coherent: false,
      detail: "Outside-influence alerts require a recognized foreign actor.",
    };
  }
  if (candidate.actor) {
    const text = `${candidate.title} ${candidate.summary}`.toLowerCase();
    const actorTerms: Record<z.infer<typeof actorSchema>, string[]> = {
      China: ["china", "chinese"],
      "United States": ["united states", "u.s.", "american"],
      "EU / CBAM": ["european union", "eu ", "cbam", "european"],
      Russia: ["russia", "russian"],
      "IMF / World Bank": ["imf", "world bank"],
      France: ["france", "french"],
      "Gulf States": ["gulf", "uae", "emirates", "saudi", "qatar"],
      UK: ["united kingdom", "british", "britain", "uk "],
    };
    if (!actorTerms[candidate.actor].some((term) => text.includes(term))) {
      return {
        coherent: false,
        detail: `Actor ${candidate.actor} is not supported by the title or summary.`,
      };
    }
  }
  return { coherent: true, detail: "Category and actor are coherent." };
}

export function sourceQuality(
  candidate: NormalizedPublicationCandidate,
  approvedSourceQuality: Readonly<Record<string, number>> = {},
): number {
  const configuredQuality =
    approvedSourceQuality[candidate.source.toLowerCase()];
  if (configuredQuality !== undefined) return configuredQuality;
  const host = new URL(candidate.sourceUrl).hostname;
  if (host.endsWith(".gov") || host.endsWith(".gov.za") || host.endsWith(".int")) {
    return 0.95;
  }
  for (const [approvedHost, quality] of Object.entries(
    APPROVED_SOURCE_QUALITY_BY_HOST,
  )) {
    if (host === approvedHost || host.endsWith(`.${approvedHost}`)) return quality;
  }
  return 0;
}

export function calculateConfidenceComponents(
  candidate: NormalizedPublicationCandidate,
  options: Pick<
    PublicationGateOptions,
    "now" | "corroboratingSources" | "approvedSourceQuality"
  > = {},
): ConfidenceExplanation {
  const now = options.now ?? new Date();
  const policy = DATASET_TRUST_POLICIES[candidate.dataset];
  const ageMs = Math.max(
    0,
    now.getTime() - Date.parse(candidate.sourcePublishedAt),
  );
  const recency = Math.max(0, 1 - ageMs / policy.maximumAgeMs);
  const completeness =
    candidate.dataset === "intelligence"
      ? [candidate.title, candidate.summary, candidate.sourceUrl, candidate.isoCode]
          .filter(Boolean).length / 4
      : [candidate.title, candidate.summary, candidate.sourceUrl, candidate.author, candidate.tag]
          .filter(Boolean).length / 5;
  const classification = isClassificationCoherent(candidate).coherent ? 1 : 0;
  const corroboratingSources = Math.max(0, options.corroboratingSources ?? 0);
  const corroboration = Math.min(1, 0.5 + corroboratingSources * 0.25);
  const components = {
    sourceQuality: sourceQuality(candidate, options.approvedSourceQuality),
    completeness,
    corroboration,
    recency,
    classification,
  };
  const weights = {
    sourceQuality: 0.25,
    completeness: 0.25,
    corroboration: 0.1,
    recency: 0.15,
    classification: 0.25,
  };
  const overall = Number(
    Object.keys(weights)
      .reduce(
        (sum, key) =>
          sum +
          components[key as keyof typeof components] *
            weights[key as keyof typeof weights],
        0,
      )
      .toFixed(4),
  );
  return {
    confidence: confidenceSchema.parse({ overall, ...components }),
    weights,
    evidence: {
      sourceQuality: `Source host scored ${components.sourceQuality.toFixed(2)}.`,
      completeness: `${Math.round(completeness * 100)}% of required fields are present.`,
      corroboration: `${corroboratingSources} additional corroborating source(s).`,
      recency: `Source age is ${Math.round(ageMs / 3_600_000)} hour(s).`,
      classification: classification
        ? "Actor/category checks passed."
        : "Actor/category checks failed.",
    },
  };
}

export function areNearDuplicates(
  left: NormalizedPublicationCandidate,
  right: NormalizedPublicationCandidate,
  threshold = 0.82,
): boolean {
  if (left.dataset !== right.dataset) return false;
  if (left.canonicalUrl === right.canonicalUrl) return true;
  if (left.title.toLowerCase() === right.title.toLowerCase()) return true;
  const tokens = (candidate: NormalizedPublicationCandidate) =>
    new Set(
      `${candidate.title} ${candidate.summary}`
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union >= threshold;
}

export function findDuplicate(
  candidate: NormalizedPublicationCandidate,
  seen: ReadonlyArray<NormalizedPublicationCandidate>,
): NormalizedPublicationCandidate | null {
  const identity = createPublicationIdentity(candidate);
  return (
    seen.find((existing) => {
      const existingIdentity = createPublicationIdentity(existing);
      return (
        identity.contentHash === existingIdentity.contentHash ||
        areNearDuplicates(candidate, existing)
      );
    }) ?? null
  );
}

export function evaluateDatasetPolicy(
  candidate: NormalizedPublicationCandidate,
  confidence: Confidence,
  now = new Date(),
): QuarantineReasonOutput[] {
  const policy = DATASET_TRUST_POLICIES[candidate.dataset];
  const reasons: QuarantineReasonOutput[] = [];
  const ageMs = now.getTime() - Date.parse(candidate.sourcePublishedAt);
  if (!Number.isFinite(ageMs)) {
    reasons.push(
      reason("missing_provenance", "A valid source publication date is required."),
    );
  } else if (ageMs > policy.maximumAgeMs) {
    reasons.push(
      reason(
        "stale_source",
        `Source exceeds the ${Math.round(policy.maximumAgeMs / 86_400_000)}-day policy.`,
      ),
    );
  }
  if (confidence.overall < policy.minimumConfidence) {
    reasons.push(
      reason(
        "confidence_below_threshold",
        `Confidence ${confidence.overall.toFixed(4)} is below ${policy.minimumConfidence.toFixed(2)}.`,
      ),
    );
  }
  const minimumSourceQuality = MINIMUM_SOURCE_QUALITY[candidate.dataset];
  if (confidence.sourceQuality < minimumSourceQuality) {
    reasons.push(
      reason(
        "source_untrusted",
        `Source quality ${confidence.sourceQuality.toFixed(2)} is below the approved-source floor ${minimumSourceQuality.toFixed(2)}.`,
      ),
    );
  }
  return reasons;
}

function schemaReasons(
  issues: z.core.$ZodIssue[],
): QuarantineReasonOutput[] {
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const reasons = [
    reason("schema_invalid", details.join("; ") || "Candidate schema is invalid."),
  ];
  if (issues.some((issue) => issue.path.includes("sourceUrl") || issue.path.includes("source"))) {
    reasons.push(reason("missing_provenance", "A valid source name and URL are required."));
  }
  if (issues.some((issue) => issue.path.includes("sourcePublishedAt"))) {
    reasons.push(reason("missing_provenance", "A valid source publication date is required."));
  }
  if (issues.some((issue) => issue.path.includes("summary"))) {
    reasons.push(reason("summary_missing", "A substantive summary of at least 40 characters is required."));
  }
  if (issues.some((issue) => issue.path.includes("isoCode"))) {
    reasons.push(reason("country_unresolved", "A supported African ISO-3 code is required."));
  }
  return reasons;
}

function emptyConfidence(): ConfidenceExplanation {
  const confidence = confidenceSchema.parse({
    overall: 0,
    sourceQuality: 0,
    completeness: 0,
    corroboration: 0,
    recency: 0,
    classification: 0,
  });
  return {
    confidence,
    weights: {
      sourceQuality: 0.25,
      completeness: 0.25,
      corroboration: 0.1,
      recency: 0.15,
      classification: 0.25,
    },
    evidence: {
      sourceQuality: "Not calculated because schema validation failed.",
      completeness: "Not calculated because schema validation failed.",
      corroboration: "Not calculated because schema validation failed.",
      recency: "Not calculated because schema validation failed.",
      classification: "Not calculated because schema validation failed.",
    },
  };
}

export function evaluatePublicationCandidate(
  dataset: "intelligence" | "blog",
  input: unknown,
  options: PublicationGateOptions = {},
): PublicationDecision {
  const now = options.now ?? new Date();
  const normalizedInput = normalizeCandidate(dataset, input, now);
  const parsed = normalizedPublicationCandidateSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    return {
      decision: "quarantine",
      dataset,
      rawCandidate: input,
      evaluatedAt: now.toISOString(),
      normalized: null,
      identity: null,
      confidence: emptyConfidence(),
      reasons: schemaReasons(parsed.error.issues),
    };
  }

  const candidate = parsed.data;
  const identity = createPublicationIdentity(candidate);
  const confidence = calculateConfidenceComponents(candidate, options);
  const reasons = evaluateDatasetPolicy(candidate, confidence.confidence, now);

  if (!isAfricaRelevant(candidate)) {
    reasons.push(
      reason(
        "africa_relevance_failed",
        "No supported African country or regional context was found.",
      ),
    );
  }
  const coherence = isClassificationCoherent(candidate);
  if (!coherence.coherent) {
    reasons.push(reason("classification_incoherent", coherence.detail));
  }
  const duplicate = findDuplicate(candidate, options.seen ?? []);
  if (duplicate) {
    reasons.push(
      reason(
        "duplicate_candidate",
        `Matches existing candidate "${duplicate.title}" by URL, hash, or text similarity.`,
      ),
    );
  }

  const uniqueReasons = [...new Map(reasons.map((item) => [item.code, item])).values()];
  return {
    decision: uniqueReasons.length === 0 ? "publish" : "quarantine",
    dataset,
    rawCandidate: input,
    evaluatedAt: now.toISOString(),
    normalized: candidate,
    identity,
    confidence,
    reasons: uniqueReasons,
  };
}

export function evaluatePublicationBatch(
  dataset: "intelligence" | "blog",
  inputs: readonly unknown[],
  options: Omit<PublicationGateOptions, "seen"> = {},
): PublicationDecision[] {
  const seen: NormalizedPublicationCandidate[] = [];
  return inputs.map((input) => {
    const decision = evaluatePublicationCandidate(dataset, input, {
      ...options,
      seen,
    });
    if (decision.normalized) seen.push(decision.normalized);
    return decision;
  });
}

export function toLegacyRecord(
  decision: PublicationDecision,
): Record<string, unknown> {
  if (decision.decision !== "publish" || !decision.normalized) {
    throw new Error("Only accepted publication decisions can become legacy records.");
  }
  const candidate = decision.normalized;
  if (candidate.dataset === "blog") {
    return {
      title: candidate.title,
      summary: candidate.summary,
      author: candidate.author,
      tag: candidate.tag,
      url: candidate.canonicalUrl,
      created_at: candidate.retrievedAt,
    };
  }
  return {
    title: candidate.title,
    summary: candidate.summary,
    severity: candidate.severity,
    category: candidate.category,
    isoCode: candidate.isoCode,
    actor: candidate.actor,
    timeAgo: candidate.timeAgo,
    source: candidate.source,
    url: candidate.canonicalUrl,
    imageUrl: candidate.imageUrl,
    created_at: candidate.retrievedAt,
  };
}
