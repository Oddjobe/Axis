import {
  COMMODITY_EXTRACT_SCHEMA,
  ECB_DAILY_FX_URL,
  type CommoditySource,
} from "./commodity-sources";
import { withBoundedRetry } from "./retry.server";

export type RawCommodityCandidate = Record<string, unknown>;

export interface CommodityAdapter {
  collectCommodity(
    source: CommoditySource,
    signal: AbortSignal,
  ): Promise<RawCommodityCandidate[]>;
}

export interface CommodityFirecrawlAdapterOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  deadlineAt?: number;
}

export interface EcbDailyFxEvidence {
  date: string;
  usdPerEur: number;
  cnyPerEur: number;
  sourceUrl: typeof ECB_DAILY_FX_URL;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z][\w:-]*)\s*=\s*(['"])(.*?)\2/g)) {
    result[match[1]] = match[3];
  }
  return result;
}

export function parseEcbDailyReferenceRates(xml: string): EcbDailyFxEvidence {
  const cubes = [...xml.matchAll(/<Cube\b[^>]*>/g)].map((match) =>
    attributes(match[0]),
  );
  const dates = cubes
    .map((cube) => cube.time)
    .filter((value): value is string => Boolean(value));
  const usdRates = cubes
    .filter((cube) => cube.currency === "USD")
    .map((cube) => Number(cube.rate));
  const cnyRates = cubes
    .filter((cube) => cube.currency === "CNY")
    .map((cube) => Number(cube.rate));
  if (
    dates.length !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dates[0]) ||
    usdRates.length !== 1 ||
    cnyRates.length !== 1 ||
    !Number.isFinite(usdRates[0]) ||
    !Number.isFinite(cnyRates[0]) ||
    usdRates[0] <= 0 ||
    cnyRates[0] <= 0
  ) {
    throw new Error("ECB daily reference rates are missing a valid date, USD, or CNY rate");
  }
  return {
    date: dates[0],
    usdPerEur: usdRates[0],
    cnyPerEur: cnyRates[0],
    sourceUrl: ECB_DAILY_FX_URL,
  };
}

function recordsAt(value: unknown): RawCommodityCandidate[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.quotes)) {
    return record.quotes.filter(
      (item): item is RawCommodityCandidate =>
        typeof item === "object" && item !== null,
    );
  }
  if (typeof record.quote === "object" && record.quote !== null) {
    return [record.quote as RawCommodityCandidate];
  }
  for (const key of ["extract", "data"]) {
    const nested = recordsAt(record[key]);
    if (nested.length > 0) return nested;
  }
  return [];
}

function renderedEvidenceAt(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const record = value as Record<string, unknown>;
  const evidence: string[] = [];
  const append = (candidate: unknown) => {
    if (typeof candidate === "string") evidence.push(candidate);
    if (typeof candidate === "number" || typeof candidate === "boolean") {
      evidence.push(String(candidate));
    }
  };
  append(record.markdown);
  append(record.metadata);
  if (record.metadata && typeof record.metadata === "object") {
    for (const value of Object.values(record.metadata as Record<string, unknown>)) {
      append(value);
    }
  }
  if (record.data && typeof record.data === "object") {
    const nested = renderedEvidenceAt(record.data);
    if (nested) evidence.push(nested);
  }
  return evidence.join("\n");
}

function recordAt(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function pageMetadataAt(payload: unknown): Record<string, unknown> {
  const root = recordAt(payload);
  const data = recordAt(root.data);
  return recordAt(data.metadata ?? root.metadata);
}

function pageMarkdownAt(payload: unknown): string {
  const root = recordAt(payload);
  const data = recordAt(root.data);
  const markdown = data.markdown ?? root.markdown;
  return typeof markdown === "string" ? markdown : "";
}

function finalCanonicalUrlAt(payload: unknown): string | null {
  const metadata = pageMetadataAt(payload);
  for (const field of [
    "canonicalUrl",
    "canonicalURL",
    "sourceURL",
    "sourceUrl",
    "url",
  ]) {
    const value = metadata[field];
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      return new URL(value).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function canonicalUrlIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol.toLowerCase()}//${hostname}${pathname}`;
  } catch {
    return null;
  }
}

interface VisibleQuote {
  price: number;
  unit: "T" | "OZ";
  currency: "CNY" | "USD";
  index: number;
  text: string;
}

interface ExplicitDate {
  index: number;
  sourcePublishedAt: string;
  timestamp: number;
}

function explicitDates(text: string): ExplicitDate[] {
  const dates: ExplicitDate[] = [];
  const pattern = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  for (const match of text.matchAll(pattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      dates.push({
        index: match.index ?? 0,
        sourcePublishedAt: `${match[1]}-${match[2]}-${match[3]}`,
        timestamp,
      });
    }
  }
  return dates;
}

