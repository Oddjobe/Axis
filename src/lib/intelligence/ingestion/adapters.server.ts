import OpenAI from "openai";
import Parser from "rss-parser";

import { AFRICAN_ISO3_CODES } from "@/lib/intelligence/trust";

import { fetchWithBoundedRetry, withBoundedRetry } from "./retry.server";
import {
  BLOG_EXTRACT_SCHEMA,
  INTELLIGENCE_EXTRACT_SCHEMA,
} from "./sources";
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
  const url = candidate.url;
  const publishedAt =
    candidate.sourcePublishedAt ?? candidate.isoDate ?? candidate.pubDate;
  if (typeof url !== "string" || !url.trim()) return false;
  if (typeof publishedAt !== "string" || !publishedAt.trim()) return false;
  return Number.isFinite(Date.parse(publishedAt));
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

function mergeFeedProvenance(
  candidates: RawCandidate[],
  feed: FeedCandidate[],
  fallbackUrl: string,
): RawCandidate[] {
  return candidates.map((candidate, index) => ({
    ...candidate,
    url: candidate.url || feed[index]?.url || fallbackUrl,
    sourcePublishedAt:
      candidate.sourcePublishedAt || feed[index]?.sourcePublishedAt,
  }));
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
    const response = await fetchWithBoundedRetry(
      `RSS ${sourceName}`,
      rssUrl,
      { headers: { "User-Agent": "AXIS-Africa-Ingestion/1.0" } },
      {
        attempts: 2,
        timeoutMs: 20_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    const text = await response.text();
    signal.throwIfAborted();
    const feed = await parser.parseString(text);
    signal.throwIfAborted();
    return feed.items.slice(0, 3).map((item) => ({
      title: item.title,
      summary: String(
        item.contentSnippet || item.summary || item.content || "",
      ).slice(0, 300),
      url: item.link,
      sourcePublishedAt: item.isoDate || item.pubDate,
    }));
  }

  async function phi(
    label: string,
    url: string,
    prompt: string,
    schema: unknown,
    signal: AbortSignal,
    content?: string,
  ): Promise<unknown> {
    if (!foundry || !options.foundryModel) {
      throw new Error("Foundry is not configured");
    }
    let input = content;
    if (!input) {
      const response = await fetchWithBoundedRetry(
        `Jina ${label}`,
        `https://r.jina.ai/${url}`,
        { headers: { "X-No-Cache": "true" } },
        {
          attempts: 2,
          timeoutMs: 30_000,
          deadlineAt: options.deadlineAt,
          signal,
        },
      );
      input = await response.text();
      signal.throwIfAborted();
    }
    const extractionPrompt =
      `Return one valid JSON object matching this schema: ${JSON.stringify(schema)}.\n` +
      `Instruction: ${prompt}\nText:\n${input.slice(0, 30_000)}`;
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

  async function firecrawlExtract(
    label: string,
    url: string,
    key: "articles" | "posts",
    prompt: string,
    schema: unknown,
    signal: AbortSignal,
  ): Promise<RawCandidate[]> {
    if (!options.firecrawlApiKey) {
      throw new Error("Firecrawl is not configured");
    }
    const response = await fetchWithBoundedRetry(
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
          formats: ["extract"],
          extract: { prompt, schema: schema as never },
        }),
      },
      {
        attempts: 2,
        timeoutMs: 45_000,
        deadlineAt: options.deadlineAt,
        signal,
      },
    );
    const payload = await response.json();
    signal.throwIfAborted();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      payload.success === false
    ) {
      throw new Error("Firecrawl returned success=false");
    }
    return requireCompleteCandidateProvenance(
      arrayAt(payload, key),
      `Firecrawl ${label}`,
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
          {
            name: "Firecrawl",
            run: () =>
              firecrawlExtract(
                source.name,
                source.url,
                "articles",
                `Extract the top 3 current articles with each original article URL and publication time as sourcePublishedAt in ISO-8601 format. ${isoInstruction}`,
                INTELLIGENCE_EXTRACT_SCHEMA,
                signal,
              ),
          },
          ...(source.rssUrl
            ? [
                {
                  name: "RSS + Foundry",
                  run: async () => {
                    const feed = await rss(source.name, source.rssUrl!, signal);
                    const result = await phi(
                      source.name,
                      source.url,
                      `Classify each news item. ${isoInstruction}`,
                      INTELLIGENCE_EXTRACT_SCHEMA,
                      signal,
                      feed
                        .map(
                          (item) =>
                            `TITLE: ${item.title}\nSUMMARY: ${item.summary}`,
                        )
                        .join("\n---\n"),
                    );
                    return requireCompleteCandidateProvenance(
                      mergeFeedProvenance(
                        arrayAt(result, "articles"),
                        feed,
                        source.url,
                      ),
                      `RSS + Foundry ${source.name}`,
                    );
                  },
                },
              ]
            : []),
          {
            name: "Jina + Foundry",
            run: async () =>
              requireCompleteCandidateProvenance(
                arrayAt(
                  await phi(
                    source.name,
                    source.url,
                    `Extract the top 3 current articles with each original article URL and publication time as sourcePublishedAt in ISO-8601 format. ${isoInstruction}`,
                    INTELLIGENCE_EXTRACT_SCHEMA,
                    signal,
                  ),
                  "articles",
                ),
                `Jina + Foundry ${source.name}`,
              ),
          },
        ],
        signal,
      );
    },

    async collectBlog(source, signal) {
      return fallback(source.name, [
        {
          name: "Firecrawl",
          run: () =>
            firecrawlExtract(
              source.name,
              source.url,
              "posts",
              "Extract the top 3 current African development or geopolitics blog posts with each original post URL and publication time as sourcePublishedAt in ISO-8601 format.",
              BLOG_EXTRACT_SCHEMA,
              signal,
            ),
        },
        {
          name: "RSS + Foundry",
          run: async () => {
            const feed = await rss(source.name, source.rssUrl, signal);
            const result = await phi(
              source.name,
              source.url,
              "Classify each blog post with title, summary, author, tag, original URL, and publication time as sourcePublishedAt in ISO-8601 format.",
              BLOG_EXTRACT_SCHEMA,
              signal,
              feed
                .map(
                  (item) => `TITLE: ${item.title}\nSUMMARY: ${item.summary}`,
                )
                .join("\n---\n"),
            );
            return requireCompleteCandidateProvenance(
              mergeFeedProvenance(
                arrayAt(result, "posts"),
                feed,
                source.url,
              ),
              `RSS + Foundry ${source.name}`,
            );
          },
        },
        {
          name: "Jina + Foundry",
          run: async () =>
            requireCompleteCandidateProvenance(
              arrayAt(
                await phi(
                  source.name,
                  source.url,
                  "Extract the top 3 current African development or geopolitics blog posts with each original post URL and publication time as sourcePublishedAt in ISO-8601 format.",
                  BLOG_EXTRACT_SCHEMA,
                  signal,
                ),
                "posts",
              ),
              `Jina + Foundry ${source.name}`,
            ),
        },
      ], signal);
    },
  };
}
