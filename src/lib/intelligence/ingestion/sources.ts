export const SOURCE_REGISTRY_VERSION = "2026-07-17.v1";

export type SourceRole = "authority" | "discovery";
export type PublisherType =
  | "official"
  | "multilateral"
  | "original-news"
  | "market-analysis"
  | "aggregator"
  | "open-platform";

interface GovernedSource {
  role?: SourceRole;
  publisherType?: PublisherType;
  allowedHosts?: readonly string[];
  sourceQuality?: number;
  registryVersion?: typeof SOURCE_REGISTRY_VERSION;
}

export interface IntelligenceSource {
  name: string;
  url: string;
  rssUrl?: string;
  role?: SourceRole;
  publisherType?: PublisherType;
  allowedHosts?: readonly string[];
  sourceQuality?: number;
  registryVersion?: typeof SOURCE_REGISTRY_VERSION;
}

export interface BlogSource {
  name: string;
  url: string;
  rssUrl?: string;
  role?: SourceRole;
  publisherType?: PublisherType;
  allowedHosts?: readonly string[];
  sourceQuality?: number;
  registryVersion?: typeof SOURCE_REGISTRY_VERSION;
}

function governed(
  source: Omit<GovernedSource, "registryVersion" | "role">,
): GovernedSource {
  return {
    ...source,
    role: "authority",
    registryVersion: SOURCE_REGISTRY_VERSION,
  };
}

function normalizedHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function sourceAllowsCanonicalUrl(
  source: IntelligenceSource | BlogSource,
  url: string,
): boolean {
  if (
    source.role !== "authority" ||
    source.registryVersion !== SOURCE_REGISTRY_VERSION ||
    !source.allowedHosts?.length
  ) {
    return false;
  }
  const host = normalizedHost(url);
  if (!host) return false;
  return source.allowedHosts.some((allowed) => {
    const normalized = allowed.toLowerCase().replace(/^www\./, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

export const INTELLIGENCE_SOURCES: readonly IntelligenceSource[] = [
  {
    name: "African Union Press Releases",
    url: "https://au.int/en/pressreleases",
    ...governed({
      publisherType: "official",
      allowedHosts: ["au.int"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "African Development Bank Press Releases",
    url: "https://www.afdb.org/en/news-and-events/press-releases",
    ...governed({
      publisherType: "multilateral",
      allowedHosts: ["afdb.org"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "UNECA Media Centre",
    url: "https://www.uneca.org/media-centre",
    ...governed({
      publisherType: "multilateral",
      allowedHosts: ["uneca.org"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "Africanews Business",
    url: "https://www.africanews.com/business/",
    rssUrl: "https://www.africanews.com/feed/",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["africanews.com"],
      sourceQuality: 0.9,
    }),
  },
  {
    name: "Mining Weekly Africa",
    url: "https://www.miningweekly.com/page/africa",
    rssUrl: "https://www.miningweekly.com/rss.php?item_id=2334",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["miningweekly.com"],
      sourceQuality: 0.9,
    }),
  },
  {
    name: "African Business Magazine",
    url: "https://african.business/",
    rssUrl: "https://african.business/feed/",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["african.business"],
      sourceQuality: 0.9,
    }),
  },
  {
    name: "The Africa Report",
    url: "https://theafricareport.com/",
    rssUrl: "https://www.theafricareport.com/feed/",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["theafricareport.com"],
      sourceQuality: 0.9,
    }),
  },
  {
    name: "Daily Maverick",
    url: "https://www.dailymaverick.co.za/",
    rssUrl: "https://www.dailymaverick.co.za/feed/",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["dailymaverick.co.za"],
      sourceQuality: 0.9,
    }),
  },
  {
    name: "Premium Times Nigeria",
    url: "https://www.premiumtimesng.com/",
    rssUrl: "https://www.premiumtimesng.com/feed",
    ...governed({
      publisherType: "original-news",
      allowedHosts: ["premiumtimesng.com"],
      sourceQuality: 0.9,
    }),
  },
];

export const BLOG_SOURCES: readonly BlogSource[] = [
  {
    name: "World Bank Africa Can End Poverty",
    url: "https://blogs.worldbank.org/en/africacan",
    ...governed({
      publisherType: "multilateral",
      allowedHosts: ["blogs.worldbank.org"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "African Development Bank Opinion",
    url: "https://www.afdb.org/en/news-and-events/opinion",
    ...governed({
      publisherType: "multilateral",
      allowedHosts: ["afdb.org"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "UNECA Blogs",
    url: "https://www.uneca.org/blogs",
    ...governed({
      publisherType: "multilateral",
      allowedHosts: ["uneca.org"],
      sourceQuality: 0.98,
    }),
  },
  {
    name: "ISS Africa Today",
    url: "https://issafrica.org/iss-today",
    ...governed({
      publisherType: "market-analysis",
      allowedHosts: ["issafrica.org"],
      sourceQuality: 0.9,
    }),
  },
];

export const INTELLIGENCE_DISCOVERY_SOURCES: readonly IntelligenceSource[] = [
  {
    name: "Google News Geopolitics",
    url: "https://news.google.com/search?q=Africa+geopolitics",
    rssUrl:
      "https://news.google.com/rss/search?q=Africa+geopolitics+when:24h&hl=en-US&gl=US&ceid=US:en",
    role: "discovery",
    publisherType: "aggregator",
    allowedHosts: ["news.google.com"],
    registryVersion: SOURCE_REGISTRY_VERSION,
  },
  {
    name: "Google News Foreign Influence",
    url: "https://news.google.com/search?q=Africa+China+US",
    rssUrl:
      "https://news.google.com/rss/search?q=Africa+(China+OR+US+OR+Russia)+when:24h&hl=en-US&gl=US&ceid=US:en",
    role: "discovery",
    publisherType: "aggregator",
    allowedHosts: ["news.google.com"],
    registryVersion: SOURCE_REGISTRY_VERSION,
  },
];

export const BLOG_DISCOVERY_SOURCES: readonly BlogSource[] = [
  {
    name: "Medium Africa",
    url: "https://medium.com/tag/africa/recommended",
    rssUrl: "https://medium.com/feed/tag/africa",
    role: "discovery",
    publisherType: "open-platform",
    allowedHosts: ["medium.com"],
    registryVersion: SOURCE_REGISTRY_VERSION,
  },
  {
    name: "Medium African Development",
    url: "https://medium.com/tag/african-development/recommended",
    rssUrl: "https://medium.com/feed/tag/african-development",
    role: "discovery",
    publisherType: "open-platform",
    allowedHosts: ["medium.com"],
    registryVersion: SOURCE_REGISTRY_VERSION,
  },
];

export const CONFIGURED_SOURCE_QUALITY: Readonly<Record<string, number>> =
  Object.fromEntries(
    [...INTELLIGENCE_SOURCES, ...BLOG_SOURCES].map((source) => [
      source.name.toLowerCase(),
      source.sourceQuality!,
    ]),
  );

export function configuredSourceQuality(
  sourceName: string,
  canonicalUrl: string,
  dataset?: "intelligence" | "blog",
): number | null {
  const normalizedName = sourceName.trim().toLowerCase();
  const candidates =
    dataset === "intelligence"
      ? INTELLIGENCE_SOURCES
      : dataset === "blog"
        ? BLOG_SOURCES
        : [...INTELLIGENCE_SOURCES, ...BLOG_SOURCES];
  const source = candidates.find(
    (candidate) => candidate.name.toLowerCase() === normalizedName,
  );
  return source && sourceAllowsCanonicalUrl(source, canonicalUrl)
    ? source.sourceQuality ?? null
    : null;
}

export const INTELLIGENCE_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          category: {
            type: "string",
            enum: ["SOVEREIGNTY RISK", "OUTSIDE INFLUENCE"],
          },
          isoCode: { type: "string" },
          actor: {
            type: "string",
            enum: [
              "China",
              "United States",
              "EU / CBAM",
              "Russia",
              "IMF / World Bank",
              "France",
              "Gulf States",
              "UK",
              "",
            ],
          },
          timeAgo: { type: "string" },
          url: { type: "string" },
          sourcePublishedAt: { type: "string", format: "date-time" },
          imageUrl: { type: "string" },
        },
        required: [
          "title",
          "summary",
          "severity",
          "category",
          "isoCode",
          "timeAgo",
          "url",
          "sourcePublishedAt",
        ],
      },
    },
  },
  required: ["articles"],
} as const;

export const BLOG_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          author: { type: "string" },
          tag: { type: "string" },
          url: { type: "string" },
          sourcePublishedAt: { type: "string", format: "date-time" },
        },
        required: [
          "title",
          "summary",
          "author",
          "tag",
          "url",
          "sourcePublishedAt",
        ],
      },
    },
  },
  required: ["posts"],
} as const;
