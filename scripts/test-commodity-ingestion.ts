import assert from "node:assert/strict";

import {
  createCommodityFirecrawlAdapter,
  parseEcbDailyReferenceRates,
} from "../src/lib/intelligence/ingestion/commodity-adapter.server";
import { runCommodityIngestion } from "../src/lib/intelligence/ingestion/commodity-runner.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import {
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
    canonicalUrl: source.url,
    excerpt: `Published ${source.id} benchmark quote for ${source.market} from the cited public market page.`,
    confidence: 0.9,
    ...overrides,
  };
}

function mockedAdapter(
  fixtures: FixtureFactory,
  failedIds: readonly CommodityId[] = [],
  fx: { status?: number; xml?: string } = {},
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
    return new Response(
      JSON.stringify({
        success: true,
        data: { extract: { quotes: fixtures(source) } },
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

const copperSource = COMMODITY_SOURCES.find((source) => source.id === "copper");
assert(copperSource);
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

const lithiumSource = COMMODITY_SOURCES.find((source) => source.id === "lithium");
assert(lithiumSource);
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
]);
const invalidTimes = await runCommodityIngestion({
  adapter: timeMock.adapter,
  now,
});
assert.deepEqual(invalidTimes.trustedCoverage.missingIds, ["lithium", "cobalt"]);
assert.equal(invalidTimes.quality.rejectionReasons.stale_timestamp, 1);
assert.equal(invalidTimes.quality.rejectionReasons.future_timestamp, 1);

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
);
const duplicates = await runCommodityIngestion({
  adapter: duplicateMock.adapter,
  now,
});
assert.equal(duplicates.publicationTier, "trusted");
assert.equal(duplicates.quality.rejectionReasons.duplicate_candidate, 1);
const acceptedLithium = duplicates.decisions.find(
  (item) =>
    item.decision === "publish" && item.normalized?.id === "lithium",
);
assert.equal(acceptedLithium?.normalized?.price, 198_500 * (1.16 / 8.2));

const anomalyMock = mockedAdapter((source) => {
  const overrides: Record<CommodityId, Fixture> = {
    lithium: { price: 1 },
    cobalt: { price: 100_000 },
    copper: { currency: "EUR" },
    gold: { unit: "KG" },
    bauxite: { confidence: 0.8 },
  };
  return [quote(source, overrides[source.id])];
});
const anomalies = await runCommodityIngestion({
  adapter: anomalyMock.adapter,
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
