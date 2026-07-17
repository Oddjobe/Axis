import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommodityAdapter } from "../src/lib/intelligence/ingestion/commodity-adapter.server";
import {
  commodityHistorySummary,
  loadPreviousCommodityPrices,
} from "../src/lib/intelligence/ingestion/commodity-history.server";
import { runCommodityIngestion } from "../src/lib/intelligence/ingestion/commodity-runner.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import {
  COMMODITY_IDS,
  COMMODITY_SOURCES,
  type CommodityId,
  type CommoditySource,
} from "../src/lib/intelligence/ingestion/commodity-sources";
import type { IngestionAdapter } from "../src/lib/intelligence/ingestion/types";

const now = new Date("2026-07-17T00:00:00.000Z");
const prices: Record<CommodityId, number> = {
  lithium: 28_113,
  cobalt: 60_050,
  copper: 12_773,
  gold: 4_725,
  bauxite: 60.99,
};

interface QueryCall {
  method: string;
  args: unknown[];
}

function mockClient(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  return {
    client: {
      from(relation: string) {
        calls.push({ method: "from", args: [relation] });
        const filters: Array<[string, unknown]> = [];
        const orders: Array<[string, { ascending?: boolean }]> = [];
        const query = {
          select(...args: unknown[]) {
            calls.push({ method: "select", args });
            return query;
          },
          eq(...args: unknown[]) {
            calls.push({ method: "eq", args });
            filters.push([String(args[0]), args[1]]);
            return query;
          },
          order(...args: unknown[]) {
            calls.push({ method: "order", args });
            orders.push([
              String(args[0]),
              (args[1] as { ascending?: boolean } | undefined) ?? {},
            ]);
            return query;
          },
          abortSignal(...args: unknown[]) {
            calls.push({ method: "abortSignal", args });
            return query;
          },
          range(...args: unknown[]) {
            calls.push({ method: "range", args });
            if (!Array.isArray(result.data)) {
              return Promise.resolve(result);
            }
            let rows = [...result.data] as Array<Record<string, unknown>>;
            for (const [column, expected] of filters) {
              if (column === "dataset") {
                rows = rows.filter((row) => row.dataset === expected);
              } else if (column === "record->>id") {
                rows = rows.filter(
                  (row) =>
                    (row.record as Record<string, unknown> | undefined)?.id ===
                    expected,
                );
              }
            }
            rows.sort((left, right) => {
              for (const [column, options] of orders) {
                const leftValue = Date.parse(String(left[column] ?? ""));
                const rightValue = Date.parse(String(right[column] ?? ""));
                const difference = leftValue - rightValue;
                if (difference !== 0) {
                  return options.ascending ? difference : -difference;
                }
              }
              return 0;
            });
            const from = Number(args[0]);
            const to = Number(args[1]);
            return Promise.resolve({
              data: rows.slice(from, to + 1),
              error: result.error,
            });
          },
        };
        return query;
      },
    } as unknown as SupabaseClient,
    calls,
  };
}

function historyRow(
  id: CommodityId,
  price: number | string,
  publishedAt = "2026-07-16T12:00:00.000Z",
  sourcePublishedAt = "2026-07-16T10:00:00.000Z",
  recordOverrides: Record<string, unknown> = {},
) {
  const source = COMMODITY_SOURCES.find((candidate) => candidate.id === id);
  assert(source);
  return {
    dataset: "commodity",
    record: {
      dataset: "commodity",
      id,
      commodityId: id,
      price,
      publisher: source.publisher,
      sourceMarket: source.market,
      canonicalUrl: source.url,
      ...recordOverrides,
    },
    source_published_at: sourcePublishedAt,
    published_at: publishedAt,
  };
}

function quote(
  source: CommoditySource,
  price = prices[source.id],
  sourcePublishedAt = "2026-07-16T12:00:00.000Z",
) {
  return {
    commodityId: source.id,
    price,
    unit: source.unit,
    currency: source.currency,
    sourceMarket: source.market,
    sourcePublishedAt,
    publisher: source.publisher,
    canonicalUrl: source.url,
    excerpt: `Published ${source.id} benchmark quote for ${source.market} from the cited public market page.`,
    confidence: 0.9,
  };
}

