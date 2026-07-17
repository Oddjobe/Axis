import assert from "node:assert/strict";

import {
  evaluatePublicationBatch,
  evaluatePublicationCandidate,
} from "../src/lib/intelligence/publication-gate";
import {
  hasCompleteCandidateProvenance,
  requireCompleteCandidateProvenance,
} from "../src/lib/intelligence/ingestion/adapters.server";
import {
  BLOG_EXTRACT_SCHEMA,
  CONFIGURED_SOURCE_QUALITY,
  INTELLIGENCE_EXTRACT_SCHEMA,
} from "../src/lib/intelligence/ingestion/sources";

const now = new Date("2026-07-16T12:00:00.000Z");
const fixture = {
  title: "Nigeria expands regional digital trade infrastructure",
  summary:
    "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.",
  severity: "MEDIUM",
  category: "SOVEREIGNTY RISK",
  isoCode: "nga",
  timeAgo: "2 hours ago",
  source: "African Business Magazine",
  url: "https://african.business/news/item?utm_source=test",
};

const accepted = evaluatePublicationCandidate("intelligence", fixture, { now });
assert.equal(accepted.decision, "publish");
assert.equal(accepted.normalized?.canonicalUrl, "https://african.business/news/item");
assert.equal(
  accepted.normalized?.dataset === "intelligence"
    ? accepted.normalized.isoCode
    : null,
  "NGA",
);
assert.equal(accepted.identity?.contentHash.length, 64);

const arbitrarySource = evaluatePublicationCandidate(
  "intelligence",
  {
    ...fixture,
    source: "Unreviewed Viral Feed",
    url: "https://unreviewed-feed.example/story",
    sourcePublishedAt: now.toISOString(),
  },
  { now, corroboratingSources: 10 },
);
assert.equal(arbitrarySource.decision, "quarantine");
assert.equal(arbitrarySource.confidence.confidence.sourceQuality, 0);
assert(
  arbitrarySource.reasons.some((item) => item.code === "source_untrusted"),
);
assert(
  !arbitrarySource.reasons.some(
    (item) => item.code === "confidence_below_threshold",
  ),
);

const configuredSourceCandidate = {
  ...fixture,
  source: "African Business Magazine",
  url: "https://publisher.example/africa-story",
};
const unverifiedConfiguredName = evaluatePublicationCandidate(
  "intelligence",
  configuredSourceCandidate,
  { now },
);
assert.equal(unverifiedConfiguredName.decision, "quarantine");
assert(
  unverifiedConfiguredName.reasons.some(
    (item) => item.code === "source_untrusted",
  ),
);
const configuredSource = evaluatePublicationCandidate(
  "intelligence",
  configuredSourceCandidate,
  { now, approvedSourceQuality: CONFIGURED_SOURCE_QUALITY },
);
assert.equal(configuredSource.decision, "quarantine");
const governedSource = evaluatePublicationCandidate(
  "intelligence",
  {
    ...configuredSourceCandidate,
    url: "https://african.business/africa-story",
  },
  { now, approvedSourceQuality: CONFIGURED_SOURCE_QUALITY },
);
assert.equal(governedSource.decision, "publish");

const missingSource = evaluatePublicationCandidate(
  "intelligence",
  { ...fixture, url: "", sourceUrl: "", timeAgo: "" },
  { now },
);
assert.equal(missingSource.decision, "quarantine");
assert(missingSource.reasons.some((item) => item.code === "missing_provenance"));

const duplicateBatch = evaluatePublicationBatch(
  "intelligence",
  [
    fixture,
    {
      ...fixture,
      url: "https://african.business/news/item?utm_campaign=duplicate",
    },
  ],
  { now },
);
assert.equal(duplicateBatch[0].decision, "publish");
assert.equal(duplicateBatch[1].decision, "quarantine");
assert(
  duplicateBatch[1].reasons.some(
    (item) => item.code === "duplicate_candidate",
  ),
);

const incoherent = evaluatePublicationCandidate(
  "intelligence",
  {
    ...fixture,
    category: "OUTSIDE INFLUENCE",
    actor: "",
  },
  { now },
);
assert.equal(incoherent.decision, "quarantine");
assert(
  incoherent.reasons.some(
    (item) => item.code === "classification_incoherent",
  ),
);

const blog = evaluatePublicationCandidate(
  "blog",
  {
    title: "African infrastructure financing enters a new phase",
    summary:
      "A review of how African infrastructure investors are adapting their financing models to regional trade priorities.",
    author: "Axis Research",
    tag: "africa",
    source: "World Bank Africa Can End Poverty",
    url: "https://blogs.worldbank.org/en/africacan/infrastructure-financing",
    sourcePublishedAt: "2026-07-15T10:00:00.000Z",
  },
  { now, approvedSourceQuality: CONFIGURED_SOURCE_QUALITY },
);
assert.equal(blog.decision, "publish");

const blogItemSchema = BLOG_EXTRACT_SCHEMA.properties.posts.items;
const intelligenceItemSchema =
  INTELLIGENCE_EXTRACT_SCHEMA.properties.articles.items;
assert(blogItemSchema.required.includes("sourcePublishedAt"));
assert(intelligenceItemSchema.required.includes("sourcePublishedAt"));
assert.equal(
  hasCompleteCandidateProvenance({
    url: "https://medium.com/@axis/post",
    sourcePublishedAt: "2026-07-15T10:00:00.000Z",
  }),
  true,
);
assert.equal(
  hasCompleteCandidateProvenance({
    url: "https://medium.com/@axis/post",
  }),
  false,
);
assert.throws(
  () =>
    requireCompleteCandidateProvenance(
      [{ url: "https://medium.com/@axis/post" }],
      "Firecrawl fixture",
    ),
  /incomplete URL or publication-time provenance/,
);

console.log(
  "Publication gate fixtures passed (approved/untrusted source, reject, duplicate, coherence, provenance, blog).",
);
