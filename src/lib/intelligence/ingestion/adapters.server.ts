import OpenAI from "openai";
import Parser from "rss-parser";

import { AFRICAN_ISO3_CODES } from "@/lib/intelligence/trust";

import { fetchWithBoundedRetry, withBoundedRetry } from "./retry.server";
import {
  BLOG_EXTRACT_SCHEMA,
  INTELLIGENCE_EXTRACT_SCHEMA,
  sourceAllowsCanonicalUrl,
  type BlogSource,
  type IntelligenceSource,
} from "./sources";
import {
  selectCanonicalSourceUrl,
  selectExplicitPublicationTimestamp,
  selectSourceExcerpt,
  type SourceEvidence,
} from "./candidates";
import type {
  IngestionAdapter,
  IngestionLogger,
  RawCandidate,
} from "./types";

interface ProductionAdapterOptions {
  firecrawlApiKey?: string;
  foundryApiKey?: string;
  foundryEndpoint?: string;
  foundryModel?: string;
  logger?: IngestionLogger;
  deadlineAt?: number;
}

interface FeedCandidate extends RawCandidate {
  title?: string;
  summary?: string;
  url?: string;
  sourcePublishedAt?: string;
  sourceEvidence: SourceEvidence;
}

interface OriginalPageEvidence extends SourceEvidence {
  title: string;
  author: string;
}

const quietLogger: IngestionLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function arrayAt(value: unknown, key: "articles" | "posts"): RawCandidate[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (Array.isArray(direct)) return direct as RawCandidate[];
  for (const nestedKey of ["extract", "data"]) {
    const nested = record[nestedKey];
    if (typeof nested === "object" && nested !== null) {
      const items = arrayAt(nested, key);
      if (items.length > 0) return items;
    }
  }
  return [];
}

function requireItems(
  items: RawCandidate[],
  label: string,
): RawCandidate[] {
  if (items.length === 0) throw new Error(`${label} returned no candidates`);
  return items;
}

export function hasCompleteCandidateProvenance(
  candidate: RawCandidate,
): boolean {
  const url = selectCanonicalSourceUrl(candidate);
  const publishedAt = selectExplicitPublicationTimestamp(candidate);
  return Boolean(url && publishedAt);
}

export function requireCompleteCandidateProvenance(
  items: RawCandidate[],
  label: string,
): RawCandidate[] {
  const complete = requireItems(items, label);
  if (!complete.every(hasCompleteCandidateProvenance)) {
    throw new Error(
      `${label} returned incomplete URL or publication-time provenance`,
    );
  }
  return complete;
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Extractor did not return a JSON object");
    return JSON.parse(match[0]);
  }
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  const a = selectExplicitPublicationTimestamp({ sourcePublishedAt: left });
  const b = selectExplicitPublicationTimestamp({ sourcePublishedAt: right });
  return Boolean(a && b && a.value === b.value);
}

function candidateDisagreements(
  candidate: RawCandidate,
  evidence: SourceEvidence,
): string[] {
  const disagreements: string[] = [];
  const claimedUrl = selectCanonicalSourceUrl(candidate);
  if (
    claimedUrl &&
    evidence.canonicalUrl &&
    claimedUrl !== evidence.canonicalUrl
  ) {
    disagreements.push(
      `canonical_url:${claimedUrl}!=${evidence.canonicalUrl}`,
    );
  }
  const claimedTimestamp = selectExplicitPublicationTimestamp(candidate);
  if (
    claimedTimestamp &&
    evidence.sourcePublishedAt &&
    !sameTimestamp(claimedTimestamp.value, evidence.sourcePublishedAt)
  ) {
    disagreements.push(
      `publication_timestamp:${claimedTimestamp.value}!=${evidence.sourcePublishedAt}`,
    );
  }
  return disagreements.sort();
}

function normalizedMatchText(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    : "";
}

