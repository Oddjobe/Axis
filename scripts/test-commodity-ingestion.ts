import assert from "node:assert/strict";

import {
  createCommodityFirecrawlAdapter,
  parseEcbDailyReferenceRates,
} from "../src/lib/intelligence/ingestion/commodity-adapter.server";
import { runCommodityIngestion } from "../src/lib/intelligence/ingestion/commodity-runner.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import {
  ALPHA_VANTAGE_GOLD_SILVER_SPOT_URL,
  COMMODITY_SOURCES,
  COPPER_LB_TO_TONNE_FORMULA,
  ECB_DAILY_FX_URL,
  ECB_USD_PER_CNY_FORMULA,
  LITHIUM_CNY_TO_USD_FORMULA,
  POUNDS_PER_METRIC_TONNE,
  type CommodityId,
  type CommoditySource,
} from "../src/lib/intelligence/ingestion/commodity-sources";
import type { IngestionAdapter } from "../src/lib/intelligence/ingestion/types";
import type { AtomicPublicationDecision } from "../src/lib/intelligence/publication-storage";

const now = new Date("2026-07-17T00:00:00.000Z");
const prices: Record<CommodityId, number> = {
  lithium: 28_113,
  cobalt: 60_050,
  copper: 12_773,
  gold: 4_725,
  bauxite: 60.99,
};

type Fixture = Record<string, unknown>;
type FixtureFactory = (source: CommoditySource) => Fixture[];
type RenderedEvidence = {
  markdown?: string;
  metadata?: Record<string, unknown>;
};
type RenderedEvidenceFactory = RenderedEvidence | ((source: CommoditySource) => RenderedEvidence);

const validFxXml = [
  "<gesmes:Envelope>",
  "<Cube><Cube time='2026-07-16'>",
  "<Cube currency='USD' rate='1.16'/>",
  "<Cube currency='CNY' rate='8.2'/>",
  "</Cube></Cube>",
  "</gesmes:Envelope>",
].join("");

function quote(
  source: CommoditySource,
  overrides: Fixture = {},
): Fixture {
  return {
    commodityId: source.id,
    price:
      source.id === "lithium"
        ? 198_500
        : source.id === "copper"
          ? 6.24
          : prices[source.id],
    unit: source.id === "copper" ? "Lbs" : source.unit,
    currency: source.id === "lithium" ? "CNY" : source.currency,
    sourceMarket: source.market,
    sourcePublishedAt: "2026-07-16T12:00:00.000Z",
    publisher: source.publisher,
    canonicalUrl: source.canonicalUrl,
    excerpt: `Published ${source.id} benchmark quote for ${source.market} from the cited public market page.`,
    confidence: 0.9,
    ...overrides,
  };
}

function currentVisibleEvidence(source: CommoditySource): RenderedEvidence {
  if (source.id === "lithium") {
    return {
      markdown:
        "SunSirs current lithium carbonate quote. Price date: 2026-07-16. RMB 198,500/ton.",
    };
  }
  if (source.id === "gold") {
    return {
      markdown:
        "Kitco Gold Spot current quote as of 2026-07-16: USD 4,725.00/oz.",
      metadata: { sourceURL: source.canonicalUrl },
    };
  }
  if (source.id === "bauxite") {
    return {
      markdown:
        "AluHub current Guinea bauxite FOB quote dated 2026-07-16: USD 60.99/T.",
    };
  }
  return {
    markdown: `${source.publisher} current quote dated 2026-07-16.`,
  };
}

