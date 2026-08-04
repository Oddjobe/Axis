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
  // `json` is the v2 structured-output key; `extract` is retained so captured
  // v1 fixtures keep parsing.
  for (const key of ["json", "extract", "data"]) {
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


/**
 * Confirms an extracted price is actually visible on the rendered page.
 *
 * Thousands separators are removed from both sides before comparison, and the
 * lookarounds stop a short price from matching a fragment of a longer number.
 * This is the anti-fabrication guard: a model-supplied price that does not
 * appear in the page evidence is rejected regardless of how confident it is.
 */
export function priceIsVisibleInEvidence(
  evidence: string,
  price: number,
): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const normalized = evidence.replace(/,/g, "");
  const forms = new Set<string>([
    String(price),
    price.toFixed(2),
    price.toFixed(0),
  ]);
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Filters model-extracted quotes down to those corroborated by the page itself.
 *
 * Applies uniformly to every configured source rather than relying on
 * per-publisher scraping heuristics, which silently break whenever a publisher
 * changes its wording or layout.
 */
function corroboratedCandidates(
  source: CommoditySource,
  payload: unknown,
  candidates: readonly RawCommodityCandidate[],
): RawCommodityCandidate[] {
  const evidence = pageMarkdownAt(payload);
  if (!evidence.trim()) return [];

  // Reject a page that redirected away from the configured source, so a quote
  // can never be attributed to a publisher that did not serve it.
  const finalUrl = finalCanonicalUrlAt(payload);
  if (
    finalUrl &&
    canonicalUrlIdentity(finalUrl) !== canonicalUrlIdentity(source.canonicalUrl)
  ) {
    return [];
  }

  return candidates.filter((candidate) => {
    const price = typeof candidate.price === "number"
      ? candidate.price
      : Number(String(candidate.price ?? "").replace(/[,$\s]/g, ""));
    return priceIsVisibleInEvidence(evidence, price);
  });
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
    // Publishers vary between full and abbreviated month names, and between
    // padded and unpadded days (e.g. "August 4, 2026" and "Aug 04, 2026").
    const monthForms = [monthName, monthName.slice(0, 3)];
    const dayForms = [dayNum, day];
    for (const name of monthForms) {
      for (const dayForm of dayForms) {
        forms.push(
          `${name} ${dayForm}, ${year}`,
          `${name} ${dayForm} ${year}`,
          `${dayForm} ${name} ${year}`,
          `${dayForm}-${name}-${year}`,
        );
      }
    }
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
  const endpoint = options.endpoint ?? "https://api.firecrawl.dev/v2/scrape";

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
          // Firecrawl serves a cached page for up to two days by default, which
          // would let a daily run republish stale prices as current.
          maxAge: 0,
          onlyMainContent: source.onlyMainContent ?? true,
          ...(source.renderActions?.length
            ? { actions: source.renderActions }
            : {}),
          formats: [
            "markdown",
            {
              type: "json",
              prompt:
                `Extract the newest explicitly dated ${source.id} benchmark quote ` +
                `for ${source.market} from this page. ` +
                `Set publisher to "${source.publisher}", sourceMarket to exactly ` +
                `"${source.market}", and canonicalUrl to "${source.canonicalUrl}". ` +
                `This publisher quotes the price in ${source.sourceCurrency} per ` +
                `${source.sourceUnit}. Report the price exactly as the page states it, ` +
                `set unit to "${source.sourceUnit}" and currency to ` +
                `"${source.sourceCurrency}", and never convert the price, unit, or ` +
                "currency yourself. Return a verbatim supporting excerpt. Only set " +
                "sourcePublishedAt when rendered page evidence explicitly shows an ISO-8601 " +
                "date-time or a calendar date; never use retrieval time or infer " +
                "or fabricate a timestamp, URL, or price.",
              schema: COMMODITY_EXTRACT_SCHEMA,
            },
          ],
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
      const extracted = recordsAt(payload).map((candidate) =>
        normalizeCorroboratedDateOnly(candidate, renderedEvidence),
      );
      const candidates = corroboratedCandidates(source, payload, extracted);
      if (candidates.length === 0) {
        throw new Error(
          extracted.length > 0
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
