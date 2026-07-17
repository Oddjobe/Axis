import type { RawCandidate } from "../../src/lib/intelligence/ingestion/types";

export const evidenceNow = new Date("2026-07-16T12:00:00.000Z");

export const rssExcerpt =
  "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.";

export const supportedIntelligenceCandidate: RawCandidate = {
  title: "Nigeria expands regional digital trade infrastructure",
  summary: rssExcerpt,
  severity: "MEDIUM",
  category: "SOVEREIGNTY RISK",
  isoCode: "NGA",
  actor: null,
  timeAgo: "2026-07-16",
  url: "https://african.business/news/digital-trade?utm_source=fixture",
  sourcePublishedAt: "2026-07-16T10:00:00.000Z",
  sourceEvidence: {
    origin: "rss",
    canonicalUrl: "https://african.business/news/digital-trade",
    sourcePublishedAt: "2026-07-16T10:00:00.000Z",
    excerpt: rssExcerpt,
    timestampField: "isoDate",
    supported: true,
    disagreements: [],
  },
};

export const intelligenceSource = {
  name: "African Business Magazine",
  url: "https://african.business/",
  rssUrl: "https://african.business/feed/",
};

export const blogSource = {
  name: "Medium Africa",
  url: "https://medium.com/tag/africa/recommended",
  rssUrl: "https://medium.com/feed/tag/africa",
};

export const supportedBlogCandidate: RawCandidate = {
  title: "African infrastructure financing enters a new phase",
  summary:
    "African infrastructure investors are adapting financing models to AfCFTA trade and regional development priorities.",
  author: "Axis Research",
  tag: "African development",
  url: "https://medium.com/@axis/african-infrastructure-financing",
  sourcePublishedAt: "2026-07-15T10:00:00.000Z",
  sourceEvidence: {
    origin: "rss",
    canonicalUrl:
      "https://medium.com/@axis/african-infrastructure-financing",
    sourcePublishedAt: "2026-07-15T10:00:00.000Z",
    excerpt:
      "African infrastructure investors are adapting financing models to AfCFTA trade and regional development priorities.",
    timestampField: "isoDate",
    supported: true,
    disagreements: [],
  },
};

export const feedEvidenceFixture = {
  title: supportedIntelligenceCandidate.title as string,
  summary: rssExcerpt,
  excerpt: rssExcerpt,
  url: "https://african.business/news/digital-trade",
  sourcePublishedAt: "2026-07-16T10:00:00.000Z",
  sourceEvidence: {
    origin: "rss" as const,
    canonicalUrl: "https://african.business/news/digital-trade",
    sourcePublishedAt: "2026-07-16T10:00:00.000Z",
    excerpt: rssExcerpt,
    timestampField: "isoDate",
    supported: true,
    disagreements: [],
  },
};

export const firecrawlPayloadFixture = {
  success: true,
  data: {
    metadata: {
      canonicalUrl: "https://african.business/news/digital-trade",
      datePublished: "2026-07-16T10:00:00.000Z",
      publishedAt: "2026-07-16T11:00:00.000Z",
      description: rssExcerpt,
    },
    markdown: `# Nigeria expands regional digital trade infrastructure\n\n${rssExcerpt}`,
    extract: {
      articles: [supportedIntelligenceCandidate],
    },
  },
};
