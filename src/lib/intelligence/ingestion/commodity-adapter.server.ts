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
          formats: ["extract"],
          extract: {
            prompt:
              `Extract the newest explicitly dated ${source.id} benchmark quote ` +
              `for ${source.market}. Return the publication's canonical URL and a ` +
              "verbatim supporting excerpt. Never infer a timestamp or convert the " +
              "source-native price or unit.",
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
      const candidates = recordsAt(payload);
      if (candidates.length === 0) {
        throw new Error(`Firecrawl ${source.id} returned no commodity quotes`);
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