function mockedAdapter(
  fixtures: FixtureFactory,
  failedIds: readonly CommodityId[] = [],
  fx: { status?: number; xml?: string } = {},
  renderedEvidence: RenderedEvidenceFactory = {},
) {
  const requests: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
    });
    if (url === ECB_DAILY_FX_URL) {
      return new Response(fx.xml ?? validFxXml, { status: fx.status ?? 200 });
    }
    const body = JSON.parse(String(init?.body)) as {
      url: string;
      extract: { schema: unknown };
    };
    const source = COMMODITY_SOURCES.find((item) => item.url === body.url);
    assert(source, `Unexpected source URL ${body.url}`);
    if (failedIds.includes(source.id)) {
      return new Response("source unavailable", { status: 503 });
    }
    const suppliedEvidence =
      typeof renderedEvidence === "function"
        ? renderedEvidence(source)
        : renderedEvidence;
    const currentEvidence = currentVisibleEvidence(source);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown: suppliedEvidence.markdown ?? currentEvidence.markdown,
          metadata: {
            ...currentEvidence.metadata,
            ...suppliedEvidence.metadata,
          },
          extract: { quotes: fixtures(source) },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return {
    adapter: createCommodityFirecrawlAdapter({
      apiKey: "fixture-key",
      fetchImpl,
    }),
    requests,
  };
}