export function mergeFeedProvenance(
  candidates: RawCandidate[],
  feed: FeedCandidate[],
  source: IntelligenceSource | BlogSource,
): RawCandidate[] {
  const available = new Set(feed.map((_, index) => index));
  return candidates.map((candidate, index) => {
    const claimedUrl = selectCanonicalSourceUrl(candidate);
    const claimedTitle = normalizedMatchText(candidate.title);
    let feedIndex = feed.findIndex(
      (item, itemIndex) =>
        available.has(itemIndex) &&
        claimedUrl !== null &&
        claimedUrl === item.sourceEvidence.canonicalUrl,
    );
    if (feedIndex < 0 && claimedTitle) {
      feedIndex = feed.findIndex(
        (item, itemIndex) =>
          available.has(itemIndex) &&
          claimedTitle === normalizedMatchText(item.title),
      );
    }
    if (feedIndex < 0 && available.has(index)) feedIndex = index;
    if (feedIndex < 0) feedIndex = [...available][0] ?? -1;
    if (feedIndex >= 0) available.delete(feedIndex);
    const item = feed[feedIndex];
    if (!item) {
      return {
        ...candidate,
        modelCandidate: candidate,
        sourceEvidence: {
          origin: "rss",
          canonicalUrl: null,
          sourcePublishedAt: null,
          excerpt: "",
          timestampField: null,
          supported: false,
          disagreements: ["rss_item:unmatched"],
        } satisfies SourceEvidence,
      };
    }
    const disagreements = candidateDisagreements(
      candidate,
      item.sourceEvidence,
    );
    if (
      !item.sourceEvidence.canonicalUrl ||
      !sourceAllowsCanonicalUrl(source, item.sourceEvidence.canonicalUrl)
    ) {
      disagreements.push("publisher_host:not_authoritative");
      disagreements.sort();
    }
    return {
      ...candidate,
      modelCandidate: candidate,
      title: item.title || candidate.title,
      summary: item.summary,
      excerpt: item.summary,
      url: item.url,
      canonicalUrl: item.sourceEvidence.canonicalUrl,
      sourcePublishedAt: item.sourcePublishedAt,
      sourceEvidence: {
        ...item.sourceEvidence,
        supported: item.sourceEvidence.supported && disagreements.length === 0,
        disagreements,
      },
    };
  });
}

function recordOf(value: unknown): RawCandidate {
  return typeof value === "object" && value !== null
    ? (value as RawCandidate)
    : {};
}

function pageMetadataRecords(payload: unknown): RawCandidate[] {
  const root = recordOf(payload);
  const data = recordOf(root.data);
  const metadata = recordOf(data.metadata ?? root.metadata);
  const records = [metadata];
  for (const key of ["jsonLd", "jsonld", "json-ld", "schema"]) {
    const value = metadata[key];
    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value) as unknown;
      } catch {
        continue;
      }
    }
    if (Array.isArray(parsed)) {
      records.push(...parsed.map(recordOf));
    } else if (typeof parsed === "object" && parsed !== null) {
      records.push(recordOf(parsed));
    }
  }
  return records;
}

function pageMarkdown(payload: unknown): string {
  const root = recordOf(payload);
  const data = recordOf(root.data);
  const value = data.markdown ?? root.markdown;
  return typeof value === "string" ? value : "";
}

function textField(
  records: readonly RawCandidate[],
  fields: readonly string[],
): string {
  for (const field of fields) {
    for (const record of records) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (field === "author" && value && typeof value === "object") {
        const name = recordOf(value).name;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
    }
  }
  return "";
}

