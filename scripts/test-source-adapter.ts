import assert from "node:assert/strict";

import {
  createProductionIngestionAdapter,
  normalizeRssFeedItems,
} from "../src/lib/intelligence/ingestion/adapters.server";
import {
  BLOG_SOURCES,
  INTELLIGENCE_SOURCES,
} from "../src/lib/intelligence/ingestion/sources";

const source = (() => {
  const found = INTELLIGENCE_SOURCES.find(
    (item) => item.name === "African Business Magazine",
  );
  if (!found) {
    throw new Error("African Business Magazine fixture source missing");
  }
  return found;
})();

function listing(urls: string[]): Response {
  return Response.json({
    success: true,
    data: {
      extract: {
        articles: urls.map((url, index) => ({
          title: `Verified article ${index + 1}`,
          summary:
            "A model candidate summary that must be replaced by original-page evidence.",
          severity: "MEDIUM",
          category: "SOVEREIGNTY RISK",
          isoCode: "NGA",
          actor: "",
          timeAgo: "1 hour ago",
          url,
          sourcePublishedAt: "2026-07-17T10:00:00.000Z",
        })),
      },
    },
  });
}

function article(url: string): Response {
  return Response.json({
    success: true,
    data: {
      metadata: {
        canonicalUrl: url,
        title: "Authoritative original title",
        author: "Original Reporter",
        datePublished: "2026-07-17T10:00:00.000Z",
        description:
          "Nigeria expanded a regional digital trade programme with documented cross-border infrastructure investment.",
      },
      markdown:
        "# Verified article\n\nNigeria expanded a regional digital trade programme with documented cross-border infrastructure investment.",
    },
  });
}

function blogSource(name: string) {
  const found = BLOG_SOURCES.find((item) => item.name === name);
  if (!found) throw new Error(`${name} fixture source missing`);
  return found;
}

function assertBlogRssFixtures(): void {
  const afdb = blogSource("African Development Bank Opinion");
  assert.equal(afdb.url, "https://blogs.afdb.org/");
  assert.equal(afdb.rssUrl, "https://blogs.afdb.org/rss.xml");
  const afdbItems = normalizeRssFeedItems(afdb, [{
    title: "A development finance perspective",
    link: "https://blogs.afdb.org/development-finance",
    description: "An AfDB original blog excerpt with source-backed analysis.",
    pubDate: "2026-07-17T10:00:00.000Z",
  }]);
  assert.equal(afdbItems.length, 1);
  assert.equal(afdbItems[0].url, "https://blogs.afdb.org/development-finance");
  assert.equal(afdbItems[0].sourcePublishedAt, "2026-07-17T10:00:00.000Z");
  assert.equal(afdbItems[0].sourceEvidence.supported, true);

  const uneca = blogSource("UNECA Blogs");
  assert.equal(uneca.rssUrl, "https://www.uneca.org/rss.xml");
  const unecaItems = normalizeRssFeedItems(uneca, [{
    title: "[Blog] A genuine UNECA post",
    link: "https://www.uneca.org/stories/blog-genuine-post",
    description:
      "&lt;span property=&quot;dc:date&quot; datatype=&quot;xsd:dateTime&quot; content=&quot;2026-07-16T00:00:00+03:00&quot;&gt;16 July, 2026&lt;/span&gt;&lt;p&gt;UNECA source excerpt.&lt;/p&gt;",
    pubDate: "2026-07-16T10:00:00.000Z",
  }]);
  assert.equal(unecaItems.length, 1);
  assert.equal(
    unecaItems[0].url,
    "https://uneca.org/stories/blog-genuine-post",
  );
  assert.equal(
    unecaItems[0].sourcePublishedAt,
    "2026-07-15T21:00:00.000Z",
  );
  assert.equal(unecaItems[0].sourceEvidence.timestampField, "dc:date");
  assert.equal(unecaItems[0].sourceEvidence.supported, true);

  assert.equal(
    normalizeRssFeedItems(uneca, [{
      title: "UNECA media release",
      link: "https://www.uneca.org/stories/media-release",
      description:
        '<span property="dc:date" content="2026-07-16T00:00:00+03:00">16 July, 2026</span><p>Not a blog.</p>',
      pubDate: "2026-07-16T10:00:00.000Z",
    }]).length,
    0,
  );
  assert.equal(
    normalizeRssFeedItems(uneca, [{
      title: "[Blog] Missing source date",
      link: "https://www.uneca.org/stories/blog-missing-date",
      description: "<p>UNECA blog excerpt without an explicit source date.</p>",
      pubDate: "2026-07-16T10:00:00.000Z",
    }]).length,
    0,
  );
}

async function main(): Promise<void> {
  assertBlogRssFixtures();
  const originalFetch = globalThis.fetch;
  try {
    let failingArticleAttempts = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://r.jina.ai/")) {
        return new Response("Title: listing\nMarkdown Content:\n\nNo evidence.");
      }
      const body = JSON.parse(String(init?.body)) as { url: string };
      if (body.url === source.url) {
        return listing([
          "https://african.business/2026/07/trade/verified",
          "https://african.business/2026/07/trade/unavailable",
        ]);
      }
      if (body.url.endsWith("/verified")) return article(body.url);
      if (body.url.endsWith("/unavailable")) {
        failingArticleAttempts += 1;
        return new Response("upstream unavailable", { status: 503 });
      }
      throw new Error(`Unexpected request ${url} for ${body.url}`);
    };

    const adapter = createProductionIngestionAdapter({
      firecrawlApiKey: "fixture-key",
    });
    const partial = await adapter.collectIntelligence(
      source,
      new AbortController().signal,
    );
    assert.equal(partial.length, 1);
    assert.equal(partial[0].title, "Authoritative original title");
    assert.notEqual(partial[0].title, "Verified article 1");
    assert.equal(
      (partial[0].sourceEvidence as { supported: boolean }).supported,
      true,
    );
    assert.equal(failingArticleAttempts, 2);

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://r.jina.ai/")) {
        return new Response("Title: listing\nMarkdown Content:\n\nNo evidence.");
      }
      const body = JSON.parse(String(init?.body)) as { url: string };
      if (body.url === source.url) {
        return listing(["https://news.google.com/articles/not-authoritative"]);
      }
      throw new Error(`Unexpected original-page request for ${body.url}`);
    };
    await assert.rejects(
      () =>
        adapter.collectIntelligence(
          source,
          new AbortController().signal,
        ),
      /no authoritative original-page evidence/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(
    "Source adapter fixtures passed (RSS source normalization and original-page fail-closed behavior).",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
