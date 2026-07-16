export interface IntelligenceSource {
  name: string;
  url: string;
  rssUrl?: string;
}

export interface BlogSource {
  name: string;
  url: string;
  rssUrl: string;
}

export const CONFIGURED_SOURCE_QUALITY: Readonly<Record<string, number>> = {
  "google news geopolitics": 0.78,
  "google news foreign influence": 0.78,
  "google news financial infrastructure (cips)": 0.78,
  "africanews business": 0.88,
  "mining weekly africa": 0.88,
  "african business magazine": 0.88,
  "the africa report": 0.88,
  "daily maverick": 0.88,
  "premium times nigeria": 0.88,
  "medium africa": 0.75,
  "medium geopolitics": 0.75,
  "medium african development": 0.75,
};

export const INTELLIGENCE_SOURCES: readonly IntelligenceSource[] = [
  {
    name: "Google News Geopolitics",
    url: "https://news.google.com/search?q=Africa+geopolitics",
    rssUrl:
      "https://news.google.com/rss/search?q=Africa+geopolitics+when:24h&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News Foreign Influence",
    url: "https://news.google.com/search?q=Africa+China+US",
    rssUrl:
      "https://news.google.com/rss/search?q=Africa+(China+OR+US+OR+Russia)+when:24h&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News Financial Infrastructure (CIPS)",
    url: "https://news.google.com/search?q=Africa+CIPS+dedollarization",
    rssUrl:
      "https://news.google.com/rss/search?q=Africa+(CIPS+OR+dedollarization+OR+BRICS+Pay)+when:24h&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Africanews Business",
    url: "https://www.africanews.com/business/",
    rssUrl: "https://www.africanews.com/feed/",
  },
  {
    name: "Mining Weekly Africa",
    url: "https://www.miningweekly.com/page/africa",
    rssUrl: "https://www.miningweekly.com/rss.php?item_id=2334",
  },
  {
    name: "African Business Magazine",
    url: "https://african.business/",
    rssUrl: "https://african.business/feed/",
  },
  {
    name: "The Africa Report",
    url: "https://theafricareport.com/",
    rssUrl: "https://www.theafricareport.com/feed/",
  },
  {
    name: "Daily Maverick",
    url: "https://www.dailymaverick.co.za/",
    rssUrl: "https://www.dailymaverick.co.za/feed/",
  },
  {
    name: "Premium Times Nigeria",
    url: "https://www.premiumtimesng.com/",
    rssUrl: "https://www.premiumtimesng.com/feed",
  },
];

export const BLOG_SOURCES: readonly BlogSource[] = [
  {
    name: "Medium Africa",
    url: "https://medium.com/tag/africa/recommended",
    rssUrl: "https://medium.com/feed/tag/africa",
  },
  {
    name: "Medium Geopolitics",
    url: "https://medium.com/tag/geopolitics/recommended",
    rssUrl: "https://medium.com/feed/tag/geopolitics",
  },
  {
    name: "Medium African Development",
    url: "https://medium.com/tag/african-development/recommended",
    rssUrl: "https://medium.com/feed/tag/african-development",
  },
];

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