function alphaVantageMockedAdapter(
  alphaVantagePayload: unknown,
  alphaVantageApiKey = "fixture-alpha-vantage-key",
) {
  const directRequests: URL[] = [];
  let firecrawlRequests = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://alpha-vantage.test/query")) {
      directRequests.push(new URL(url));
      return new Response(JSON.stringify(alphaVantagePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    firecrawlRequests += 1;
    const body = JSON.parse(String(init?.body)) as { url: string };
    const source = COMMODITY_SOURCES.find((item) => item.url === body.url);
    assert(source);
    assert.equal(source.id, "gold");
    const evidence = currentVisibleEvidence(source);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown: evidence.markdown,
          metadata: evidence.metadata,
          extract: { quotes: [quote(source)] },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return {
    adapter: createCommodityFirecrawlAdapter({
      apiKey: "fixture-firecrawl-key",
      alphaVantageApiKey,
      alphaVantageEndpoint: "https://alpha-vantage.test/query",
      fetchImpl,
    }),
    directRequests,
    getFirecrawlRequests: () => firecrawlRequests,
  };
}

async function main() {
const completeMock = mockedAdapter((source) => [quote(source)]);
let persistedDecisions = 0;
const complete = await runCommodityIngestion({
  adapter: completeMock.adapter,
  now,
  previousPrices: prices,
  persist: async (dataset, decisions) => {
    assert.equal(dataset, "commodity");
    persistedDecisions = decisions.length;
    return {
      published: decisions.filter((item) => item.decision === "publish").length,
      quarantined: decisions.filter((item) => item.decision === "quarantine").length,
      auditRecorded: decisions.length,
      trustStorageAvailable: true,
      warnings: [],
      errors: [],
    };
  },
});
assert.equal(complete.success, true);
assert.equal(complete.publicationTier, "trusted");
assert.deepEqual(complete.trustedCoverage.missingIds, []);
assert.equal(complete.quality.acceptedCount, 5);
assert.equal(persistedDecisions, 5);
assert.equal(
  completeMock.requests.filter((request) => request.url !== ECB_DAILY_FX_URL)
    .length,
  5,
);
const commodityRequest = completeMock.requests.find(
  (request) => request.url !== ECB_DAILY_FX_URL,
);
assert(commodityRequest);
assert.deepEqual(
  (JSON.parse(String(commodityRequest.body)) as { formats: string[] }).formats,
  ["markdown", "extract"],
);
const ecbRequest = completeMock.requests.find(
  (request) => request.url === ECB_DAILY_FX_URL,
);
assert(ecbRequest);
assert.equal(ecbRequest.method, "GET");
assert.equal(ecbRequest.body, undefined);
assert.equal(ecbRequest.headers.has("authorization"), false);
assert.equal(ecbRequest.headers.has("x-api-key"), false);
assert.equal(
  JSON.stringify([...ecbRequest.headers.entries()]).includes("fixture-key"),
  false,
);
assert(
  complete.decisions.every(
    (item) =>
      item.normalized?.contentHash.length === 64 &&
      item.identity?.contentHash === item.normalized.contentHash,
  ),
);
const convertedLithium = complete.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "lithium",
)?.normalized;
assert(convertedLithium);
assert.equal(convertedLithium.rawPrice, 198_500);
assert.equal(convertedLithium.rawCurrency, "CNY");
assert.equal(convertedLithium.price, 198_500 * (1.16 / 8.2));
assert.equal(convertedLithium.currency, "USD");
assert.deepEqual(convertedLithium.conversion, {
  kind: "currency",
  factor: 1.16 / 8.2,
  factorFormula: ECB_USD_PER_CNY_FORMULA,
  formula: LITHIUM_CNY_TO_USD_FORMULA,
  fromCurrency: "CNY",
  toCurrency: "USD",
  fxDate: "2026-07-16",
  fxSourceUrl: ECB_DAILY_FX_URL,
  rates: { usdPerEur: 1.16, cnyPerEur: 8.2 },
});
assert.deepEqual(convertedLithium.sourceEvidence.rawQuote, {
  price: 198_500,
  unit: "T",
  currency: "CNY",
});
assert.equal(
  convertedLithium.sourceEvidence.canonicalQuote.price,
  198_500 * (1.16 / 8.2),
);
const lithiumSource = COMMODITY_SOURCES.find(
  (source) => source.id === "lithium",
);
assert(lithiumSource);
const newestSunSirs = mockedAdapter(
  (source) => [
    quote(source, {
      price: 1,
      sourcePublishedAt: "2026-07-17T12:00:00.000Z",
    }),
  ],
  [],
  {},
  (source) =>
    source.id === "lithium"
      ? {
          markdown:
            "SunSirs history: 2023-11-15 RMB 400,000/ton. Current lithium carbonate quote, price date 2026-07-16: RMB 198,500/ton.",
        }
      : currentVisibleEvidence(source),
);
const newestSunSirsCandidates = await newestSunSirs.adapter.collectCommodity(
  lithiumSource,
  new AbortController().signal,
);
assert.deepEqual(newestSunSirsCandidates[0], {
  commodityId: "lithium",
  price: 198_500,
  unit: "T",
  currency: "CNY",
  sourceMarket: lithiumSource.market,
  sourcePublishedAt: "2026-07-16T00:00:00.000Z",
  publisher: "SunSirs",
  canonicalUrl: lithiumSource.canonicalUrl,
  excerpt:
    "SunSirs history: 2023-11-15 RMB 400,000/ton. Current lithium carbonate quote, price date 2026-07-16: RMB 198,500/ton.",
  confidence: 0.95,
  fxEvidence: {
    date: "2026-07-16",
    usdPerEur: 1.16,
    cnyPerEur: 8.2,
    sourceUrl: ECB_DAILY_FX_URL,
  },
});
const staleSunSirs = mockedAdapter(
  (source) => [quote(source)],
  [],
  {},
  (source) =>
    source.id === "lithium"
      ? { markdown: "SunSirs quote dated 2023-11-15: RMB 400,000/ton." }
      : currentVisibleEvidence(source),
);
const staleSunSirsRun = await runCommodityIngestion({
  adapter: staleSunSirs.adapter,
  sources: [lithiumSource],
  now,
});
assert.equal(staleSunSirsRun.quality.acceptedCount, 0);
assert.equal(staleSunSirsRun.quality.rejectionReasons.stale_timestamp, 1);
const unpricedSunSirs = mockedAdapter(
  (source) => [quote(source)],
  [],
  {},
  (source) =>
    source.id === "lithium"
      ? { markdown: "SunSirs current lithium carbonate price date 2026-07-16." }
      : currentVisibleEvidence(source),
);
await assert.rejects(
  () =>
    unpricedSunSirs.adapter.collectCommodity(
      lithiumSource,
      new AbortController().signal,
    ),
  /no source-specific visible quote evidence/,
);
const convertedCopper = complete.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "copper",
)?.normalized;
assert(convertedCopper);
assert.equal(convertedCopper.rawPrice, 6.24);
assert.equal(convertedCopper.rawUnit, "Lbs");
assert.equal(convertedCopper.price, 13_756.845160344);
assert.equal(convertedCopper.unit, "T");
assert.deepEqual(convertedCopper.conversion, {
  kind: "unit",
  factor: POUNDS_PER_METRIC_TONNE,
  formula: COPPER_LB_TO_TONNE_FORMULA,
  fromUnit: "LBS",
  toUnit: "T",
});
assert.deepEqual(convertedCopper.sourceEvidence.rawQuote, {
  price: 6.24,
  unit: "Lbs",
  currency: "USD",
});
assert.deepEqual(convertedCopper.sourceEvidence.canonicalQuote, {
  price: 6.24 * POUNDS_PER_METRIC_TONNE,
  unit: "T",
  currency: "USD",
});

const copperSource = COMMODITY_SOURCES.find((source) => source.id === "copper");
assert(copperSource);
const dateOnlyMock = mockedAdapter(
  (source) => [
    quote(
      source,
      source.id === "copper"
        ? {
            sourcePublishedAt: "2026-07-16",
            excerpt: "Trading Economics copper benchmark quote.",
          }
        : {},
    ),
  ],
  [],
  {},
  {
    markdown: "Copper price benchmark, published July 16, 2026.",
    metadata: { sourceURL: copperSource.canonicalUrl },
  },
);
const dateOnly = await runCommodityIngestion({
  adapter: dateOnlyMock.adapter,
  sources: [copperSource],
  now,
  previousPrices: { copper: prices.copper },
});
assert.equal(dateOnly.quality.acceptedCount, 1);
assert.equal(
  dateOnly.decisions[0]?.normalized?.sourcePublishedAt,
  "2026-07-16T00:00:00.000Z",
);

const missingDateMock = mockedAdapter((source) => [
  quote(source, source.id === "copper" ? { sourcePublishedAt: "" } : {}),
]);
const missingDate = await runCommodityIngestion({
  adapter: missingDateMock.adapter,
  sources: [copperSource],
  now,
});
assert.equal(missingDate.quality.acceptedCount, 0);
assert.equal(missingDate.quality.rejectionReasons.missing_explicit_timestamp, 1);

const goldSource = COMMODITY_SOURCES.find((source) => source.id === "gold");
assert(goldSource);
const alphaVantageResponse = (lastRefreshed = "2026-07-16T12:00:00.000Z") => ({
  endpoint: "Gold and Silver Spot Prices",
  last_refreshed: lastRefreshed,
  unit: "USD per ounce",
  data: [{
    date: lastRefreshed.slice(0, 10),
    value: "4725.00",
  }],
});
const alphaVantage = alphaVantageMockedAdapter(alphaVantageResponse());
const alphaVantageRun = await runCommodityIngestion({
  adapter: alphaVantage.adapter,
  sources: [goldSource],
  now,
  previousPrices: { gold: prices.gold },
});
assert.equal(alphaVantageRun.quality.acceptedCount, 1);
assert.equal(alphaVantage.getFirecrawlRequests(), 0);
assert.equal(alphaVantage.directRequests.length, 1);
assert.equal(
  alphaVantage.directRequests[0]?.searchParams.get("function"),
  "GOLD_SILVER_SPOT",
);
assert.equal(
  alphaVantage.directRequests[0]?.searchParams.get("apikey"),
  "fixture-alpha-vantage-key",
);
const alphaVantageGold = alphaVantageRun.decisions[0]?.normalized;
assert.equal(alphaVantageGold?.publisher, "Alpha Vantage");
assert.equal(
  alphaVantageGold?.canonicalUrl,
  ALPHA_VANTAGE_GOLD_SILVER_SPOT_URL,
);
assert.equal(alphaVantageGold?.unit, "OZ");
assert.equal(alphaVantageGold?.currency, "USD");
assert.equal(
  alphaVantageGold?.sourcePublishedAt,
  "2026-07-16T12:00:00.000Z",
);

const missingAlphaVantageKey = alphaVantageMockedAdapter(
  alphaVantageResponse(),
  "",
);
const missingAlphaVantageKeyRun = await runCommodityIngestion({
  adapter: missingAlphaVantageKey.adapter,
  sources: [goldSource],
  now,
});
assert.equal(missingAlphaVantageKey.directRequests.length, 0);
assert.equal(missingAlphaVantageKey.getFirecrawlRequests(), 1);
assert.equal(
  missingAlphaVantageKeyRun.decisions[0]?.normalized?.publisher,
  "Kitco",
);

const badAlphaVantageResponse = alphaVantageMockedAdapter({
  Note: "Thank you for using Alpha Vantage!",
});
const badAlphaVantageResponseRun = await runCommodityIngestion({
  adapter: badAlphaVantageResponse.adapter,
  sources: [goldSource],
  now,
});
assert.equal(badAlphaVantageResponse.directRequests.length, 1);
assert.equal(badAlphaVantageResponse.getFirecrawlRequests(), 1);
assert.equal(
  badAlphaVantageResponseRun.decisions[0]?.normalized?.publisher,
  "Kitco",
);

for (const fixture of [
  {
    name: "stale Alpha Vantage refresh timestamp",
    lastRefreshed: "2026-07-01T12:00:00.000Z",
    reason: "stale_timestamp",
  },
  {
    name: "future Alpha Vantage refresh timestamp",
    lastRefreshed: "2026-07-17T12:00:00.000Z",
    reason: "future_timestamp",
  },
] as const) {
  const alphaVantageTimestamp = alphaVantageMockedAdapter(
    alphaVantageResponse(fixture.lastRefreshed),
  );
  const alphaVantageTimestampRun = await runCommodityIngestion({
    adapter: alphaVantageTimestamp.adapter,
    sources: [goldSource],
    now,
  });
  assert.equal(alphaVantageTimestamp.getFirecrawlRequests(), 0, fixture.name);
  assert.equal(
    alphaVantageTimestampRun.quality.acceptedCount,
    0,
    fixture.name,
  );
  assert.equal(
    alphaVantageTimestampRun.quality.rejectionReasons[fixture.reason],
    1,
    fixture.name,
  );
}

const redirectedGoldMock = mockedAdapter(
  (source) => [quote(source)],
  [],
  {},
  (source) =>
    source.id === "gold"
      ? {
          markdown:
            "Kitco Gold Spot current quote as of 2026-07-16: USD 4,725.00/oz.",
          metadata: { sourceURL: "https://www.kitco.com/charts/gold" },
        }
      : currentVisibleEvidence(source),
);
const redirectedGold = await runCommodityIngestion({
  adapter: redirectedGoldMock.adapter,
  sources: [goldSource],
  now,
  previousPrices: { gold: prices.gold },
});
assert.equal(redirectedGold.quality.acceptedCount, 1);
assert.equal(
  redirectedGold.decisions[0]?.normalized?.canonicalUrl,
  "https://kitco.com/charts/gold",
);
const redirectedAwayGold = mockedAdapter(
  (source) => [quote(source)],
  [],
  {},
  (source) =>
    source.id === "gold"
      ? {
          markdown:
            "Kitco Gold Spot current quote as of 2026-07-16: USD 4,725.00/oz.",
          metadata: { sourceURL: "https://example.test/charts/gold" },
        }
      : currentVisibleEvidence(source),
);
await assert.rejects(
  () =>
    redirectedAwayGold.adapter.collectCommodity(
      goldSource,
      new AbortController().signal,
    ),
  /no source-specific visible quote evidence/,
);
const unitlessGold = mockedAdapter(
  (source) => [quote(source)],
  [],
  {},
  (source) =>
    source.id === "gold"
      ? {
          markdown: "Kitco Gold Spot current quote as of 2026-07-16: USD 4,725.00.",
          metadata: { sourceURL: source.canonicalUrl },
        }
      : currentVisibleEvidence(source),
);
await assert.rejects(
  () =>
    unitlessGold.adapter.collectCommodity(
      goldSource,
      new AbortController().signal,
    ),
  /no source-specific visible quote evidence/,
);

const bauxiteSource = COMMODITY_SOURCES.find(
  (source) => source.id === "bauxite",
);
assert(bauxiteSource);
for (const [name, evidence] of [
  [
    "non-Guinea benchmark",
    "AluHub current Australian bauxite FOB quote dated 2026-07-16: USD 60.99/T.",
  ],
  [
    "missing date",
    "AluHub current Guinea bauxite FOB quote: USD 60.99/T.",
  ],
  [
    "wrong currency",
    "AluHub current Guinea bauxite FOB quote dated 2026-07-16: CNY 60.99/T.",
  ],
  [
    "wrong unit",
    "AluHub current Guinea bauxite FOB quote dated 2026-07-16: USD 60.99/oz.",
  ],
] as const) {
  const invalidBauxite = mockedAdapter(
    (source) => [quote(source)],
    [],
    {},
    (source) =>
      source.id === "bauxite"
        ? { markdown: evidence }
        : currentVisibleEvidence(source),
  );
  await assert.rejects(
    () =>
      invalidBauxite.adapter.collectCommodity(
        bauxiteSource,
        new AbortController().signal,
      ),
    /no source-specific visible quote evidence/,
    name,
  );
}

const stableHashMock = mockedAdapter((source) => [quote(source)]);
const stableHashRun = await runCommodityIngestion({
  adapter: stableHashMock.adapter,
  now: new Date("2026-07-17T01:00:00.000Z"),
});
const stableCopper = stableHashRun.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "copper",
)?.normalized;
assert(stableCopper);
assert.equal(stableCopper.contentHash, convertedCopper.contentHash);
assert.equal(stableCopper.sourceEvidence.retrievedAt, "2026-07-17T01:00:00.000Z");
const stableLithium = stableHashRun.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "lithium",
)?.normalized;
assert(stableLithium);
assert.equal(stableLithium.contentHash, convertedLithium.contentHash);

