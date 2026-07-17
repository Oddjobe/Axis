import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  classifyInventory,
  trustRolloutFixtures,
  type LegacyRecord,
  type RolloutDataset,
  type RolloutInventory,
} from "../src/lib/intelligence/trust-rollout";
import {
  AFRICAN_ISO3_CODES,
  DATASET_TRUST_POLICIES,
} from "../src/lib/intelligence/trust";
import { canonicalizeUrl } from "../src/lib/intelligence/publication-gate";
import { COMMODITY_IDS } from "../src/lib/intelligence/ingestion/commodity-sources";

const DATASETS: RolloutDataset[] = [
  "intelligence",
  "blog",
  "country-score",
  "commodity",
];
const TABLES: Record<RolloutDataset, string> = {
  intelligence: "intelligence_alerts",
  blog: "blog_posts",
  "country-score": "countries",
  commodity: "commodity_prices",
};
const LIVE_REPORT = "quality-reports/trust-shadow-report.json";
const LIVE_STATE = "quality-reports/trust-shadow-state.json";
const FIXTURE_DIRECTORY = resolve("quality-reports/fixtures");
const FIXTURE_REPORT =
  "quality-reports/fixtures/trust-shadow-report.json";
const FIXTURE_STATE =
  "quality-reports/fixtures/trust-shadow-state.json";
const IDENTITY_SCHEMA_VERSION = 1 as const;
const REQUIRED_IDENTITIES: Partial<Record<RolloutDataset, readonly string[]>> = {
  "country-score": AFRICAN_ISO3_CODES,
  commodity: COMMODITY_IDS,
};

export interface ShadowThresholds {
  minCoverage: number;
  minFreshness: number;
  maxRejection: number;
  requiredRuns: number;
}

export interface ShadowIdentityMetrics {
  schemaVersion: typeof IDENTITY_SCHEMA_VERSION;
  currentIdentities: string[];
  trustedIdentities: string[];
  matchedIdentities: string[];
  freshMatchedIdentities: string[];
  staleMatchedIdentities: string[];
  requiredIdentities: string[];
  missingCurrentIdentities: string[];
  missingTrustedIdentities: string[];
  missingFreshIdentities: string[];
  unexpectedCurrentIdentities: string[];
  requirementsSatisfied: boolean;
}

export interface ShadowDatasetReport {
  currentCount: number;
  comparableCount: number;
  trustedCount: number;
  matchedCount: number;
  freshCount: number;
  rejectedCount: number;
  currentIdentityCount: number;
  trustedIdentityCount: number;
  matchedIdentityCount: number;
  freshMatchedIdentityCount: number;
  freshRowCount: number;
  duplicateTrustedRowCount: number;
  coverageRate: number;
  freshnessRate: number;
  rejectionRate: number;
  thresholdsPassed: boolean;
  identity: ShadowIdentityMetrics;
}

function argument(name: string, fallback: string): string {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function requireFixturePath(path: string, label: string): void {
  const pathFromFixtureDirectory = relative(FIXTURE_DIRECTORY, path);
  if (
    !pathFromFixtureDirectory ||
    pathFromFixtureDirectory.startsWith("..") ||
    isAbsolute(pathFromFixtureDirectory)
  ) {
    throw new Error(
      `Fixture ${label} must be a file below ${FIXTURE_DIRECTORY}.`,
    );
  }
}

async function liveInventory(limit: number): Promise<{
  inventory: RolloutInventory;
  trusted: Record<RolloutDataset, LegacyRecord[]>;
}> {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Live shadow comparison requires Supabase URL and read credentials; use --fixtures for a credential-free run.",
    );
  }
  const client = createClient(url, key);
  const records: Record<RolloutDataset, LegacyRecord[]> = {
    intelligence: [],
    blog: [],
    "country-score": [],
    commodity: [],
  };
  const trusted: Record<RolloutDataset, LegacyRecord[]> = {
    intelligence: [],
    blog: [],
    "country-score": [],
    commodity: [],
  };
  const warnings: string[] = [];
  for (const dataset of DATASETS) {
    const legacyResult = await client
      .from(TABLES[dataset])
      .select("*")
      .limit(limit);
    if (legacyResult.error) {
      warnings.push(
        `${TABLES[dataset]} inventory failed: ${legacyResult.error.message}`,
      );
    } else {
      records[dataset] = (legacyResult.data ?? []) as LegacyRecord[];
    }
    const trustedResult = await client
      .from("trusted_published_records")
      .select("record,source_published_at,published_at")
      .eq("dataset", dataset)
      .limit(limit);
    if (trustedResult.error) {
      warnings.push(
        `Trusted ${dataset} view failed: ${trustedResult.error.message}`,
      );
    } else {
      trusted[dataset] = (trustedResult.data ?? []).map((row) => ({
        ...((row.record as LegacyRecord | null) ?? {}),
        sourcePublishedAt: row.source_published_at,
        trustedPublishedAt: row.published_at,
      }));
    }
  }
  return {
    inventory: { source: "supabase", records, warnings },
    trusted,
  };
}

