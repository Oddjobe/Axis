import assert from "node:assert/strict";

import {
  getCommodityTimestamps,
  indexNewestCommodityRows,
} from "../src/app/api/commodities/route";

const fallbackTimestamp = "2024-01-01T00:00:00.000Z";

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
    observedAt: "2026-07-15T09:00:00.000Z",
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
    sourceUpdatedAt: "2026-07-15T09:00:00.000Z",
    observedAt: "2026-07-15T09:00:00.000Z",
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
    observedAt: "2026-07-13T09:00:00.000Z",
  },
);

const newestRows = indexNewestCommodityRows([
  {
    id: "cobalt",
    price: 61_000,
    sourcePublishedAt: "2026-07-16T09:00:00.000Z",
  },
  {
    id: "gold",
    price: 4_725,
    sourcePublishedAt: "2026-07-16T08:00:00.000Z",
  },
  {
    id: "cobalt",
    price: 59_000,
    sourcePublishedAt: "2026-07-15T09:00:00.000Z",
  },
]);
assert.equal(newestRows.size, 2);
assert.equal(newestRows.get("cobalt")?.price, 61_000);

console.log(
  "Commodity route fixtures passed (trusted timestamps and newest-first versions are preserved).",
);