const wrongCopperUnitMock = mockedAdapter((source) => [
  quote(source, { unit: "LB/MT" }),
]);
const wrongCopperUnit = await runCommodityIngestion({
  adapter: wrongCopperUnitMock.adapter,
  sources: [copperSource],
  now,
});
assert.equal(wrongCopperUnit.quality.acceptedCount, 0);
assert.equal(wrongCopperUnit.quality.rejectionReasons.unsupported_unit, 1);
assert.equal(wrongCopperUnit.quality.rejectionReasons.implausible_price ?? 0, 0);

const copperJumpMock = mockedAdapter((source) => [
  quote(source, source.id === "copper" ? { price: 9 } : {}),
]);
const copperJump = await runCommodityIngestion({
  adapter: copperJumpMock.adapter,
  sources: [copperSource],
  now,
  previousPrices: { copper: prices.copper },
});
assert.equal(copperJump.quality.acceptedCount, 0);
assert.equal(copperJump.quality.rejectionReasons.implausible_price_change, 1);

for (const fixture of [
  {
    name: "missing",
    fx: { status: 503 },
    reason: "missing_fx_evidence",
  },
  {
    name: "stale",
    fx: { xml: validFxXml.replace("2026-07-16", "2026-07-01") },
    reason: "stale_fx_evidence",
  },
  {
    name: "future",
    fx: { xml: validFxXml.replace("2026-07-16", "2026-07-18") },
    reason: "future_fx_evidence",
  },
  {
    name: "malformed",
    fx: { xml: validFxXml.replace("currency='CNY'", "currency='GBP'") },
    reason: "malformed_fx_evidence",
  },
] as const) {
  const fxMock = mockedAdapter((source) => [quote(source)], [], fixture.fx);
  const result = await runCommodityIngestion({
    adapter: fxMock.adapter,
    sources: [lithiumSource],
    now,
  });
  assert.equal(result.quality.acceptedCount, 0, fixture.name);
  assert.equal(result.quality.rejectionReasons[fixture.reason], 1, fixture.name);
}
assert.deepEqual(parseEcbDailyReferenceRates(validFxXml), {
  date: "2026-07-16",
  usdPerEur: 1.16,
  cnyPerEur: 8.2,
  sourceUrl: ECB_DAILY_FX_URL,
});

