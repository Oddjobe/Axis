import type { RawCandidate } from "./types";
import type { BlogSource, IntelligenceSource } from "./sources";

function recordOf(value: unknown): RawCandidate {
  return typeof value === "object" && value !== null
    ? (value as RawCandidate)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
      ...candidate,
      source: source.name,
      sourceUrl: text(candidate.url) || source.url,
      url: text(candidate.url) || source.url,
      sourcePublishedAt:
        candidate.sourcePublishedAt ?? candidate.isoDate ?? candidate.pubDate,
      isoCode: text(candidate.isoCode).toUpperCase(),
      severity: ["HIGH", "MEDIUM", "LOW"].includes(severity)
        ? severity
        : "MEDIUM",
      category: ["SOVEREIGNTY RISK", "OUTSIDE INFLUENCE"].includes(category)
        ? category
        : "SOVEREIGNTY RISK",
      actor: /^(N\/A|NONE|NULL|UNKNOWN)$/i.test(actor) ? null : actor || null,
      created_at: retrievedAt.toISOString(),
    };
  });
}

export function shapeBlogCandidates(
  source: BlogSource,
  candidates: readonly unknown[],
  retrievedAt: Date,
): RawCandidate[] {
  return candidates.map((value) => {
    const candidate = recordOf(value);
    return {
      ...candidate,
      source: source.name,
      sourceUrl: text(candidate.url) || source.url,
      url: text(candidate.url) || source.url,
      sourcePublishedAt:
        candidate.sourcePublishedAt ?? candidate.isoDate ?? candidate.pubDate,
      created_at: retrievedAt.toISOString(),
    };
  });
}