function markdownTitle(value: string): string {
  return value.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function firstSubstantiveParagraph(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((item) => {
      const trimmed = item.trim();
      return /^#+\s/.test(trimmed) ? "" : trimmed;
    })
    .find((item) => item.length >= 40)
    ?.slice(0, 2_000) ?? "";
}

export function extractFirecrawlPageEvidence(
  payload: unknown,
  fallbackUrl: string,
): OriginalPageEvidence {
  const metadata = pageMetadataRecords(payload);
  const markdown = pageMarkdown(payload);
  const timestamp = selectExplicitPublicationTimestamp(...metadata);
  const metadataCanonicalUrl = selectCanonicalSourceUrl(...metadata);
  return {
    origin: "firecrawl-page",
    canonicalUrl:
      metadataCanonicalUrl ??
      selectCanonicalSourceUrl({ url: fallbackUrl }),
    sourcePublishedAt: timestamp?.value ?? null,
    excerpt:
      selectSourceExcerpt(...metadata) ||
      firstSubstantiveParagraph(markdown),
    title:
      textField(metadata, ["headline", "title", "ogTitle", "name"]) ||
      markdownTitle(markdown),
    author: textField(metadata, ["author", "byline", "articleAuthor"]),
    timestampField: timestamp?.field ?? null,
    supported: false,
    disagreements: metadataCanonicalUrl
      ? []
      : ["canonical_url:missing_page_metadata"],
  };
}

export function extractJinaPageEvidence(
  content: string,
  fallbackUrl: string,
): OriginalPageEvidence {
  const header: RawCandidate = {};
  for (const line of content.split(/\r?\n/).slice(0, 30)) {
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    if (key === "url source" || key === "canonical url") {
      header.canonicalUrl = match[2].trim();
    } else if (
      key === "published time" ||
      key === "publication date" ||
      key === "date published"
    ) {
      header.datePublished = match[2].trim();
    } else if (key === "description") {
      header.description = match[2].trim();
    } else if (key === "title") {
      header.title = match[2].trim();
    } else if (key === "author" || key === "byline") {
      header.author = match[2].trim();
    }
  }
  const timestamp = selectExplicitPublicationTimestamp(header);
  const markdown = content.split(/Markdown Content:\s*/i)[1] ?? content;
  const metadataCanonicalUrl = selectCanonicalSourceUrl(header);
  return {
    origin: "jina-page",
    canonicalUrl:
      metadataCanonicalUrl ??
      selectCanonicalSourceUrl({ url: fallbackUrl }),
    sourcePublishedAt: timestamp?.value ?? null,
    excerpt:
      selectSourceExcerpt(header) || firstSubstantiveParagraph(markdown),
    title:
      textField([header], ["headline", "title", "name"]) ||
      markdownTitle(markdown),
    author: textField([header], ["author", "byline"]),
    timestampField: timestamp?.field ?? null,
    supported: false,
    disagreements: metadataCanonicalUrl
      ? []
      : ["canonical_url:missing_page_metadata"],
  };
}

function mergePageEvidence(
  candidates: RawCandidate[],
  pageEvidence: OriginalPageEvidence,
  source: IntelligenceSource | BlogSource,
  requireAuthor: boolean,
): RawCandidate[] {
  return candidates.map((candidate) => {
    const disagreements = [
      ...pageEvidence.disagreements,
      ...candidateDisagreements(candidate, pageEvidence),
    ].sort();
    const samePage =
      selectCanonicalSourceUrl(candidate) === pageEvidence.canonicalUrl;
    const authoritativePage = Boolean(
      pageEvidence.canonicalUrl &&
        sourceAllowsCanonicalUrl(source, pageEvidence.canonicalUrl),
    );
    if (!authoritativePage) {
      disagreements.push("publisher_host:not_authoritative");
      disagreements.sort();
    }
    const supported =
      samePage &&
      authoritativePage &&
      disagreements.length === 0 &&
      Boolean(
        pageEvidence.canonicalUrl &&
          pageEvidence.sourcePublishedAt &&
          pageEvidence.excerpt &&
          pageEvidence.title &&
          (!requireAuthor || pageEvidence.author),
      );
    return {
      ...candidate,
      modelCandidate: candidate,
      ...(supported
        ? {
            title: pageEvidence.title,
            ...(pageEvidence.author ? { author: pageEvidence.author } : {}),
            summary: pageEvidence.excerpt,
            excerpt: pageEvidence.excerpt,
            url: pageEvidence.canonicalUrl,
            canonicalUrl: pageEvidence.canonicalUrl,
            sourcePublishedAt: pageEvidence.sourcePublishedAt,
          }
        : {}),
      sourceEvidence: {
        ...pageEvidence,
        supported,
        disagreements,
      },
    };
  });
}

export function createProductionIngestionAdapter(
  options: ProductionAdapterOptions,
): IngestionAdapter {
  const logger = options.logger ?? quietLogger;
  const parser = new Parser();
  const foundry =
    options.foundryApiKey && options.foundryEndpoint
      ? new OpenAI({
          apiKey: options.foundryApiKey,
          baseURL: options.foundryEndpoint,
        })
      : null;

  async function rss(
    sourceName: string,
    rssUrl: string,
    signal: AbortSignal,
  ): Promise<FeedCandidate[]> {
    const text = await fetchWithBoundedRetry(
      `RSS ${sourceName}`,
      rssUrl,
      { headers: { "User-Agent": "AXIS-Africa-Ingestion/1.0" } },
      async (response, attemptSignal) => {
        const body = await response.text();
        attemptSignal.throwIfAborted();
        return body;
      },
      {
        attempts: 2,
        timeoutMs: 20_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    signal.throwIfAborted();
    const feed = await parser.parseString(text);
    signal.throwIfAborted();
    return feed.items.slice(0, 3).map((item) => {
      const raw = item as RawCandidate;
      const timestamp = selectExplicitPublicationTimestamp(raw);
      const canonicalUrl = selectCanonicalSourceUrl(raw);
      const excerpt = selectSourceExcerpt(raw);
      const evidence: SourceEvidence = {
        origin: "rss",
        canonicalUrl,
        sourcePublishedAt: timestamp?.value ?? null,
        excerpt,
        timestampField: timestamp?.field ?? null,
        supported: Boolean(canonicalUrl && timestamp && excerpt),
        disagreements: [],
      };
      return {
        title: item.title,
        summary: excerpt,
        excerpt,
        url: canonicalUrl ?? undefined,
        sourcePublishedAt: timestamp?.value,
        sourceEvidence: evidence,
      };
    });
  }

  async function phi(
    label: string,
    prompt: string,
    schema: unknown,
    signal: AbortSignal,
    content: string,
  ): Promise<unknown> {
    if (!foundry || !options.foundryModel) {
      throw new Error("Foundry is not configured");
    }
    const extractionPrompt =
      `Return one valid JSON object matching this schema: ${JSON.stringify(schema)}.\n` +
      `Instruction: ${prompt}\nText:\n${content.slice(0, 30_000)}`;
    return withBoundedRetry(
      `Foundry ${label}`,
      async (_attempt, attemptTimeoutMs, attemptSignal) => {
        const response = await foundry.chat.completions.create(
          {
            model: options.foundryModel!,
            messages: [
              { role: "system", content: "You extract data into JSON format." },
              { role: "user", content: extractionPrompt },
            ],
            response_format: { type: "json_object" },
          },
          {
            timeout: Math.min(45_000, attemptTimeoutMs),
            signal: attemptSignal,
          },
        );
        const value = response.choices[0]?.message.content || "{}";
        return parseJsonObject(value);
      },
      {
        attempts: 2,
        timeoutMs: 50_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
  }

  async function jina(
    label: string,
    url: string,
    signal: AbortSignal,
  ): Promise<{ content: string; evidence: OriginalPageEvidence }> {
    const content = await fetchWithBoundedRetry(
      `Jina ${label}`,
      `https://r.jina.ai/${url}`,
      { headers: { "X-No-Cache": "true" } },
      async (response, attemptSignal) => {
        const body = await response.text();
        attemptSignal.throwIfAborted();
        return body;
      },
      {
        attempts: 2,
        timeoutMs: 30_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    signal.throwIfAborted();
    return {
      content,
      evidence: extractJinaPageEvidence(content, url),
    };
  }

  async function firecrawlPageEvidence(
    label: string,
    url: string,
    signal: AbortSignal,
  ): Promise<OriginalPageEvidence> {
    if (!options.firecrawlApiKey) {
      throw new Error("Firecrawl is not configured");
    }
    const payload = await fetchWithBoundedRetry(
      `Firecrawl ${label}`,
      "https://api.firecrawl.dev/v1/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      },
      async (response, attemptSignal) => {
        const body: unknown = await response.json();
        attemptSignal.throwIfAborted();
        return body;
      },
      {
        attempts: 2,
        timeoutMs: 45_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    signal.throwIfAborted();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      payload.success === false
    ) {
      throw new Error("Firecrawl returned success=false");
    }
    return extractFirecrawlPageEvidence(payload, url);
  }

  async function verifyOriginalPages(
    label: string,
    source: IntelligenceSource | BlogSource,
    candidates: RawCandidate[],
    loadEvidence: (url: string) => Promise<OriginalPageEvidence>,
    requireAuthor = false,
  ): Promise<RawCandidate[]> {
    const settled = await Promise.allSettled(
      candidates.slice(0, 3).map(async (candidate) => {
        const canonicalUrl = selectCanonicalSourceUrl(candidate);
        if (!canonicalUrl || !sourceAllowsCanonicalUrl(source, canonicalUrl)) {
          return mergePageEvidence(
            [candidate],
            {
              origin: "firecrawl-page",
              canonicalUrl,
              sourcePublishedAt: null,
              excerpt: "",
              title: "",
              author: "",
              timestampField: null,
              supported: false,
              disagreements: ["publisher_host:not_authoritative"],
            },
            source,
            requireAuthor,
          )[0];
        }
        return mergePageEvidence(
          [candidate],
          await loadEvidence(canonicalUrl),
          source,
          requireAuthor,
        )[0];
      }),
    );
    const verified = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const supported = verified.filter((candidate) =>
      (candidate.sourceEvidence as SourceEvidence | undefined)?.supported === true
    );
    if (supported.length === 0) {
      const failures = settled.flatMap((result) =>
        result.status === "rejected"
          ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
          : []
      );
      throw new Error(
        `${label} returned no authoritative original-page evidence${
          failures.length ? ` (${failures.join(" | ")})` : ""
        }`,
      );
    }
    return verified;
  }

  async function firecrawlExtract(
    label: string,
    url: string,
    source: IntelligenceSource | BlogSource,
    key: "articles" | "posts",
    prompt: string,
    schema: unknown,
    signal: AbortSignal,
  ): Promise<RawCandidate[]> {
    if (!options.firecrawlApiKey) {
      throw new Error("Firecrawl is not configured");
    }
    const payload = await fetchWithBoundedRetry(
      `Firecrawl ${label}`,
      "https://api.firecrawl.dev/v1/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["extract", "markdown"],
          extract: { prompt, schema: schema as never },
        }),
      },
      async (response, attemptSignal) => {
        const body: unknown = await response.json();
        attemptSignal.throwIfAborted();
        return body;
      },
      {
        attempts: 2,
        timeoutMs: 45_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    signal.throwIfAborted();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      payload.success === false
    ) {
      throw new Error("Firecrawl returned success=false");
    }
    const candidates = requireItems(
      arrayAt(payload, key),
      `Firecrawl ${label} listing`,
    ).slice(0, 3);
    return verifyOriginalPages(
      `Firecrawl ${label}`,
      source,
      candidates,
      (canonicalUrl) =>
        firecrawlPageEvidence(`${label} article`, canonicalUrl, signal),
      key === "posts",
    );
  }

  async function fallback<T>(
    label: string,
    attempts: Array<{ name: string; run: () => Promise<T> }>,
    signal: AbortSignal,
  ): Promise<T> {
    const failures: string[] = [];
    for (const attempt of attempts) {
      signal.throwIfAborted();
      if (
        options.deadlineAt !== undefined &&
        Date.now() >= options.deadlineAt
      ) {
        throw new Error(`${label} stopped because the run deadline was exhausted`);
      }
      try {
        const value = await attempt.run();
        logger.info(`${label} used ${attempt.name}`);
        return value;
      } catch (error) {
        signal.throwIfAborted();
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${attempt.name}: ${message}`);
        logger.warn(`${label} ${attempt.name} failed`, message);
      }
    }
    throw new Error(`${label} exhausted fallbacks (${failures.join(" | ")})`);
  }

  return {
    async collectIntelligence(source, signal) {
      const isoInstruction =
        `Use exactly one African ISO-3 code: ${AFRICAN_ISO3_CODES.join(", ")}. ` +
        "Do not use AFR or a non-African code.";
      return fallback(
        source.name,
        [
          ...(source.rssUrl
            ? [
                {
                  name: "RSS + Foundry",
                  run: async () => {
                    const feed = await rss(source.name, source.rssUrl!, signal);
                    const result = await phi(
                      source.name,
                      `Classify each news item. Treat the supplied source text as evidence and do not invent URLs, timestamps, excerpts, actors, or categories. ${isoInstruction}`,
                      INTELLIGENCE_EXTRACT_SCHEMA,
                      signal,
                      feed
                        .map(
                          (item) =>
                            `TITLE: ${item.title}\nURL: ${item.url ?? ""}\nPUBLISHED: ${item.sourcePublishedAt ?? ""}\nSOURCE EXCERPT: ${item.summary}`,
                        )
                        .join("\n---\n"),
                    );
                    return requireItems(
                      mergeFeedProvenance(
                        arrayAt(result, "articles"),
                        feed,
                        source,
                      ),
                      `RSS + Foundry ${source.name}`,
                    );
                  },
                },
              ]
            : []),
          {
            name: "Firecrawl",
            run: () =>
             firecrawlExtract(
               source.name,
               source.url,
               source,
               "articles",
               `Extract the top 3 current articles with each original article URL and publication time as sourcePublishedAt in ISO-8601 format. ${isoInstruction}`,
               INTELLIGENCE_EXTRACT_SCHEMA,
               signal,
             ),
          },
          {
            name: "Jina + Foundry",
            run: async () => {
              const page = await jina(source.name, source.url, signal);
              const result = await phi(
                source.name,
                `Extract candidate articles only when supported by the supplied page. Do not invent URLs, timestamps, excerpts, actors, or categories. ${isoInstruction}`,
                INTELLIGENCE_EXTRACT_SCHEMA,
                signal,
                page.content,
              );
              return verifyOriginalPages(
                `Jina + Foundry ${source.name}`,
                source,
                requireItems(
                  arrayAt(result, "articles"),
                  `Jina + Foundry ${source.name} listing`,
                ),
                async (canonicalUrl) =>
                  (await jina(
                    `${source.name} article`,
                    canonicalUrl,
                    signal,
                  )).evidence,
                false,
              );
            },
          },
        ],
        signal,
      );
    },

    async collectBlog(source, signal) {
      return fallback(source.name, [
        ...(source.rssUrl
          ? [{
              name: "RSS + Foundry",
              run: async () => {
                const feed = await rss(source.name, source.rssUrl!, signal);
            const result = await phi(
              source.name,
              "Classify each blog post from the supplied evidence. Do not invent titles, excerpts, authors, tags, URLs, or timestamps.",
              BLOG_EXTRACT_SCHEMA,
              signal,
              feed
                .map(
                  (item) =>
                    `TITLE: ${item.title}\nURL: ${item.url ?? ""}\nPUBLISHED: ${item.sourcePublishedAt ?? ""}\nSOURCE EXCERPT: ${item.summary}`,
                )
                .join("\n---\n"),
            );
            return requireItems(
              mergeFeedProvenance(arrayAt(result, "posts"), feed, source),
              `RSS + Foundry ${source.name}`,
            );
              },
            }]
          : []),
        {
          name: "Firecrawl",
          run: () =>
            firecrawlExtract(
              source.name,
              source.url,
              source,
              "posts",
              "Extract the top 3 current African development or geopolitics blog posts with each original post URL and publication time as sourcePublishedAt in ISO-8601 format.",
              BLOG_EXTRACT_SCHEMA,
              signal,
            ),
        },
        {
          name: "Jina + Foundry",
          run: async () => {
            const page = await jina(source.name, source.url, signal);
            const result = await phi(
              source.name,
              "Extract candidate posts only when supported by the supplied page. Do not invent titles, excerpts, authors, tags, URLs, or timestamps.",
              BLOG_EXTRACT_SCHEMA,
              signal,
              page.content,
            );
            return verifyOriginalPages(
              `Jina + Foundry ${source.name}`,
              source,
              requireItems(
                arrayAt(result, "posts"),
                `Jina + Foundry ${source.name} listing`,
              ),
              async (canonicalUrl) =>
                (await jina(
                  `${source.name} post`,
                  canonicalUrl,
                  signal,
                )).evidence,
              true,
            );
          },
        },
      ], signal);
    },
  };
}