function timestamp(record: LegacyRecord): number | null {
  for (const key of [
    "sourcePublishedAt",
    "source_published_at",
    "publishedAt",
    "published_at",
  ]) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const provenance =
    record.provenance &&
    typeof record.provenance === "object" &&
    !Array.isArray(record.provenance)
      ? (record.provenance as LegacyRecord)
      : null;
  if (provenance) return timestamp(provenance);
  return null;
}

function identity(dataset: RolloutDataset, record: LegacyRecord): string {
  if (dataset === "intelligence" || dataset === "blog") {
    const url = canonicalizeUrl(
      record.canonicalUrl ?? record.sourceUrl ?? record.url,
    );
    if (url) return url;
    return String(record.title ?? "").trim().toLowerCase();
  }
  if (dataset === "country-score") {
    return String(record.country ?? record.id ?? record.isoCode ?? "")
      .trim()
      .toUpperCase();
  }
  return String(record.id ?? record.name ?? "").trim().toLowerCase();
}

async function previousConsecutive(
  path: string,
  expectedMode: "fixtures" | "live-shadow",
  expectedThresholds: ShadowThresholds,
): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      version?: unknown;
      mode?: unknown;
      thresholds?: unknown;
      consecutiveSuccessfulRuns?: unknown;
    };
    return parsed.version === 3 &&
      parsed.mode === expectedMode &&
      JSON.stringify(parsed.thresholds) ===
        JSON.stringify(expectedThresholds) &&
      typeof parsed.consecutiveSuccessfulRuns === "number"
      ? parsed.consecutiveSuccessfulRuns
      : 0;
  } catch {
    return 0;
  }
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function difference(
  left: readonly string[],
  right: ReadonlySet<string>,
): string[] {
  return left.filter((value) => !right.has(value));
}

export function summarizeShadowDataset(
    dataset: RolloutDataset,
    current: readonly LegacyRecord[],
    trustedRows: readonly LegacyRecord[],
    rejectedCount: number,
    generatedAt: string,
    thresholds: Pick<
      ShadowThresholds,
      "minCoverage" | "minFreshness" | "maxRejection"
    >,
  ): ShadowDatasetReport {
    const generatedAtMs = Date.parse(generatedAt);
    const currentIdentities = sorted(
      current.map((record) => identity(dataset, record)).filter(Boolean),
    );
    const trustedIdentities = sorted(
      trustedRows.map((record) => identity(dataset, record)).filter(Boolean),
    );
    const currentSet = new Set(currentIdentities);
    const trustedSet = new Set(trustedIdentities);
    const matchedIdentities = currentIdentities.filter((key) =>
      trustedSet.has(key),
    );
    const freshRows = trustedRows.filter((record) => {
      const value = timestamp(record);
      if (value === null || !Number.isFinite(generatedAtMs)) return false;
      const age = generatedAtMs - value;
      return (
        age >= 0 &&
        age <= DATASET_TRUST_POLICIES[dataset].maximumAgeMs
      );
    });
    const freshMatchedIdentities = sorted(
      freshRows
        .map((record) => identity(dataset, record))
        .filter((key) => key && currentSet.has(key)),
    );
    const freshSet = new Set(freshMatchedIdentities);
    const matchedSet = new Set(matchedIdentities);
    const requiredIdentities = sorted(REQUIRED_IDENTITIES[dataset] ?? []);
    const requiredSet = new Set(requiredIdentities);
    const staleMatchedIdentities = difference(matchedIdentities, freshSet);
    const missingCurrentIdentities = difference(requiredIdentities, currentSet);
    const missingTrustedIdentities = difference(requiredIdentities, trustedSet);
    const missingFreshIdentities = difference(requiredIdentities, freshSet);
    const unexpectedCurrentIdentities = requiredIdentities.length
      ? difference(currentIdentities, requiredSet)
      : [];
    const requirementsSatisfied =
      requiredIdentities.length === 0 ||
      (
        missingCurrentIdentities.length === 0 &&
        missingTrustedIdentities.length === 0 &&
        missingFreshIdentities.length === 0 &&
        unexpectedCurrentIdentities.length === 0 &&
        currentIdentities.length === requiredIdentities.length &&
        matchedSet.size === requiredIdentities.length &&
        freshSet.size === requiredIdentities.length
      );
    const coverageRate = ratio(matchedIdentities.length, currentIdentities.length);
    const freshnessRate = ratio(
      freshMatchedIdentities.length,
      currentIdentities.length,
    );
    const rejectionRate = ratio(rejectedCount, current.length);
    const thresholdsPassed =
      current.length > 0 &&
      currentIdentities.length > 0 &&
      trustedRows.length > 0 &&
      matchedIdentities.length > 0 &&
      freshMatchedIdentities.length > 0 &&
      requirementsSatisfied &&
      coverageRate >= thresholds.minCoverage &&
      freshnessRate >= thresholds.minFreshness &&
      rejectionRate <= thresholds.maxRejection;

    return {
      currentCount: current.length,
      comparableCount: currentIdentities.length,
      trustedCount: trustedRows.length,
      matchedCount: matchedIdentities.length,
      freshCount: freshMatchedIdentities.length,
      rejectedCount,
      currentIdentityCount: currentIdentities.length,
      trustedIdentityCount: trustedIdentities.length,
      matchedIdentityCount: matchedIdentities.length,
      freshMatchedIdentityCount: freshMatchedIdentities.length,
      freshRowCount: freshRows.length,
      duplicateTrustedRowCount: Math.max(
        0,
        trustedRows.length - trustedIdentities.length,
      ),
      coverageRate,
      freshnessRate,
      rejectionRate,
      thresholdsPassed,
      identity: {
        schemaVersion: IDENTITY_SCHEMA_VERSION,
        currentIdentities,
        trustedIdentities,
        matchedIdentities,
        freshMatchedIdentities,
        staleMatchedIdentities,
        requiredIdentities,
        missingCurrentIdentities,
        missingTrustedIdentities,
        missingFreshIdentities,
        unexpectedCurrentIdentities,
        requirementsSatisfied,
      },
    };
}