const partialMock = mockedAdapter(
  (source) => [quote(source)],
  ["cobalt"],
);
const partial = await runCommodityIngestion({
  adapter: partialMock.adapter,
  now,
});
assert.equal(partial.success, false);
assert.equal(partial.partialSuccess, true);
assert.equal(partial.publicationTier, "mixed");
assert.equal(partial.coverageMode, "partial");
assert.deepEqual(partial.trustedCoverage.missingIds, ["cobalt"]);
assert.equal(partial.quality.sourceFailureCount, 1);

const timeMock = mockedAdapter((source) => [
  quote(source, {
    sourcePublishedAt:
      source.id === "lithium"
        ? "2026-07-01T12:00:00.000Z"
        : source.id === "cobalt"
          ? "2026-07-17T01:00:00.000Z"
          : "2026-07-16T12:00:00.000Z",
  }),
], [], {}, (source) =>
  source.id === "lithium"
    ? {
        markdown:
          "SunSirs current lithium carbonate quote, price date 2026-07-01: RMB 198,500/ton.",
      }
    : currentVisibleEvidence(source),
);
const invalidTimes = await runCommodityIngestion({
  adapter: timeMock.adapter,
  now,
});
assert.deepEqual(invalidTimes.trustedCoverage.missingIds, ["lithium", "cobalt"]);
assert.equal(invalidTimes.quality.rejectionReasons.stale_timestamp, 1);
assert.equal(invalidTimes.quality.rejectionReasons.future_timestamp, 1);

