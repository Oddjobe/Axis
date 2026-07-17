import assert from "node:assert/strict";

import {
  evaluatePublicationBatch,
  evaluatePublicationCandidate,
} from "../src/lib/intelligence/publication-gate";
import {
  extractFirecrawlPageEvidence,
  extractJinaPageEvidence,
  mergeFeedProvenance,
} from "../src/lib/intelligence/ingestion/adapters.server";
import {
  selectExplicitPublicationTimestamp,
  shapeBlogCandidates,
  shapeIntelligenceCandidates,
} from "../src/lib/intelligence/ingestion/candidates";
import {
  blogSource,
  evidenceNow,
  feedEvidenceFixture,
  firecrawlPayloadFixture,
  intelligenceSource,
  rssExcerpt,
  supportedBlogCandidate,
  supportedIntelligenceCandidate,
} from "./fixtures/intelligence-evidence";

function shaped(candidate: Record<string, unknown>) {
  return shapeIntelligenceCandidates(
    intelligenceSource,
    [candidate],
    evidenceNow,
  )[0];
}

const precedence = selectExplicitPublicationTimestamp({
  pubDate: "2026-07-16T09:00:00Z",
  datePublished: "2026-07-16T08:00:00Z",
  sourcePublishedAt: "2026-07-16T07:00:00Z",
  created_at: "2026-07-16T12:00:00Z",
});
assert.deepEqual(precedence, {
  value: "2026-07-16T07:00:00.000Z",
  field: "sourcePublishedAt",
});
assert.equal(
  selectExplicitPublicationTimestamp({
    created_at: "2026-07-16T12:00:00Z",
    retrievedAt: "2026-07-16T12:00:00Z",
  }),
  null,
);

const pageEvidence = extractFirecrawlPageEvidence(
  firecrawlPayloadFixture,
  intelligenceSource.url,
);
assert.equal(pageEvidence.timestampField, "datePublished");
assert.equal(pageEvidence.sourcePublishedAt, "2026-07-16T10:00:00.000Z");
assert.equal(
  pageEvidence.canonicalUrl,
  "https://african.business/news/digital-trade",
);
assert.equal(pageEvidence.excerpt, rssExcerpt);

const jinaEvidence = extractJinaPageEvidence(
  `Title: Digital trade\nURL Source: https://african.business/news/digital-trade?utm_source=jina\nPublished Time: 2026-07-16T10:00:00Z\nMarkdown Content:\n\n${rssExcerpt}`,
  intelligenceSource.url,
);
assert.equal(jinaEvidence.sourcePublishedAt, "2026-07-16T10:00:00.000Z");
assert.equal(
  jinaEvidence.canonicalUrl,
  "https://african.business/news/digital-trade",
);
assert.equal(jinaEvidence.excerpt, rssExcerpt);

const merged = mergeFeedProvenance(
  [
    {
      ...supportedIntelligenceCandidate,
      summary: "A model-generated summary that is not source evidence.",
    },
  ],
  [feedEvidenceFixture],
)[0];
assert.equal(merged.summary, rssExcerpt);
assert.equal(
  (merged.modelCandidate as Record<string, unknown>).summary,
  "A model-generated summary that is not source evidence.",
);
assert.equal(
  (merged.sourceEvidence as Record<string, unknown>).supported,
  true,
);

const disagreement = mergeFeedProvenance(
  [
    {
      ...supportedIntelligenceCandidate,
      sourcePublishedAt: "2026-07-15T10:00:00Z",
    },
  ],
  [feedEvidenceFixture],
)[0];
assert.equal(
  (disagreement.sourceEvidence as Record<string, unknown>).supported,
  false,
);
assert.deepEqual(
  (disagreement.sourceEvidence as Record<string, unknown>).disagreements,
  [
    "publication_timestamp:2026-07-15T10:00:00.000Z!=2026-07-16T10:00:00.000Z",
  ],
);

const accepted = evaluatePublicationCandidate(
  "intelligence",
  shaped(supportedIntelligenceCandidate),
  { now: evidenceNow },
);
assert.equal(accepted.decision, "publish");

