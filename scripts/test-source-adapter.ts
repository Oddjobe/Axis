import assert from "node:assert/strict";

import {
  articleAuthor,
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
  const afdbMissingDate = normalizeRssFeedItems(afdb, [{
      title: "AfDB post without source date",
      link: "https://blogs.afdb.org/missing-date",
      description: "An AfDB source excerpt cannot be published without a source date.",
    }]);
  assert.equal(afdbMissingDate.length, 1);
  assert.equal(afdbMissingDate[0].sourceEvidence.supported, false);
  assert.equal(
    normalizeRssFeedItems(afdb, [{
      title: "AfDB post from an unapproved host",
      link: "https://example.invalid/afdb-post",
      description: "An AfDB source excerpt cannot be accepted from another host.",
      pubDate: "2026-07-17T10:00:00.000Z",
    }])[0].sourceEvidence.supported,
    false,
  );

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

async function assertDirectBlogRssRetrieval(): Promise<void> {
  const afdb = blogSource("African Development Bank Opinion");
  const uneca = blogSource("UNECA Blogs");
  const originalFetch = globalThis.fetch;
  let afdbAttempts = 0;
  const observedHeaders: Headers[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === afdb.rssUrl) {
        afdbAttempts += 1;
        observedHeaders.push(new Headers(init?.headers));
        if (afdbAttempts === 1) {
          return new Response("blocked", { status: 403, statusText: "Forbidden" });
        }
        return new Response(
          `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>
            <title>AfDB direct RSS post</title>
            <link>https://blogs.afdb.org/direct-rss-post</link>
            <description>An African Development Bank source excerpt with enough detail for deterministic validation.</description>
            <pubDate>Thu, 17 Jul 2026 10:00:00 GMT</pubDate>
            <dc:creator>AfDB Author</dc:creator>
            <category>Development finance</category>
          </item></channel></rss>`,
          { headers: { "Content-Type": "application/rss+xml" } },
        );
      }
      if (url === uneca.rssUrl) {
        return new Response(
          `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>
            <title>[Blog] UNECA direct RSS post</title>
            <link>https://www.uneca.org/stories/direct-rss-post</link>
            <description><![CDATA[<span property="dc:date" content="2026-07-16T00:00:00+03:00">16 July, 2026</span><p>UNECA source excerpt with enough detail for deterministic validation.</p>]]></description>
            <pubDate>Thu, 16 Jul 2026 10:00:00 GMT</pubDate>
            <dc:creator>UNECA Author</dc:creator>
            <category>Regional integration</category>
          </item></channel></rss>`,
          { headers: { "Content-Type": "application/rss+xml" } },
        );
      }
      throw new Error(`Unexpected request ${url}`);
    };

    const adapter = createProductionIngestionAdapter({});
    const afdbPosts = await adapter.collectBlog(
      afdb,
      new AbortController().signal,
    );
    assert.equal(afdbAttempts, 2);
    assert.equal(
      observedHeaders[0].get("accept"),
      "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    );
    assert.equal(observedHeaders[0].get("accept-language"), "en-US,en;q=0.9");
    assert.equal(observedHeaders[0].get("cache-control"), "no-cache");
    assert.equal(observedHeaders[0].get("referer"), afdb.url);
    assert.match(observedHeaders[0].get("user-agent") ?? "", /^AXIS-Africa-Ingestion\//);
    assert.equal(afdbPosts.length, 1);
    assert.equal(afdbPosts[0].author, "AfDB Author");
    assert.equal(afdbPosts[0].tag, "Development finance");
    assert.equal(
      (afdbPosts[0].sourceEvidence as { supported: boolean }).supported,
      true,
    );

    const unecaPosts = await adapter.collectBlog(
      uneca,
      new AbortController().signal,
    );
    assert.equal(unecaPosts.length, 1);
    assert.equal(unecaPosts[0].author, "UNECA Author");
    assert.equal(unecaPosts[0].tag, "Regional integration");
    assert.equal(
      (unecaPosts[0].sourceEvidence as { timestampField: string }).timestampField,
      "dc:date",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  assertBlogRssFixtures();
  await assertDirectBlogRssRetrieval();
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

  await assertFirecrawlFeedRecovery();
  assertArticleAuthorExtraction();
  await assertDefaultTagFallback();

  console.log(
    "Source adapter fixtures passed (direct RSS recovery, Firecrawl feed recovery, article bylines, default tag, and original-page fail-closed behavior).",
  );
}

/**
 * Several publishers serve their feed to browsers but return HTTP 403 to CI.
 * The feed must then be recovered through Firecrawl without changing provenance.
 */
async function assertFirecrawlFeedRecovery(): Promise<void> {
  const afdb = blogSource("African Development Bank Opinion");
  const originalFetch = globalThis.fetch;
  let firecrawlCalls = 0;
  const feed =
    `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>` +
    `<title>AfDB recovered post</title>` +
    `<link>https://blogs.afdb.org/recovered-post</link>` +
    `<description>An African Development Bank source excerpt with enough detail for deterministic validation.</description>` +
    `<pubDate>Wed, 29 Jul 2026 12:58:05 GMT</pubDate>` +
    `<dc:creator>AfDB Author</dc:creator><category>Development finance</category>` +
    `</item></channel></rss>`;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === afdb.rssUrl) {
        return new Response("blocked", { status: 403, statusText: "Forbidden" });
      }
      if (url.startsWith("https://api.firecrawl.dev/")) {
        firecrawlCalls += 1;
        assert.match(url, /\/v2\/scrape$/);
        return Response.json({ success: true, data: { rawHtml: feed } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    };
    const adapter = createProductionIngestionAdapter({
      firecrawlApiKey: "fixture-key",
      deadlineAt: Date.now() + 60_000,
    });
    const candidates = await adapter.collectBlog(
      afdb,
      new AbortController().signal,
    );
    assert.equal(firecrawlCalls > 0, true, "the blocked feed must be retried through Firecrawl");
    assert.equal(candidates.length, 1);
    const evidence = candidates[0].sourceEvidence as {
      canonicalUrl: string | null;
      sourcePublishedAt: string | null;
    };
    // Provenance still comes from the feed document, not from the transport.
    assert.equal(evidence.canonicalUrl, "https://blogs.afdb.org/recovered-post");
    assert.equal(evidence.sourcePublishedAt, "2026-07-29T12:58:05.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Without Firecrawl configured, a blocked feed still fails closed.
  const offline = createProductionIngestionAdapter({ deadlineAt: Date.now() + 60_000 });
  const blockedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("blocked", { status: 403, statusText: "Forbidden" });
    await assert.rejects(
      () => offline.collectBlog(afdb, new AbortController().signal),
      /exhausted fallbacks/,
    );
  } finally {
    globalThis.fetch = blockedFetch;
  }
}

function assertArticleAuthorExtraction(): void {
  // "By" followed by a profile link on a later line (ISS Africa Today).
  assert.equal(
    articleAuthor(
      "Published on 04 August 2026 in\n[ISS Today](https://issafrica.org/iss-today)\n\nBy\n\n[Ottilia Anna Maunganidze](https://issafrica.org/author/ottilia-anna-maunganidze)",
    ),
    "Ottilia Anna Maunganidze",
  );
  // Contributor links with no "By" label at all (World Bank Blogs).
  assert.equal(
    articleAuthor(
      "# Five insights\n\n- [Andrew Dabalen](https://blogs.worldbank.org/en/team/a/andrew-dabalen)\n- [Thomas Melonio](https://blogs.worldbank.org/en/team/t/thomas-melonio)\n\nJuly 01, 2026",
    ),
    "Andrew Dabalen",
  );
  assert.equal(articleAuthor("By Jane Doe wrote this"), "Jane Doe");
  // Ordinary links must never be mistaken for a byline.
  assert.equal(
    articleAuthor("Read [the report](https://example.test/reports/2026) today."),
    "",
  );
}

/**
 * `tag` is an AXIS display facet with a two-character minimum. Sources that
 * publish no category fall back to the tag declared in the registry.
 */
async function assertDefaultTagFallback(): Promise<void> {
  const uneca = blogSource("UNECA Blogs");
  assert.equal(uneca.defaultTag, "development");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === uneca.rssUrl) {
        return new Response(
          `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>` +
            `<title>[Blog] UNECA untagged post</title>` +
            `<link>https://www.uneca.org/stories/untagged-post</link>` +
            `<description><![CDATA[<span property="dc:date" content="2026-07-30T00:00:00+03:00">30 July, 2026</span><p>UNECA source excerpt with enough detail for deterministic validation.</p>]]></description>` +
            `<pubDate>Thu, 30 Jul 2026 10:00:00 GMT</pubDate><dc:creator>UNECA Author</dc:creator>` +
            `</item></channel></rss>`,
          { headers: { "Content-Type": "application/rss+xml" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    };
    const adapter = createProductionIngestionAdapter({
      deadlineAt: Date.now() + 60_000,
    });
    const candidates = await adapter.collectBlog(
      uneca,
      new AbortController().signal,
    );
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].tag, "development");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