const staleBauxiteMock = mockedAdapter((source) => [
  quote(source, { sourcePublishedAt: "2026-07-01T12:00:00.000Z" }),
], [], {}, (source) =>
  source.id === "bauxite"
    ? {
        markdown:
          "AluHub current Guinea bauxite FOB quote dated 2026-07-01: USD 60.99/T.",
      }
    : currentVisibleEvidence(source),
);
const staleBauxite = await runCommodityIngestion({
  adapter: staleBauxiteMock.adapter,
  sources: [bauxiteSource],
  now,
});
assert.equal(staleBauxite.quality.acceptedCount, 0);
assert.equal(staleBauxite.quality.rejectionReasons.stale_timestamp, 1);

const duplicateMock = mockedAdapter((source) =>
  source.id === "lithium"
    ? [
        quote(source, {
          price: 197_000,
          sourcePublishedAt: "2026-07-15T12:00:00.000Z",
        }),
        quote(source, {
          price: 198_500,
          sourcePublishedAt: "2026-07-16T12:00:00.000Z",
        }),
      ]
    : [quote(source)],
  [], {}, (source) =>
    source.id === "lithium"
      ? {
          markdown:
            "SunSirs history: 2026-07-15 RMB 197,000/ton. Current lithium carbonate quote, price date 2026-07-16: RMB 198,500/ton.",
        }
      : currentVisibleEvidence(source),
);
const duplicates = await runCommodityIngestion({
  adapter: duplicateMock.adapter,
  now,
});
assert.equal(duplicates.publicationTier, "trusted");
assert.equal(duplicates.quality.rejectionReasons.duplicate_candidate ?? 0, 0);
const acceptedLithium = duplicates.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "lithium",
);
assert.equal(acceptedLithium?.normalized?.price, 198_500 * (1.16 / 8.2));

