import assert from "node:assert/strict";

import { AFRICAN_ISO3_CODES } from "../src/lib/intelligence/trust";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";

type JsonRecord = Record<string, unknown>;
type PublicationMode = "enforce" | "shadow";

interface LivePayloads {
  health: JsonRecord;
  scores: JsonRecord;
  commodities: JsonRecord;
  intelligence: JsonRecord;
  blogs: JsonRecord;
}

const PUBLICATION_TIERS = new Set(["trusted", "mixed", "legacy"]);
const CURRENT_DATA_MODES = new Set(["live", "cached", "current"]);

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Endpoint returned a non-object payload.");
  }
  return value as JsonRecord;
}

function rowsAt(payload: JsonRecord, field: string, endpoint: string): JsonRecord[] {
  const rows = payload[field];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Live ${endpoint} endpoint returned no usable rows.`);
  }
  return rows.map(record);
}

function publicationMode(value: string | undefined): PublicationMode {
  const configured = value || "enforce";
  if (configured === "enforce" || configured === "trusted") return "enforce";
  if (configured === "shadow" || configured === "pre-promotion") return "shadow";
  throw new Error(
    "QUALITY_PUBLICATION_MODE must be enforce/trusted or shadow/pre-promotion.",
  );
}

function requirePublicationLabel(
  payload: JsonRecord,
  rows: JsonRecord[],
  endpoint: string,
): void {
  if (!PUBLICATION_TIERS.has(String(payload.publicationTier))) {
    throw new Error(
      `Live ${endpoint} endpoint must label publicationTier as trusted, mixed, or legacy.`,
    );
  }
  if (
    rows.some((row) => !PUBLICATION_TIERS.has(String(row.publicationTier)))
  ) {
    throw new Error(
      `Live ${endpoint} endpoint has rows without an explicit publication tier.`,
    );
  }
}

function requireCurrentTrustedPayload(
  payload: JsonRecord,
  rows: JsonRecord[],
  endpoint: string,
): void {
  if (payload.publicationTier !== "trusted") {
    throw new Error(
      `Live ${endpoint} endpoint publication tier is ${String(payload.publicationTier)}, not trusted.`,
    );
  }
  if (!CURRENT_DATA_MODES.has(String(payload.dataMode))) {
    throw new Error(
      `Live ${endpoint} endpoint is ${String(payload.dataMode)}; current data is required.`,
    );
  }
  if (!payload.asOf) {
    throw new Error(`Live ${endpoint} endpoint omitted freshness metadata.`);
  }
  if (payload.fallbackUsed !== false) {
    throw new Error(`Live ${endpoint} endpoint used fallback records.`);
  }
  if (
    rows.some(
      (row) =>
        row.publicationTier !== "trusted" ||
        !CURRENT_DATA_MODES.has(String(row.dataMode)) ||
        row.fallbackUsed === true,
    )
  ) {
    throw new Error(
      `Live ${endpoint} endpoint includes untrusted, stale, or fallback rows.`,
    );
  }
}

function validateScores(scores: JsonRecord, mode: PublicationMode): void {
  const scoreRows = rowsAt(scores, "countries", "score");
  if (scoreRows.length !== 54 || Number(scores.count) !== 54) {
    throw new Error("Live score endpoint does not expose 54 countries.");
  }
  const scoreCodes = scoreRows.map((row) => String(row.country));
  if (
    new Set(scoreCodes).size !== 54 ||
    scoreCodes.some((code) => !AFRICAN_ISO3_CODES.includes(code as never))
  ) {
    throw new Error("Live score endpoint has invalid or duplicate ISO-3 codes.");
  }
  requirePublicationLabel(scores, scoreRows, "score");
  if (mode === "enforce") {
    requireCurrentTrustedPayload(scores, scoreRows, "score");
  }
}

function validateCommodities(
  commodities: JsonRecord,
  mode: PublicationMode,
): void {
  const commodityRows = rowsAt(commodities, "data", "commodities");
  requirePublicationLabel(commodities, commodityRows, "commodities");

  const ids = commodityRows.map((row) => String(row.id));
  if (new Set(ids).size !== ids.length) {
    throw new Error("Live commodities endpoint has duplicate commodity IDs.");
  }

  const coverage = record(commodities.trustedCoverage);
  const records = Number(coverage.records);
  const total = Number(coverage.total);
  const ratio = Number(coverage.ratio);
  if (
    total !== COMMODITY_IDS.length ||
    commodityRows.length !== total ||
    !Number.isInteger(records) ||
    records < 0 ||
    records > total ||
    !Number.isFinite(ratio)
  ) {
    throw new Error("Live commodities endpoint has invalid coverage metadata.");
  }

  if (mode === "enforce") {
    requireCurrentTrustedPayload(commodities, commodityRows, "commodities");
    if (
      commodities.coverageMode !== "trusted" ||
      records !== total ||
      ratio !== 1
    ) {
      throw new Error(
        `Live commodities endpoint trusted coverage is ${records}/${total}; complete coverage is required.`,
      );
    }
  } else if (
    !["trusted", "partial", "legacy"].includes(
      String(commodities.coverageMode),
    )
  ) {
    throw new Error(
      "Live commodities shadow endpoint must explicitly label its coverage mode.",
    );
  }
}

function validateFeed(payload: JsonRecord, name: string): void {
  rowsAt(payload, "data", name);
  if (!payload.dataMode || !payload.asOf) {
    throw new Error(`Live ${name} endpoint omitted freshness metadata.`);
  }
  if (payload.dataMode === "stale" || payload.dataMode === "fallback") {
    throw new Error(
      `Live ${name} endpoint is ${String(payload.dataMode)}; current data is required.`,
    );
  }
  if (payload.dataMode !== "live") {
    throw new Error(
      `Live ${name} endpoint is ${String(payload.dataMode)}, not live.`,
    );
  }
  if (payload.fallbackUsed !== false) {
    throw new Error(`Live ${name} endpoint used fallback records.`);
  }
}

export function validateLiveQuality(
  payloads: LivePayloads,
  mode: PublicationMode,
): void {
  const { health, scores, commodities, intelligence, blogs } = payloads;
  validateScores(scores, mode);
  validateCommodities(commodities, mode);

  if (health.status !== "healthy") {
    throw new Error(`Internal health is ${String(health.status)}, not healthy.`);
  }
  const storage = record(health.storage);
  if (storage.status !== "healthy") {
    throw new Error(`Trust storage is ${String(storage.status)}, not healthy.`);
  }
  const sourceHealth = Array.isArray(storage.sources) ? storage.sources : [];
  if (
    sourceHealth.length === 0 ||
    sourceHealth.some((source) => record(source).status !== "current")
  ) {
    throw new Error("Trust storage has missing or stale source evidence.");
  }
  const quality = record(health.quality);
  if (quality.status !== "pass") {
    throw new Error(`Deterministic health quality is ${String(quality.status)}.`);
  }

  validateFeed(intelligence, "intelligence");
  validateFeed(blogs, "blogs");
  if (mode === "enforce") {
    for (const [name, payload] of [
      ["intelligence", intelligence],
      ["blogs", blogs],
    ] as const) {
      if (payload.publicationTier !== "trusted") {
        throw new Error(
          `Live ${name} endpoint publication tier is ${String(payload.publicationTier)}, not trusted.`,
        );
      }
    }
  }
}

async function jsonAt(baseUrl: string, path: string): Promise<JsonRecord> {
  const url = new URL(path, baseUrl);
  url.searchParams.set("_quality", String(Date.now()));
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  return record(await response.json());
}

function fixturePayloads(tier: "trusted" | "legacy"): LivePayloads {
  const trusted = tier === "trusted";
  const dataMode = trusted ? "live" : "fallback";
  const fallbackUsed = !trusted;
  const asOf = "2026-07-16T12:00:00.000Z";
  const scoreRows = AFRICAN_ISO3_CODES.map((country) => ({
    country,
    publicationTier: tier,
    dataMode,
  }));
  const commodityRows = COMMODITY_IDS.map((id) => ({
    id,
    publicationTier: tier,
    dataMode,
    fallbackUsed,
  }));
  return {
    health: {
      status: "healthy",
      storage: {
        status: "healthy",
        sources: [{ dataset: "fixture", status: "current" }],
      },
      quality: { status: "pass" },
    },
    scores: {
      countries: scoreRows,
      count: scoreRows.length,
      publicationTier: tier,
      dataMode,
      fallbackUsed,
      asOf,
    },
    commodities: {
      data: commodityRows,
      publicationTier: tier,
      coverageMode: trusted ? "trusted" : "legacy",
      trustedCoverage: {
        records: trusted ? commodityRows.length : 0,
        total: commodityRows.length,
        ratio: trusted ? 1 : 0,
      },
      dataMode,
      fallbackUsed,
      asOf,
    },
    intelligence: {
      data: [{ id: "fixture-intelligence" }],
      publicationTier: tier,
      dataMode: "live",
      fallbackUsed: false,
      asOf,
    },
    blogs: {
      data: [{ id: "fixture-blog" }],
      publicationTier: tier,
      dataMode: "live",
      fallbackUsed: false,
      asOf,
    },
  };
}

function runFixtures(): void {
  const trusted = fixturePayloads("trusted");
  validateLiveQuality(trusted, "enforce");

  const shadow = fixturePayloads("legacy");
  validateLiveQuality(shadow, "shadow");

  const unlabeledShadow = structuredClone(shadow);
  delete unlabeledShadow.scores.publicationTier;
  assert.throws(
    () => validateLiveQuality(unlabeledShadow, "shadow"),
    /must label publicationTier/,
  );

  const fallbackScores = structuredClone(trusted);
  fallbackScores.scores.fallbackUsed = true;
  assert.throws(
    () => validateLiveQuality(fallbackScores, "enforce"),
    /score endpoint used fallback/,
  );

  const partialScores = structuredClone(trusted);
  record((partialScores.scores.countries as unknown[])[0]).publicationTier =
    "legacy";
  assert.throws(
    () => validateLiveQuality(partialScores, "enforce"),
    /includes untrusted/,
  );

  const staleScores = structuredClone(trusted);
  staleScores.scores.dataMode = "stale";
  assert.throws(
    () => validateLiveQuality(staleScores, "enforce"),
    /current data is required/,
  );

  const incompleteScores = structuredClone(trusted);
  incompleteScores.scores.countries = (
    incompleteScores.scores.countries as unknown[]
  ).slice(1);
  incompleteScores.scores.count = 53;
  assert.throws(
    () => validateLiveQuality(incompleteScores, "enforce"),
    /does not expose 54 countries/,
  );

  const partialCommodities = structuredClone(trusted);
  record(partialCommodities.commodities.trustedCoverage).records = 2;
  record(partialCommodities.commodities.trustedCoverage).ratio = 2 / 3;
  partialCommodities.commodities.coverageMode = "partial";
  assert.throws(
    () => validateLiveQuality(partialCommodities, "enforce"),
    /complete coverage is required/,
  );

  const fallbackCommodities = structuredClone(trusted);
  fallbackCommodities.commodities.fallbackUsed = true;
  assert.throws(
    () => validateLiveQuality(fallbackCommodities, "enforce"),
    /commodities endpoint used fallback/,
  );

  console.log(
    "Live quality fixtures passed (trusted enforce, labeled shadow, no fallback, current rows, complete score and commodity coverage).",
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--fixtures")) {
    runFixtures();
    return;
  }

  const baseUrl = process.env.QUALITY_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "QUALITY_BASE_URL is required for optional live checks (for example https://axis.example).",
    );
  }
  const mode = publicationMode(process.env.QUALITY_PUBLICATION_MODE);

  const [health, scores, commodities, intelligence, blogs] = await Promise.all([
    jsonAt(baseUrl, "/api/internal/health"),
    jsonAt(baseUrl, "/api/public/scores"),
    jsonAt(baseUrl, "/api/commodities"),
    jsonAt(baseUrl, "/api/intelligence"),
    jsonAt(baseUrl, "/api/blogs"),
  ]);
  validateLiveQuality(
    { health, scores, commodities, intelligence, blogs },
    mode,
  );

  const modeLabel =
    mode === "enforce"
      ? "enforce/trusted-production"
      : "shadow/pre-promotion";
  console.log(
    `Live quality passed: mode=${modeLabel}, health=healthy, scores=${String(scores.count)}/${String(scores.publicationTier)}, commodities=${String(record(commodities.trustedCoverage).records)}/${String(record(commodities.trustedCoverage).total)}/${String(commodities.publicationTier)}, intelligence=${String(intelligence.dataMode)}/${String(intelligence.publicationTier)}, blogs=${String(blogs.dataMode)}/${String(blogs.publicationTier)}.`,
  );
}

main().catch((error) => {
  console.error("Optional live quality check failed:", error);
  process.exitCode = 1;
});
