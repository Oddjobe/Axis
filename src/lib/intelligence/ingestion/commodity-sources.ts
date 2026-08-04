import { DATASET_TRUST_POLICIES } from "@/lib/intelligence/trust";

export const COMMODITY_IDS = [
  "lithium",
  "cobalt",
  "copper",
  "gold",
  "bauxite",
] as const;

export type CommodityId = (typeof COMMODITY_IDS)[number];
export type CommodityUnit = "T" | "OZ";

export const POUNDS_PER_METRIC_TONNE = 2204.62262185;
export const COPPER_LB_TO_TONNE_FORMULA =
  "canonicalPrice = rawPrice * 2204.62262185";
export const ECB_DAILY_FX_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_USD_PER_CNY_FORMULA =
  "usdPerCny = usdPerEur / cnyPerEur";
export const LITHIUM_CNY_TO_USD_FORMULA =
  "canonicalPrice = rawPrice * (usdPerEur / cnyPerEur)";

export interface CommodityRenderAction {
  type: "wait" | "scroll";
  milliseconds?: number;
  direction?: "up" | "down";
}

export interface CommoditySource {
  id: CommodityId;
  publisher: string;
  url: string;
  canonicalUrl: string;
  alternateProvenance?: readonly {
    publisher: string;
    canonicalUrl: string;
  }[];
  /**
   * Firecrawl strips boilerplate by default. Sources that render their quote
   * outside the main-content heuristic must opt out of that filtering.
   */
  onlyMainContent?: boolean;
  /**
   * Browser actions run before the page is captured. Required for sources whose
   * quote is rendered client-side after the initial response.
   */
  renderActions?: readonly CommodityRenderAction[];
  /**
   * The unit and currency the publisher actually prints, which is not always the
   * canonical pair below. Extraction must capture the page verbatim and leave
   * every conversion to the runner, so a converted value can never be published
   * as if the source stated it.
   */
  sourceUnit: string;
  sourceCurrency: string;
  unit: CommodityUnit;
  currency: "USD";
  market: string;
  sourceQuality: number;
  minimumPrice: number;
  maximumPrice: number;
  maximumChangeRatio: number;
  maximumAgeMs: number;
}

const maximumAgeMs = DATASET_TRUST_POLICIES.commodity.maximumAgeMs;

export const COMMODITY_SOURCES: readonly CommoditySource[] = [
  {
    id: "lithium",
    // SunSirs places its lithium carbonate table behind a member login, so the
    // quote is unreachable by any scraping configuration.
    publisher: "Trading Economics",
    url: "https://tradingeconomics.com/commodity/lithium",
    canonicalUrl: "https://tradingeconomics.com/commodity/lithium",
    sourceUnit: "T",
    sourceCurrency: "CNY",
    unit: "T",
    currency: "USD",
    market: "China lithium carbonate",
    sourceQuality: 0.92,
    minimumPrice: 3_000,
    maximumPrice: 150_000,
    maximumChangeRatio: 0.5,
    maximumAgeMs,
  },
  {
    id: "cobalt",
    publisher: "Trading Economics",
    url: "https://tradingeconomics.com/commodity/cobalt",
    canonicalUrl: "https://tradingeconomics.com/commodity/cobalt",
    sourceUnit: "T",
    sourceCurrency: "USD",
    unit: "T",
    currency: "USD",
    market: "LME cobalt",
    sourceQuality: 0.92,
    minimumPrice: 10_000,
    maximumPrice: 150_000,
    maximumChangeRatio: 0.35,
    maximumAgeMs,
  },
  {
    id: "copper",
    publisher: "Trading Economics",
    url: "https://tradingeconomics.com/commodity/copper",
    canonicalUrl: "https://tradingeconomics.com/commodity/copper",
    sourceUnit: "Lbs",
    sourceCurrency: "USD",
    unit: "T",
    currency: "USD",
    market: "LME copper",
    sourceQuality: 0.92,
    minimumPrice: 3_000,
    maximumPrice: 30_000,
    maximumChangeRatio: 0.25,
    maximumAgeMs,
  },
  {
    id: "gold",
    // Kitco publishes a live ticker with no stated publication date, which can
    // never satisfy the explicit-timestamp contract.
    publisher: "Trading Economics",
    url: "https://tradingeconomics.com/commodity/gold",
    canonicalUrl: "https://tradingeconomics.com/commodity/gold",
    sourceUnit: "t.oz",
    sourceCurrency: "USD",
    unit: "OZ",
    currency: "USD",
    market: "Gold spot",
    sourceQuality: 0.92,
    minimumPrice: 500,
    maximumPrice: 10_000,
    maximumChangeRatio: 0.2,
    maximumAgeMs,
  },
  {
    id: "bauxite",
    publisher: "AluHub",
    url: "https://www.alu-hub.com/market-data",
    canonicalUrl: "https://www.alu-hub.com/market-data",
    // The market data is a client-rendered dashboard; without waiting for it the
    // page returns an empty shell.
    onlyMainContent: false,
    renderActions: [
      { type: "wait", milliseconds: 6_000 },
      { type: "scroll", direction: "down" },
      { type: "wait", milliseconds: 3_000 },
    ],
    sourceUnit: "T",
    sourceCurrency: "USD",
    unit: "T",
    currency: "USD",
    market: "Guinea bauxite FOB",
    sourceQuality: 0.88,
    minimumPrice: 10,
    maximumPrice: 300,
    maximumChangeRatio: 0.35,
    maximumAgeMs,
  },
] as const;

// Firecrawl enforces the OpenAI strict JSON-schema subset for structured
// extraction: every object must set `additionalProperties: false` with all
// properties listed in `required`, and validation keywords such as `format`,
// `minItems`, `minimum`, and `maximum` are rejected with a 400 "Invalid JSON
// schema" error. Descriptions and `enum` remain supported and carry the
// source-native unit / date-time guidance that those keywords previously
// encoded.
export const COMMODITY_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          commodityId: { type: "string", enum: COMMODITY_IDS },
          price: { type: "number" },
          unit: {
            type: "string",
            description:
              "Preserve the source-native unit. Trading Economics copper must remain Lb or Lbs.",
          },
          currency: { type: "string" },
          sourceMarket: { type: "string" },
          sourcePublishedAt: {
            type: "string",
            description:
              "The publication's explicit source date-time in ISO 8601 format, or YYYY-MM-DD only when that exact calendar date is explicitly shown by the source. Never infer or convert a timestamp.",
          },
          publisher: { type: "string" },
          canonicalUrl: {
            type: "string",
            description: "The publication's canonical absolute URL.",
          },
          excerpt: { type: "string" },
          confidence: {
            type: "number",
            description:
              "Extraction confidence between 0 and 1 inclusive.",
          },
        },
        required: [
          "commodityId",
          "price",
          "unit",
          "currency",
          "sourceMarket",
          "sourcePublishedAt",
          "publisher",
          "canonicalUrl",
          "excerpt",
          "confidence",
        ],
      },
    },
  },
  required: ["quotes"],
} as const;