const anomalyAdapter = {
  async collectCommodity(source: CommoditySource) {
  const overrides: Record<CommodityId, Fixture> = {
    lithium: { price: 1 },
    cobalt: { price: 100_000 },
    copper: { currency: "EUR" },
    gold: { unit: "KG" },
    bauxite: { confidence: 0.8 },
  };
    const candidate = quote(source, overrides[source.id]);
    return [source.id === "lithium"
      ? {
          ...candidate,
          fxEvidence: {
            date: "2026-07-16",
            usdPerEur: 1.16,
            cnyPerEur: 8.2,
            sourceUrl: ECB_DAILY_FX_URL,
          },
        }
      : candidate];
  },
};
const anomalies = await runCommodityIngestion({
  adapter: anomalyAdapter,
  now,
  previousPrices: prices,
});
assert.equal(anomalies.publicationTier, "legacy");
assert.deepEqual(anomalies.trustedCoverage.missingIds, [
  "lithium",
  "cobalt",
  "copper",
  "gold",
  "bauxite",
]);
assert.equal(anomalies.quality.rejectionReasons.implausible_price, 1);
assert.equal(anomalies.quality.rejectionReasons.implausible_price_change, 2);
assert.equal(anomalies.quality.rejectionReasons.unsupported_currency, 1);
assert.equal(anomalies.quality.rejectionReasons.unsupported_unit, 1);
assert.equal(anomalies.quality.rejectionReasons.confidence_below_threshold, 1);
assert(
  anomalies.decisions
    .flatMap((item) => item.reasons)
    .every((item) => item.code && item.commodityCode && item.detail),
);

