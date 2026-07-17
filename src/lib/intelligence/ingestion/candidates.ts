import { normalizeText, normalizeUrl } from "@/lib/intelligence/publication-gate";

import type { BlogSource, IntelligenceSource } from "./sources";
import type { RawCandidate } from "./types";

export const EXPLICIT_PUBLICATION_TIMESTAMP_FIELDS = [
  "sourcePublishedAt",
  "datePublished",
  "article:published_time",
  "og:published_time",
  "publishedTime",
  "publicationDate",
  "publishedAt",
  "published",
  "isoDate",
  "pubDate",
  "dc:date",
  "dcDate",
] as const;

export interface ExplicitPublicationTimestamp {
  value: string;
  field: (typeof EXPLICIT_PUBLICATION_TIMESTAMP_FIELDS)[number];
}

export interface SourceEvidence {
  origin: "rss" | "firecrawl-page" | "jina-page" | "adapter";
  canonicalUrl: string | null;
  sourcePublishedAt: string | null;
  excerpt: string;
  timestampField: string | null;
  supported: boolean;
  disagreements: string[];
}

function recordOf(value: unknown): RawCandidate {
  return typeof value === "object" && value !== null
    ? (value as RawCandidate)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? normalizeText(value) : "";
}

function timestampValue(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function selectExplicitPublicationTimestamp(
  ...records: readonly unknown[]
): ExplicitPublicationTimestamp | null {
  for (const field of EXPLICIT_PUBLICATION_TIMESTAMP_FIELDS) {
    for (const value of records) {
      const record = recordOf(value);
      const timestamp = timestampValue(record[field]);
      if (timestamp) return { value: timestamp, field };
    }
  }
  return null;
}

export function selectSourceExcerpt(...records: readonly unknown[]): string {
  const fields = [
    "excerpt",
    "contentSnippet",
    "description",
    "summary",
    "abstract",
    "content",
  ] as const;
  for (const field of fields) {
    for (const value of records) {
      const excerpt = text(recordOf(value)[field]);
      if (excerpt) return excerpt.slice(0, 2_000);
    }
  }
  return "";
}

export function selectCanonicalSourceUrl(
  ...records: readonly unknown[]
): string | null {
  const fields = [
    "canonicalUrl",
    "canonicalURL",
    "ogUrl",
    "sourceURL",
    "sourceUrl",
    "url",
    "link",
  ] as const;
  for (const field of fields) {
    for (const value of records) {
      const url = normalizeUrl(recordOf(value)[field]);
      if (url) return url;
    }
  }
  return null;
}

function sourceEvidenceOf(candidate: RawCandidate): SourceEvidence {
  const supplied = recordOf(candidate.sourceEvidence);
  const hasSuppliedEvidence =
    typeof candidate.sourceEvidence === "object" &&
    candidate.sourceEvidence !== null;
  const timestamp = selectExplicitPublicationTimestamp(
    hasSuppliedEvidence ? supplied : candidate,
  );
  const canonicalUrl = selectCanonicalSourceUrl(
    hasSuppliedEvidence ? supplied : candidate,
  );
  const excerpt = selectSourceExcerpt(
    hasSuppliedEvidence ? supplied : candidate,
  );
  const disagreements = Array.isArray(supplied.disagreements)
    ? supplied.disagreements
        .filter((item): item is string => typeof item === "string")
        .map(normalizeText)
        .filter(Boolean)
        .sort()
    : [];
  const origin =
    supplied.origin === "rss" ||
    supplied.origin === "firecrawl-page" ||
    supplied.origin === "jina-page"
      ? supplied.origin
      : "adapter";
  return {
    origin,
    canonicalUrl,
    sourcePublishedAt: timestamp?.value ?? null,
    excerpt,
    timestampField:
      text(supplied.timestampField) || timestamp?.field || null,
    supported:
      supplied.supported === false
        ? false
        : Boolean(canonicalUrl && timestamp && excerpt),
    disagreements,
  };
}

function commonCandidate(
  source: IntelligenceSource | BlogSource,
  candidate: RawCandidate,
  retrievedAt: Date,
): RawCandidate {
  const evidence = sourceEvidenceOf(candidate);
  const candidateUrl =
    selectCanonicalSourceUrl(candidate) ?? evidence.canonicalUrl;
  return {
    ...candidate,
    source: source.name,
    sourceUrl: candidateUrl,
    url: candidateUrl,
    canonicalUrl: candidateUrl,
    sourcePublishedAt: evidence.sourcePublishedAt,
    excerpt: evidence.excerpt,
    sourceEvidence: evidence,
    evidencePolicy: "strict",
    created_at: retrievedAt.toISOString(),
    retrievedAt: retrievedAt.toISOString(),
  };
}

export function shapeIntelligenceCandidates(
  source: IntelligenceSource,
  candidates: readonly unknown[],
  retrievedAt: Date,
): RawCandidate[] {
  return candidates.map((value) => {
    const candidate = recordOf(value);
    const severity = text(candidate.severity).toUpperCase();
    const category = text(candidate.category).toUpperCase();
    const actor = text(candidate.actor);
    return {
      ...commonCandidate(source, candidate, retrievedAt),
      isoCode: text(candidate.isoCode).toUpperCase(),
      severity,
      category,
      actor: /^(N\/A|NONE|NULL|UNKNOWN)$/i.test(actor) ? null : actor || null,
    };
  });
}

export function shapeBlogCandidates(
  source: BlogSource,
  candidates: readonly unknown[],
  retrievedAt: Date,
): RawCandidate[] {
  return candidates.map((value) =>
    commonCandidate(source, recordOf(value), retrievedAt),
  );
}