async function main(): Promise<void> {
const loadedMock = mockClient({
  data: COMMODITY_IDS.map((id) =>
    historyRow(id, id === "cobalt" ? "$60,050" : prices[id]),
  ),
  error: null,
});
const historySignal = new AbortController().signal;
const loaded = await loadPreviousCommodityPrices(loadedMock.client, {
  signal: historySignal,
});
assert.deepEqual(
  loadedMock.calls.find((call) => call.method === "abortSignal")?.args,
  [historySignal],
);
assert.equal(loaded.status, "loaded");
assert.equal(loaded.historyUnavailable, false);
assert.deepEqual(loaded.loadedIds, [...COMMODITY_IDS]);
assert.equal(loaded.previousCommodityPrices.cobalt, 60_050);
assert.equal(
  loaded.previousCommoditySourcePublishedAt.cobalt,
  "2026-07-16T10:00:00.000Z",
);
assert.equal(
  loaded.previousCommodityPublishedAt.cobalt,
  "2026-07-16T12:00:00.000Z",
);
assert.deepEqual(loadedMock.calls[0], {
  method: "from",
  args: ["trusted_published_records"],
});
assert(
  loadedMock.calls.some(
    (call) =>
      call.method === "eq" &&
      call.args[0] === "dataset" &&
      call.args[1] === "commodity",
  ),
);
assert.equal(
  loadedMock.calls.filter(
    (call) =>
      call.method === "eq" &&
      call.args[0] === "record->>id" &&
      COMMODITY_IDS.includes(call.args[1] as CommodityId),
  ).length,
  COMMODITY_IDS.length,
);
assert.equal(
  loadedMock.calls.filter(
    (call) =>
      call.method === "order" &&
      call.args[0] === "source_published_at",
  ).length,
  COMMODITY_IDS.length,
);

const duplicateMock = mockClient({
  data: [
    historyRow(
      "cobalt",
      "80,000",
      "2026-07-17T12:00:00.000Z",
      "2026-07-15T10:00:00.000Z",
    ),
    ...COMMODITY_IDS.map((id) =>
      historyRow(id, prices[id], "2026-07-16T12:00:00.000Z"),
    ),
  ],
  error: null,
});
const deduplicated = await loadPreviousCommodityPrices(duplicateMock.client);
assert.equal(deduplicated.status, "loaded");
assert.equal(deduplicated.previousCommodityPrices.cobalt, 60_050);
assert.equal(deduplicated.duplicateRowsIgnored, 0);
assert.equal(
  deduplicated.previousCommoditySourcePublishedAt.cobalt,
  "2026-07-16T10:00:00.000Z",
);
assert.equal(
  deduplicated.previousCommodityPublishedAt.cobalt,
  "2026-07-16T12:00:00.000Z",
);

const tieBreakMock = mockClient({
  data: [
    historyRow(
      "cobalt",
      60_050,
      "2026-07-16T12:00:00.000Z",
      "2026-07-16T10:00:00.000Z",
    ),
    historyRow(
      "cobalt",
      61_000,
      "2026-07-16T13:00:00.000Z",
      "2026-07-16T10:00:00.000Z",
    ),
    ...COMMODITY_IDS.filter((id) => id !== "cobalt").map((id) =>
      historyRow(id, prices[id]),
    ),
  ],
  error: null,
});
const tieBreak = await loadPreviousCommodityPrices(tieBreakMock.client);
assert.equal(tieBreak.previousCommodityPrices.cobalt, 61_000);
assert.equal(
  tieBreak.previousCommoditySourcePublishedAt.cobalt,
  "2026-07-16T10:00:00.000Z",
);
assert.equal(
  tieBreak.previousCommodityPublishedAt.cobalt,
  "2026-07-16T13:00:00.000Z",
);

const obsoleteBauxite = await loadPreviousCommodityPrices(
  mockClient({
    data: [
      historyRow(
        "bauxite",
        99,
        "2026-07-17T12:00:00.000Z",
        "2026-07-17T10:00:00.000Z",
        {
          publisher: "S&P Global Platts / IndexBox",
          sourceMarket: "Guinea bauxite FOB",
          canonicalUrl: "https://www.spglobal.com/commodityinsights/",
        },
      ),
      ...COMMODITY_IDS.map((id) => historyRow(id, prices[id])),
    ],
    error: null,
  }).client,
);
assert.equal(obsoleteBauxite.status, "loaded");
assert.equal(obsoleteBauxite.previousCommodityPrices.bauxite, prices.bauxite);
assert.equal(
  obsoleteBauxite.previousCommoditySourcePublishedAt.bauxite,
  "2026-07-16T10:00:00.000Z",
);

const bootstrap = await loadPreviousCommodityPrices(
  mockClient({ data: [], error: null }).client,
);
assert.deepEqual(
  {
    status: bootstrap.status,
    bootstrap: bootstrap.bootstrap,
    historyUnavailable: bootstrap.historyUnavailable,
    viewAvailable: bootstrap.viewAvailable,
  },
  {
    status: "bootstrap",
    bootstrap: true,
    historyUnavailable: true,
    viewAvailable: true,
  },
);

const partialBootstrap = await loadPreviousCommodityPrices(
  mockClient({
    data: [historyRow("cobalt", prices.cobalt)],
    error: null,
  }).client,
);
assert.equal(partialBootstrap.status, "bootstrap");
assert.equal(partialBootstrap.historyUnavailable, false);
assert.deepEqual(partialBootstrap.loadedIds, ["cobalt"]);
assert.deepEqual(
  partialBootstrap.missingIds,
  COMMODITY_IDS.filter((id) => id !== "cobalt"),
);
assert.equal(partialBootstrap.previousCommodityPrices.cobalt, prices.cobalt);

const permissionFailure = await loadPreviousCommodityPrices(
  mockClient({
    data: null,
    error: { code: "42501", message: "permission denied for view" },
  }).client,
);
assert.equal(permissionFailure.status, "failed");
assert.equal(permissionFailure.viewAvailable, false);
assert.match(permissionFailure.error ?? "", /42501.*permission denied/);

const schemaFailure = await loadPreviousCommodityPrices(
  mockClient({
    data: COMMODITY_IDS.map((id) =>
      historyRow(id, id === "cobalt" ? "not-a-price" : prices[id]),
    ),
    error: null,
  }).client,
);
assert.equal(schemaFailure.status, "failed");
assert.equal(schemaFailure.viewAvailable, true);
assert.match(schemaFailure.error ?? "", /schema failed.*positive number/);

let failedHistoryCollectionCalls = 0;
const adapter: CommodityAdapter = {
  async collectCommodity(source) {
    failedHistoryCollectionCalls += 1;
    return [quote(source)];
  },
};
const failedLane = await runCommodityIngestion({
  adapter,
  now,
  history: commodityHistorySummary(permissionFailure),
});
assert.equal(failedLane.success, false);
assert.equal(failedLane.partialSuccess, false);
assert.equal(failedLane.quality.sourceFailureCount, 5);
assert.equal(failedLane.quality.rejectionReasons.history_unavailable, 1);
assert.equal(failedHistoryCollectionCalls, 0);

const unusedContentAdapter: IngestionAdapter = {
  async collectIntelligence() {
    throw new Error("No intelligence sources should be invoked.");
  },
  async collectBlog() {
    throw new Error("No blog sources should be invoked.");
  },
};
const orchestratedFailure = await runIntelligenceIngestion({
  adapter: unusedContentAdapter,
  commodityAdapter: adapter,
  commodityHistory: commodityHistorySummary(permissionFailure),
  previousCommodityPrices: permissionFailure.previousCommodityPrices,
  previousCommoditySourcePublishedAt:
    permissionFailure.previousCommoditySourcePublishedAt,
  intelligenceSources: [],
  blogSources: [],
  now,
  persist: async () => ({
    published: 0,
    quarantined: 0,
    auditRecorded: 0,
    trustStorageAvailable: true,
    warnings: [],
    errors: [],
  }),
});
assert.equal(orchestratedFailure.success, false);
assert.equal(orchestratedFailure.commodity?.history?.status, "failed");
assert.equal(orchestratedFailure.intelligence.errors.length, 0);
assert.equal(orchestratedFailure.blog.errors.length, 0);
assert.equal(failedHistoryCollectionCalls, 0);

const bootstrapLane = await runCommodityIngestion({
  adapter,
  now,
  previousPrices: bootstrap.previousCommodityPrices,
  previousSourcePublishedAt: bootstrap.previousCommoditySourcePublishedAt,
  history: commodityHistorySummary(bootstrap),
});
assert.equal(bootstrapLane.success, true);
assert.equal(bootstrapLane.history?.status, "bootstrap");
assert.equal(bootstrapLane.history?.bootstrap, true);
assert.equal(bootstrapLane.history?.historyUnavailable, true);

const anomalousCobaltAdapter: CommodityAdapter = {
  async collectCommodity(source) {
    return [quote(source, source.id === "cobalt" ? 100_000 : prices[source.id])];
  },
};
const anomaly = await runCommodityIngestion({
  adapter: anomalousCobaltAdapter,
  now,
  previousPrices: loaded.previousCommodityPrices,
  previousSourcePublishedAt: loaded.previousCommoditySourcePublishedAt,
  history: commodityHistorySummary(loaded),
});
const cobalt = anomaly.decisions.find(
  (decision) => decision.normalized?.id === "cobalt",
);
assert.equal(cobalt?.decision, "quarantine");
assert(
  cobalt?.reasons.some(
    (reason) => reason.commodityCode === "implausible_price_change",
  ),
);
assert.deepEqual(anomaly.trustedCoverage.missingIds, ["cobalt"]);

const olderCobaltAdapter: CommodityAdapter = {
  async collectCommodity(source) {
    return [
      quote(
        source,
        source.id === "cobalt" ? 80_000 : prices[source.id],
        source.id === "cobalt"
          ? "2026-07-15T12:00:00.000Z"
          : "2026-07-16T12:00:00.000Z",
      ),
    ];
  },
};
const older = await runCommodityIngestion({
  adapter: olderCobaltAdapter,
  now,
  previousPrices: loaded.previousCommodityPrices,
  previousSourcePublishedAt: loaded.previousCommoditySourcePublishedAt,
  history: commodityHistorySummary(loaded),
});
const olderCobalt = older.decisions.find(
  (decision) => decision.normalized?.id === "cobalt",
);
assert.equal(olderCobalt?.decision, "quarantine");
assert(
  olderCobalt?.reasons.some(
    (reason) => reason.commodityCode === "older_than_trusted_source",
  ),
);
assert(
  !olderCobalt?.reasons.some(
    (reason) => reason.commodityCode === "implausible_price_change",
  ),
);

console.log(
  "Commodity history fixtures passed (loaded, current-policy selection, normalized prices, labeled bootstrap, query failure, anomaly quarantine).",
);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