const sourcePublishedAt = "2026-07-16T10:00:00.000Z";
const intelligenceExcerpt =
  "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.";
const sharedAdapter: IngestionAdapter = {
  async collectIntelligence() {
    return [{
      title: "Nigeria expands regional digital trade infrastructure",
      summary: intelligenceExcerpt,
      severity: "MEDIUM",
      category: "SOVEREIGNTY RISK",
      isoCode: "NGA",
      actor: null,
      timeAgo: "2 hours ago",
      url: "https://african.business/news/digital-trade",
      sourcePublishedAt,
      sourceEvidence: {
        origin: "integration-fixture",
        canonicalUrl: "https://african.business/news/digital-trade",
        sourcePublishedAt,
        excerpt: intelligenceExcerpt,
        timestampField: "sourcePublishedAt",
        supported: true,
        disagreements: [],
      },
    }];
  },
  async collectBlog() {
    const excerpt =
      "African infrastructure investors are adapting financing models to AfCFTA trade and regional development priorities.";
    return [{
      title: "African infrastructure financing enters a new phase",
      summary: excerpt,
      author: "Axis Research",
      tag: "African development",
      url: "https://medium.com/@axis/african-infrastructure-financing",
      sourcePublishedAt,
      sourceEvidence: {
        origin: "integration-fixture",
        canonicalUrl:
          "https://medium.com/@axis/african-infrastructure-financing",
        sourcePublishedAt,
        excerpt,
        timestampField: "sourcePublishedAt",
        supported: true,
        disagreements: [],
      },
    }];
  },
};
const integratedDatasets: string[] = [];
const integrated = await runIntelligenceIngestion({
  adapter: sharedAdapter,
  commodityAdapter: completeMock.adapter,
  persist: async (dataset, decisions) => {
    integratedDatasets.push(dataset);
    return {
      published: decisions.filter((item) => item.decision === "publish").length,
      quarantined: decisions.filter((item) => item.decision === "quarantine")
        .length,
      auditRecorded: decisions.length,
      trustStorageAvailable: true,
      warnings: [],
      errors: [],
    };
  },
  intelligenceSources: [{
    name: "African Business Magazine",
    url: "https://african.business/",
  }],
  blogSources: [{
    name: "Medium Africa",
    url: "https://medium.com/tag/africa/recommended",
    rssUrl: "https://medium.com/feed/tag/africa",
  }],
  now,
  deadlineAt: Date.now() + 1_000,
});
assert.equal(integrated.success, true);
assert.equal(integrated.commodity?.trustedCoverage.records, 5);
assert.deepEqual(integratedDatasets.sort(), [
  "blog",
  "commodity",
  "intelligence",
]);

let persistenceStarts = 0;
let postDeadlineWrites = 0;
await assert.rejects(
  runIntelligenceIngestion({
    adapter: sharedAdapter,
    commodityAdapter: completeMock.adapter,
    persist: async (
      _dataset,
      _decisions: readonly AtomicPublicationDecision[],
      signal,
    ) => {
      persistenceStarts += 1;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
      signal.throwIfAborted();
      postDeadlineWrites += 1;
      return {
        published: 0,
        quarantined: 0,
        auditRecorded: 0,
        trustStorageAvailable: true,
        warnings: [],
        errors: [],
      };
    },
    intelligenceSources: [{
      name: "African Business Magazine",
      url: "https://african.business/",
    }],
    blogSources: [{
      name: "Medium Africa",
      url: "https://medium.com/tag/africa/recommended",
      rssUrl: "https://medium.com/feed/tag/africa",
    }],
    now,
    deadlineAt: Date.now() + 30,
  }),
  /deadline exhausted/,
);
assert.equal(persistenceStarts, 3);
assert.equal(postDeadlineWrites, 0);
await new Promise((resolve) => setTimeout(resolve, 110));
assert.equal(postDeadlineWrites, 0);

console.log(
  "Commodity ingestion fixtures passed (5/5, partial, newest, anomalies, shared orchestration, abort settlement).",
);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