async function main(): Promise<void> {
  const fixtures = flag("--fixtures");
  const limit = Number(argument("--limit", "5000"));
  const minCoverage = Number(
    argument("--min-coverage", process.env.TRUST_MIN_COVERAGE ?? "0.7"),
  );
  const minFreshness = Number(
    argument("--min-freshness", process.env.TRUST_MIN_FRESHNESS ?? "0.8"),
  );
  const maxRejection = Number(
    argument("--max-rejection", process.env.TRUST_MAX_REJECTION ?? "0.3"),
  );
  const requiredRuns = Number(
    argument(
      "--required-runs",
      process.env.TRUST_REQUIRED_RUNS ?? (fixtures ? "1" : "3"),
    ),
  );
  const outputPath = resolve(
    argument(
      "--output",
      fixtures ? FIXTURE_REPORT : LIVE_REPORT,
    ),
  );
  const statePath = resolve(
    argument("--state", fixtures ? FIXTURE_STATE : LIVE_STATE),
  );
  if (fixtures) {
    requireFixturePath(outputPath, "report path");
    requireFixturePath(statePath, "state path");
  }
  for (const [name, value] of [
    ["min coverage", minCoverage],
    ["min freshness", minFreshness],
    ["max rejection", maxRejection],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
  if (!Number.isInteger(requiredRuns) || requiredRuns < 1) {
    throw new Error("required runs must be a positive integer.");
  }
  const thresholds = {
    minCoverage,
    minFreshness,
    maxRejection,
    requiredRuns,
  };

  const generatedAt = new Date().toISOString();
  let inventory: RolloutInventory;
  let trusted: Record<RolloutDataset, LegacyRecord[]>;
  if (fixtures) {
    const rolloutFixtures = trustRolloutFixtures(new Date(generatedAt));
    const decisions = classifyInventory(
      rolloutFixtures,
      new Date(generatedAt),
    );
    trusted = Object.fromEntries(
      DATASETS.map((dataset) => [
        dataset,
        decisions
          .filter(
            (item) =>
              item.dataset === dataset &&
              item.disposition !== "quarantine" &&
              item.prepared,
          )
          .map((item) => item.prepared!),
      ]),
    ) as Record<RolloutDataset, LegacyRecord[]>;
    const scoreTemplate = trusted["country-score"][0];
    const commodityTemplate = trusted.commodity[0];
    if (!scoreTemplate || !commodityTemplate) {
      throw new Error(
        "Trust rollout fixtures must include country-score and commodity templates.",
      );
    }
    trusted["country-score"] = AFRICAN_ISO3_CODES.map((country) => ({
      ...scoreTemplate,
      country,
      id: country,
    }));
    trusted.commodity = COMMODITY_IDS.map((id) => ({
      ...commodityTemplate,
      id,
      name: id,
    }));
    inventory = {
      source: "fixtures",
      warnings: [],
      records: Object.fromEntries(
        DATASETS.map((dataset) => [dataset, trusted[dataset]]),
      ) as Record<RolloutDataset, LegacyRecord[]>,
    };
  } else {
    ({ inventory, trusted } = await liveInventory(limit));
  }

  const decisions = classifyInventory(inventory, new Date(generatedAt));
  const byDataset = Object.fromEntries(
    DATASETS.map((dataset) => {
      const current = inventory.records[dataset];
      const trustedRows = trusted[dataset];
      const rejected = decisions.filter(
        (item) =>
          item.dataset === dataset && item.disposition === "quarantine",
      ).length;
      return [
        dataset,
        summarizeShadowDataset(
          dataset,
          current,
          trustedRows,
          rejected,
          generatedAt,
          thresholds,
        ),
      ];
    }),
  ) as Record<RolloutDataset, ShadowDatasetReport>;
  const currentTotal = Object.values(byDataset).reduce(
    (sum, value) => sum + value.currentCount,
    0,
  );
  const comparableTotal = Object.values(byDataset).reduce(
    (sum, value) => sum + value.comparableCount,
    0,
  );
  const matchedTotal = Object.values(byDataset).reduce(
    (sum, value) => sum + value.matchedCount,
    0,
  );
  const rejectedTotal = Object.values(byDataset).reduce(
    (sum, value) => sum + value.rejectedCount,
    0,
  );
  const freshTotal = Object.values(byDataset).reduce(
    (sum, value) => sum + value.freshCount,
    0,
  );
  const metrics = {
    coverageRate: ratio(matchedTotal, comparableTotal),
    freshnessRate: ratio(freshTotal, comparableTotal),
    rejectionRate: ratio(rejectedTotal, currentTotal),
  };
  const thresholdsPassed =
    inventory.warnings.length === 0 &&
    DATASETS.every((dataset) => byDataset[dataset].thresholdsPassed);
  const prior = await previousConsecutive(
    statePath,
    fixtures ? "fixtures" : "live-shadow",
    thresholds,
  );
  const consecutiveSuccessfulRuns = thresholdsPassed ? prior + 1 : 0;
  const fixtureValidationEligible =
    fixtures && consecutiveSuccessfulRuns >= requiredRuns;
  const promotionEligible =
    !fixtures && consecutiveSuccessfulRuns >= requiredRuns;
  const report = {
    version: 3,
    identitySchemaVersion: IDENTITY_SCHEMA_VERSION,
    mode: fixtures ? "fixtures" : "live-shadow",
    generatedAt,
    thresholds,
    metrics,
    byDataset,
    warnings: inventory.warnings,
    thresholdsPassed,
    consecutiveSuccessfulRuns,
    fixtureValidationEligible,
    promotionEligible,
  };
  await Promise.all([
    mkdir(dirname(outputPath), { recursive: true }),
    mkdir(dirname(statePath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(
      statePath,
      `${JSON.stringify(
        {
          version: 3,
          identitySchemaVersion: IDENTITY_SCHEMA_VERSION,
          mode: fixtures ? "fixtures" : "live-shadow",
          lastRunAt: generatedAt,
          thresholds,
          thresholdsPassed,
          consecutiveSuccessfulRuns,
          requiredRuns,
          fixtureValidationEligible,
          promotionEligible,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
  console.log(
    `Shadow ${thresholdsPassed ? "PASS" : "FAIL"}: coverage=${metrics.coverageRate}, freshness=${metrics.freshnessRate}, rejection=${metrics.rejectionRate}; consecutive=${consecutiveSuccessfulRuns}/${requiredRuns}.`,
  );
  console.log(
    fixtures
      ? fixtureValidationEligible
        ? "Fixture thresholds are satisfied; production promotion remains blocked."
        : "Fixture thresholds are not yet satisfied; production promotion remains blocked."
      : promotionEligible
        ? "Production promotion thresholds are satisfied."
        : "Promotion remains blocked; legacy selection is unchanged.",
  );
  if (flag("--require-promotion") && !promotionEligible) process.exitCode = 1;
}

if (basename(process.argv[1] ?? "") === "trust-shadow.ts") {
  main().catch((error) => {
    console.error(
      `Trust shadow failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
