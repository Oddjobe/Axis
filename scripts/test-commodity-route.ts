import assert from "node:assert/strict";

import {
  buildRecord,
  getCommodityTimestamps,
  indexNewestCommodityRows,
  isFreshTrustedCommodityRow,
} from "../src/app/api/commodities/route";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";

const fallbackTimestamp = "2024-01-01T00:00:00.000Z";
assert.equal(COMMODITY_IDS.length, 5);

assert.deepEqual(
  getCommodityTimestamps(
    {
      sourcePublishedAt: "2026-07-15T08:00:00.000Z",
      trustedPublishedAt: "2026-07-15T09:00:00.000Z",
      retrievedAt: "2026-07-15T10:00:00.000Z",
      source_updated_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-02T00:00:00.000Z",
    },
    fallbackTimestamp,
  ),
  {
    sourceUpdatedAt: "2026-07-15T08:00:00.000Z",
    observedAt: "2026-07-15T08:00:00.000Z",
  },
);

assert.deepEqual(
  getCommodityTimestamps(
    {
      trustedPublishedAt: "2026-07-15T09:00:00.000Z",
      source_updated_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-02T00:00:00.000Z",
    },
    fallbackTimestamp,
  ),
  {
    sourceUpdatedAt: "2025-01-01T00:00:00.000Z",
    observedAt: fallbackTimestamp,
  },
);

assert.deepEqual(
  getCommodityTimestamps(
    {
      sourceUpdatedAt: "2026-07-14T08:00:00.000Z",
      observedAt: "2026-07-14T09:00:00.000Z",
      source_updated_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-02T00:00:00.000Z",
    },
    fallbackTimestamp,
  ),
  {
    sourceUpdatedAt: "2026-07-14T08:00:00.000Z",
    observedAt: "2026-07-14T09:00:00.000Z",
  },
);

assert.deepEqual(
  getCommodityTimestamps(
    {
      source_published_at: "2026-07-13T08:00:00.000Z",
      updated_at: "2026-07-13T09:00:00.000Z",
    },
    fallbackTimestamp,
  ),
  {
    sourceUpdatedAt: "2026-07-13T08:00:00.000Z",
    observedAt: "2026-07-13T08:00:00.000Z",
  },
);

const newestRows = indexNewestCommodityRows([
  {
    id: "cobalt",
    price: 59_000,
    sourcePublishedAt: "2026-07-15T09:00:00.000Z",
  },
  {
    id: "cobalt",
    price: 61_000,
    sourcePublishedAt: "2026-07-16T09:00:00.000Z",
  },
  {
    id: "GOLD",
    price: 4_725,
    sourcePublishedAt: "2026-07-16T08:00:00.000Z",
  },
]);
assert.equal(newestRows.size, 2);
assert.equal(newestRows.get("cobalt")?.price, 61_000);
const tieBreakRows = indexNewestCommodityRows([
  {
    id: "cobalt",
    price: 60_050,
    sourcePublishedAt: "2026-07-16T10:00:00.000Z",
    trustedPublishedAt: "2026-07-16T12:00:00.000Z",
  },
  {
    id: "cobalt",
    price: 61_000,
    sourcePublishedAt: "2026-07-16T10:00:00.000Z",
    trustedPublishedAt: "2026-07-16T13:00:00.000Z",
  },
]);
assert.equal(tieBreakRows.get("cobalt")?.price, 61_000);
assert.equal(newestRows.get("gold")?.id, "gold");
assert.equal(
  indexNewestCommodityRows([
    { id: "oil", sourcePublishedAt: "2026-07-16T09:00:00.000Z" },
  ]).size,
  0,
);
assert.equal(
  isFreshTrustedCommodityRow(
    { sourcePublishedAt: "2026-07-16T09:00:00.000Z" },
    Date.parse("2026-07-17T09:00:00.000Z"),
  ),
  true,
);
assert.equal(
  isFreshTrustedCommodityRow(
    { sourcePublishedAt: "2026-07-18T09:00:00.000Z" },
    Date.parse("2026-07-17T09:00:00.000Z"),
  ),
  false,
);
assert.equal(
  isFreshTrustedCommodityRow(
    { sourcePublishedAt: "2026-07-01T09:00:00.000Z" },
    Date.parse("2026-07-17T09:00:00.000Z"),
  ),
  false,
);
const trustedWithoutTrend = buildRecord(
  {
    id: "cobalt",
    name: "Cobalt",
    price: 1,
    unit: "MT",
    currency: "USD",
    trend: 99,
    source: "Legacy",
    sourceUrl: "https://legacy.example.com",
    lastUpdated: "2024-01-01",
    frequency: "daily",
    category: "Strategic Mineral",
    color: "#000",
  },
  {
    id: "cobalt",
    price: 60_050,
    source: "Trading Economics",
    sourceUrl: "https://tradingeconomics.com/commodity/cobalt",
    sourcePublishedAt: "2026-07-16T09:00:00.000Z",
    retrievedAt: "2026-07-16T10:00:00.000Z",
  },
  true,
);
assert.equal(trustedWithoutTrend.trend, null);
assert.equal(trustedWithoutTrend.fallbackUsed, false);
assert.equal(trustedWithoutTrend.publicationTier, "trusted");
assert.equal(
  trustedWithoutTrend.provenance.retrievedAt,
  "2026-07-16T10:00:00.000Z",
);

console.log(
  "Commodity route fixtures passed (trusted timestamps and newest-first versions are preserved).",
);
