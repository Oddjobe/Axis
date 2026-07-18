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

export interface CommoditySource {
  id: CommodityId;
  publisher: string;
  url: string;
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
    publisher: "SunSirs",
    url: "https://www.sunsirs.com/uk/prodetail-1162.html",
    unit: "T",
    currency: "USD",
    market: "China lithium carbonate",
    sourceQuality: 0.9,
    minimumPrice: 3_000,
    maximumPrice: 150_000,
    maximumChangeRatio: 0.5,
    maximumAgeMs,
  },
  {
    id: "cobalt",
    publisher: "Trading Economics",
    url: "https://tradingeconomics.com/commodity/cobalt",
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
    publisher: "Kitco",
    url: "https://www.kitco.com/gold-price-today-usa/",
    unit: "OZ",
    currency: "USD",
    market: "Gold spot",
    sourceQuality: 0.95,
    minimumPrice: 500,
    maximumPrice: 10_000,
    maximumChangeRatio: 0.2,
    maximumAgeMs,
  },
  {
    id: "bauxite",
    publisher: "AluHub",
    url: "https://www.alu-hub.com/market-data",
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
              "The publication's explicit source date-time in ISO 8601 format. Never infer or convert a timestamp.",
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
