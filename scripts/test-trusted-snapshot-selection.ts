import assert from "node:assert/strict";

import {
  recordRetrievalTimestamp,
  selectLatestCurrentTrustedRecord,
  trustedPublicationSelectionEnabled,
  trustedRecordMatchesCurrentPolicy,
  trustedSnapshotUnavailable,
} from "../src/lib/intelligence/publication-selection.server";

const previous = process.env.TRUSTED_PUBLICATIONS_ENABLED;

try {
  delete process.env.TRUSTED_PUBLICATIONS_ENABLED;
  assert.equal(trustedPublicationSelectionEnabled(), false);
  assert.equal(trustedSnapshotUnavailable(null), false);
  assert.equal(trustedSnapshotUnavailable([]), false);

  process.env.TRUSTED_PUBLICATIONS_ENABLED = "true";
  assert.equal(trustedPublicationSelectionEnabled(), true);
  assert.equal(trustedSnapshotUnavailable(null), true);
  assert.equal(trustedSnapshotUnavailable([]), true);
  assert.equal(
    trustedSnapshotUnavailable([
      {
        publicationTier: "trusted",
        sourcePublishedAt: "2025-01-01T00:00:00.000Z",
      },
    ]),
    false,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("intelligence", {
      source: "African Business Magazine",
      canonicalUrl: "https://african.business/news/current",
    }),
    true,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("intelligence", {
      source: "Google News Geopolitics",
      canonicalUrl: "https://news.google.com/read/obsolete",
    }),
    false,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("blog", {
      source: "Medium Africa",
      canonicalUrl: "https://medium.com/tag/africa",
    }),
    false,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("intelligence", {
      source: "ISS Africa Today",
      canonicalUrl: "https://issafrica.org/iss-today/current",
    }),
    false,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("blog", {
      source: "African Business Magazine",
      canonicalUrl: "https://african.business/current",
    }),
    false,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("commodity", {
      id: "bauxite",
      publisher: "AluHub",
      sourceMarket: "guinea bauxite fob",
      canonicalUrl: "https://alu-hub.com/market-data",
    }),
    true,
  );
  assert.equal(
    trustedRecordMatchesCurrentPolicy("commodity", {
      id: "bauxite",
      publisher: "S&P Global Platts / IndexBox",
      sourceMarket: "Guinea bauxite FOB",
      canonicalUrl: "https://www.spglobal.com/commodityinsights/",
    }),
    false,
  );
  assert.deepEqual(
    selectLatestCurrentTrustedRecord("commodity", [
      {
        id: "bauxite",
        publisher: "S&P Global Platts / IndexBox",
        sourceMarket: "Guinea bauxite FOB",
        canonicalUrl: "https://www.spglobal.com/commodityinsights/",
        sourcePublishedAt: "2026-07-17T09:00:00.000Z",
        price: 61,
      },
      {
        id: "bauxite",
        publisher: "AluHub",
        sourceMarket: "Guinea bauxite FOB",
        canonicalUrl: "https://www.alu-hub.com/market-data",
        sourcePublishedAt: "2026-07-16T09:00:00.000Z",
        price: 60,
      },
    ]),
    {
      id: "bauxite",
      publisher: "AluHub",
      sourceMarket: "Guinea bauxite FOB",
      canonicalUrl: "https://www.alu-hub.com/market-data",
      sourcePublishedAt: "2026-07-16T09:00:00.000Z",
      price: 60,
    },
  );
  assert.equal(
    recordRetrievalTimestamp({
      retrievedAt: "2026-07-17T10:00:00.000Z",
      created_at: "2026-07-17T11:00:00.000Z",
      sourcePublishedAt: "2026-07-17T09:00:00.000Z",
    }),
    "2026-07-17T10:00:00.000Z",
  );
  assert.equal(
    recordRetrievalTimestamp({
      created_at: "2026-07-17T11:00:00.000Z",
      sourcePublishedAt: "2026-07-17T09:00:00.000Z",
    }),
    "2026-07-17T11:00:00.000Z",
  );
  assert.equal(
    recordRetrievalTimestamp({
      sourcePublishedAt: "2026-07-17T09:00:00.000Z",
      trustedPublishedAt: "2026-07-17T12:00:00.000Z",
    }),
    null,
  );
} finally {
  if (previous === undefined) {
    delete process.env.TRUSTED_PUBLICATIONS_ENABLED;
  } else {
    process.env.TRUSTED_PUBLICATIONS_ENABLED = previous;
  }
}

console.log(
  "Trusted snapshot selection fixtures passed (disabled fallback, enabled fail-closed, stale trusted retention).",
);