const futureTimestamp = "2026-07-16T12:05:00.001Z";
const futureDated = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    sourcePublishedAt: futureTimestamp,
    sourceEvidence: {
      ...(supportedIntelligenceCandidate.sourceEvidence as Record<string, unknown>),
      sourcePublishedAt: futureTimestamp,
    },
  }),
  { now: evidenceNow },
);
assert.equal(futureDated.decision, "quarantine");
assert(
  futureDated.reasons.some(
    ({ code, detail }) =>
      code === "stale_source" && detail.includes("future"),
  ),
);
assert.equal(futureDated.confidence.confidence.recency, 0);

const acceptedBlog = evaluatePublicationCandidate(
  "blog",
  shapeBlogCandidates(blogSource, [supportedBlogCandidate], evidenceNow)[0],
  { now: evidenceNow },
);
assert.equal(acceptedBlog.decision, "publish");

const missingMetadata = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    sourcePublishedAt: undefined,
    created_at: evidenceNow.toISOString(),
    retrievedAt: evidenceNow.toISOString(),
    sourceEvidence: {
      origin: "rss",
      canonicalUrl: supportedIntelligenceCandidate.url,
      sourcePublishedAt: null,
      excerpt: "",
      timestampField: null,
      supported: false,
      disagreements: [],
    },
  }),
  { now: evidenceNow },
);
assert.equal(missingMetadata.decision, "quarantine");
assert(missingMetadata.reasons.some(({ code }) => code === "missing_provenance"));
assert(missingMetadata.reasons.some(({ code }) => code === "summary_missing"));

const disagreementDecision = evaluatePublicationCandidate(
  "intelligence",
  shaped(disagreement),
  { now: evidenceNow },
);
assert.equal(disagreementDecision.decision, "quarantine");
assert(
  disagreementDecision.reasons.some(
    ({ code, detail }) =>
      code === "source_untrusted" &&
      detail.startsWith("Source evidence disagrees"),
  ),
);

const incoherent = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    category: "OUTSIDE INFLUENCE",
    actor: "China",
  }),
  { now: evidenceNow },
);
assert.equal(incoherent.decision, "quarantine");
assert(
  incoherent.reasons.some(({ code }) => code === "classification_incoherent"),
);

const irrelevant = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    title: "Global digital trade infrastructure expands",
    summary:
      "A cross-border digital trade programme will support exporters and improve access to international markets.",
    sourceEvidence: {
      ...(supportedIntelligenceCandidate.sourceEvidence as object),
      excerpt:
        "A cross-border digital trade programme will support exporters and improve access to international markets.",
    },
  }),
  { now: evidenceNow },
);
assert.equal(irrelevant.decision, "quarantine");
assert(
  irrelevant.reasons.some(({ code }) => code === "africa_relevance_failed"),
);

const lowConfidence = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    url: "https://untrusted.example/nigeria-trade",
    sourceEvidence: {
      ...(supportedIntelligenceCandidate.sourceEvidence as object),
      canonicalUrl: "https://untrusted.example/nigeria-trade",
    },
  }),
  { now: evidenceNow },
);
assert.equal(lowConfidence.decision, "quarantine");
assert(
  lowConfidence.reasons.some(
    ({ code }) => code === "confidence_below_threshold",
  ),
);

const duplicates = evaluatePublicationBatch(
  "intelligence",
  [
    shaped(supportedIntelligenceCandidate),
    shaped({
      ...supportedIntelligenceCandidate,
      url: `${supportedIntelligenceCandidate.url}&utm_campaign=duplicate`,
    }),
  ],
  { now: evidenceNow },
);
assert.equal(duplicates[0].decision, "publish");
assert(
  duplicates[1].reasons.some(({ code }) => code === "duplicate_candidate"),
);

const retrievalOnly = evaluatePublicationCandidate(
  "intelligence",
  shaped({
    ...supportedIntelligenceCandidate,
    sourcePublishedAt: undefined,
    sourceEvidence: undefined,
    created_at: "2026-07-16T10:00:00Z",
    retrievedAt: "2026-07-16T10:00:00Z",
  }),
  { now: evidenceNow },
);
assert.equal(retrievalOnly.decision, "quarantine");
assert(
  retrievalOnly.reasons.some(({ code }) => code === "missing_provenance"),
);
assert.equal(
  evaluatePublicationCandidate(
    "intelligence",
    shaped(supportedIntelligenceCandidate),
    { now: evidenceNow },
  ).decision,
  "publish",
);

console.log(
  "Intelligence evidence fixtures passed (precedence, metadata, disagreement, coherence, relevance, confidence, deduplication, backfill/quarantine).",
);