function sourceQuote(
  text: string,
  patterns: readonly RegExp[],
  unit: VisibleQuote["unit"],
  currency: VisibleQuote["currency"],
): VisibleQuote[] {
  const quotes: VisibleQuote[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const price = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(price) || price <= 0) continue;
      quotes.push({
        price,
        unit,
        currency,
        index: match.index ?? 0,
        text: match[0],
      });
    }
  }
  return quotes;
}

function closestVisibleQuote(
  date: ExplicitDate,
  quotes: readonly VisibleQuote[],
): VisibleQuote | null {
  const candidates = quotes
    .map((quote) => ({ quote, distance: Math.abs(quote.index - date.index) }))
    .filter(({ distance }) => distance <= 700)
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.quote ?? null;
}

function visibleExcerpt(
  text: string,
  date: ExplicitDate,
  quote: VisibleQuote,
): string {
  const start = Math.max(0, Math.min(date.index, quote.index) - 120);
  const end = Math.min(
    text.length,
    Math.max(date.index, quote.index) + quote.text.length + 180,
  );
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function isHistoricalQuote(
  text: string,
  date: ExplicitDate,
  quote: VisibleQuote,
): boolean {
  const start = Math.max(0, Math.min(date.index, quote.index) - 32);
  const end = Math.min(
    text.length,
    Math.max(date.index, quote.index) + quote.text.length + 32,
  );
  return /\b(?:historical|history|archive|previous|past)\b/i.test(
    text.slice(start, end),
  );
}

function newestDatedVisibleQuote(
  text: string,
  quotes: readonly VisibleQuote[],
): { date: ExplicitDate; quote: VisibleQuote; excerpt: string } | null {
  const matches = explicitDates(text)
    .map((date) => {
      const quote = closestVisibleQuote(date, quotes);
      const excerpt = quote ? visibleExcerpt(text, date, quote) : "";
      return quote && !isHistoricalQuote(text, date, quote)
        ? { date, quote, excerpt: visibleExcerpt(text, date, quote) }
        : null;
    })
    .filter(
      (
        item,
      ): item is { date: ExplicitDate; quote: VisibleQuote; excerpt: string } =>
        item !== null,
    )
    .sort((left, right) => right.date.timestamp - left.date.timestamp);
  return matches[0] ?? null;
}

function deterministicSourceCandidate(
  source: CommoditySource,
  payload: unknown,
): RawCommodityCandidate[] | null {
  if (!["lithium", "gold", "bauxite"].includes(source.id)) return null;
  const evidence = pageMarkdownAt(payload);
  if (!evidence.trim()) return [];

  let quote: VisibleQuote[] = [];
  if (source.id === "lithium") {
    quote = sourceQuote(
      evidence,
      [
        /\b(?:CNY|RMB|yuan)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/\s*|per\s+)?(?:metric\s+)?(?:tonne|ton|t)\b/gi,
        /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:CNY|RMB|yuan)\s*(?:\/\s*|per\s+)?(?:metric\s+)?(?:tonne|ton|t)\b/gi,
      ],
      "T",
      "CNY",
    );
  } else if (source.id === "gold") {
    const finalUrl = finalCanonicalUrlAt(payload);
    if (
      !finalUrl ||
      canonicalUrlIdentity(finalUrl) !== canonicalUrlIdentity(source.canonicalUrl)
    ) {
      return [];
    }
    quote = sourceQuote(
      evidence,
      [
        /\b(?:USD|US\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/\s*(?:troy\s*)?oz|per\s+(?:troy\s*)?ounce)\b/gi,
        /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*USD\s*\/\s*(?:troy\s*)?oz\b/gi,
      ],
      "OZ",
      "USD",
    );
  } else {
    const guineaFob = /\bguinea\b[\s\S]{0,120}\bfob\b|\bfob\b[\s\S]{0,120}\bguinea\b/i;
    if (!guineaFob.test(evidence) || !/\bbauxite\b/i.test(evidence)) {
      return [];
    }
    quote = sourceQuote(
      evidence,
      [
        /\b(?:USD|US\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/\s*|per\s+)(?:metric\s+)?(?:tonne|ton|t)\b/gi,
        /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*USD\s*\/\s*(?:metric\s+)?(?:tonne|ton|t)\b/gi,
      ],
      "T",
      "USD",
    );
  }

  const current = newestDatedVisibleQuote(evidence, quote);
  if (!current) return [];
  return [{
    commodityId: source.id,
    price: current.quote.price,
    unit: current.quote.unit,
    currency: current.quote.currency,
    sourceMarket: source.market,
    sourcePublishedAt: current.date.sourcePublishedAt,
    publisher: source.publisher,
    canonicalUrl: source.canonicalUrl,
    excerpt: current.excerpt,
    confidence: 0.95,
  }];
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function normalizeCorroboratedDateOnly(
  candidate: RawCommodityCandidate,
  renderedEvidence = "",
): RawCommodityCandidate {
  const raw = candidate.sourcePublishedAt;
  if (typeof raw !== "string") return candidate;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return candidate;
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return candidate;
  }
  const evidence = [
    typeof candidate.excerpt === "string"
      ? candidate.excerpt.toLowerCase()
      : "",
    renderedEvidence.toLowerCase(),
  ].filter(Boolean);
  if (evidence.length === 0) return candidate;
  const monthName = MONTH_NAMES[Number(month) - 1];
  const dayNum = String(Number(day));
  const forms = [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${Number(month)}/${dayNum}/${year}`,
    `${Number(month)}-${dayNum}-${year}`,
  ];
  if (monthName) {
    forms.push(
      `${monthName} ${dayNum}, ${year}`,
      `${monthName} ${dayNum} ${year}`,
      `${dayNum} ${monthName} ${year}`,
    );
  }
  if (!forms.some((form) => evidence.some((text) => text.includes(form)))) {
    return candidate;
  }
  return { ...candidate, sourcePublishedAt: `${raw.trim()}T00:00:00.000Z` };
}

export function createCommodityFirecrawlAdapter(
  options: CommodityFirecrawlAdapterOptions,
): CommodityAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.firecrawl.dev/v1/scrape";

  return {
    async collectCommodity(source, signal) {
      if (!options.apiKey.trim()) {
        throw new Error("Firecrawl is not configured");
      }
      const payload = await withBoundedRetry(
        `Firecrawl commodity ${source.id}`,
        async (_attempt, _timeoutMs, attemptSignal) => {
          const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: source.url,
          formats: ["markdown", "extract"],
          extract: {
            prompt:
              `Extract the newest explicitly dated ${source.id} benchmark quote ` +
              `for ${source.market} from this page. ` +
              `Set publisher to "${source.publisher}", sourceMarket to exactly ` +
              `"${source.market}", and canonicalUrl to "${source.canonicalUrl}". ` +
              `Report the price in its source-native unit "${source.unit}" as the ` +
              `unit field WITHOUT the currency prefix (e.g. return "${source.unit}", ` +
              `not "${source.currency}/${source.unit}"), and set currency to ` +
              `"${source.currency}". Return a verbatim supporting excerpt. Only set ` +
              "sourcePublishedAt when rendered page evidence explicitly shows an ISO-8601 " +
              "date-time or a YYYY-MM-DD calendar date; never use retrieval time or infer " +
              "or fabricate a timestamp, URL, or price, and never convert the source-native " +
              "price or unit.",
            schema: COMMODITY_EXTRACT_SCHEMA,
          },
        }),
            signal: attemptSignal,
          });
          if (!response.ok) {
            throw new Error(
              `Firecrawl ${source.id} request failed with status ${response.status}`,
            );
          }
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
      if (
        typeof payload === "object" &&
        payload !== null &&
        "success" in payload &&
        payload.success === false
      ) {
        throw new Error(`Firecrawl ${source.id} returned success=false`);
      }
      const renderedEvidence = renderedEvidenceAt(payload);
      const sourceEvidenceCandidates = deterministicSourceCandidate(source, payload);
      const candidates = (sourceEvidenceCandidates ?? recordsAt(payload)).map((candidate) =>
        normalizeCorroboratedDateOnly(candidate, renderedEvidence),
      );
      if (candidates.length === 0) {
        throw new Error(
          sourceEvidenceCandidates !== null
            ? `Firecrawl ${source.id} returned no source-specific visible quote evidence`
            : `Firecrawl ${source.id} returned no commodity quotes`,
        );
      }
      if (source.id === "lithium") {
        let fxEvidence: EcbDailyFxEvidence | {
          sourceUrl: typeof ECB_DAILY_FX_URL;
          error: string;
          errorKind: "unavailable" | "malformed";
        };
        try {
          const xml = await withBoundedRetry(
            "ECB daily reference rates",
            async (_attempt, _timeoutMs, attemptSignal) => {
              const fxResponse = await fetchImpl(ECB_DAILY_FX_URL, {
                method: "GET",
                headers: { Accept: "application/xml" },
                signal: attemptSignal,
              });
              if (!fxResponse.ok) {
                throw new Error(
                  `ECB request failed with status ${fxResponse.status}`,
                );
              }
              const body = await fxResponse.text();
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
          try {
            fxEvidence = parseEcbDailyReferenceRates(xml);
          } catch (error) {
            fxEvidence = {
              sourceUrl: ECB_DAILY_FX_URL,
              error: error instanceof Error ? error.message : String(error),
              errorKind: "malformed",
            };
          }
        } catch (error) {
          signal.throwIfAborted();
          fxEvidence = {
            sourceUrl: ECB_DAILY_FX_URL,
            error: error instanceof Error ? error.message : String(error),
            errorKind: "unavailable",
          };
        }
        return candidates.map((candidate) => ({ ...candidate, fxEvidence }));
      }
      return candidates;
    },
  };
}
