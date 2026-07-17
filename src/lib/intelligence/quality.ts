import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

import {
  shapeBlogCandidates,
  shapeIntelligenceCandidates,
} from "./ingestion/candidates";
import { runIntelligenceIngestion } from "./ingestion/orchestrator.server";
import { withBoundedRetry } from "./ingestion/retry.server";
import { BLOG_SOURCES, INTELLIGENCE_SOURCES } from "./ingestion/sources";
import type {
  IngestionAdapter,
  IngestionDataset,
  IngestionPersistence,
} from "./ingestion/types";
import {
  areNearDuplicates,
  evaluatePublicationBatch,
  evaluatePublicationCandidate,
  normalizeDate,
  normalizeIso3,
  normalizeText,
  normalizeUrl,
  normalizedPublicationCandidateSchema,
  type PublicationDecision,
} from "./publication-gate";
import type {
  AtomicPublicationDecision,
  PublicationPersistenceResult,
} from "./publication-storage";
import { getPublicationCoverage } from "./publication-coverage";
import {
  BASELINE_COUNTRY_SCORES,
  BASELINE_SCORE_BY_ISO,
  computeCompositeScores,
  getBundledBaselineObservations,
  INDICATOR_DEFINITIONS,
  SCORE_METHODOLOGY_VERSION,
  type ScoreObservation,
} from "./score-methodology";
import {
  AFRICAN_ISO3_CODES,
  DATASET_TRUST_POLICIES,
  africanIso3Schema,
  deriveSovereigntyStatus,
  getDataMode,
  getFreshnessMetadata,
  getLatestTimestamp,
  provenanceSchema,
  trustMetadataSchema,
} from "./trust";

export const QUALITY_REPORT_VERSION = "axis-data-quality-1";
export const QUALITY_FIXTURE_TIME = "2026-07-16T12:00:00.000Z";

type QualityMetric = string | number | boolean | null;

export interface QualityCheckResult {
  id: string;
  title: string;
  critical: boolean;
  passed: boolean;
  durationMs: number;
  detail: string;
  metrics: Record<string, QualityMetric>;
}

export interface DataQualityReport {
  version: string;
  generatedAt: string;
  fixtureTime: string;
  status: "pass" | "fail";
  summary: {
    checks: number;
    passed: number;
    failed: number;
    criticalFailed: number;
  };
  metrics: {
    countries: number;
    uniqueCountries: number;
    observations: number;
    minimumCoverage: number;
    maximumCoverage: number;
    candidates: number;
    published: number;
    quarantined: number;
    sourceFailures: number;
  };
  checks: QualityCheckResult[];
}

interface CheckEvidence {
  detail: string;
  metrics?: Record<string, QualityMetric>;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  invariant(
    Object.is(actual, expected),
    `${message}: expected ${String(expected)}, received ${String(actual)}`,
  );
}

async function runCheck(
  id: string,
  title: string,
  check: () => CheckEvidence | Promise<CheckEvidence>,
): Promise<QualityCheckResult> {
  const startedAt = performance.now();
  try {
    const evidence = await check();
    return {
      id,
      title,
      critical: true,
      passed: true,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      detail: evidence.detail,
      metrics: evidence.metrics ?? {},
    };
  } catch (error) {
    return {
      id,
      title,
      critical: true,
      passed: false,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      detail: error instanceof Error ? error.message : String(error),
      metrics: {},
    };
  }
}

function validIntelligenceFixture() {
  const sourcePublishedAt = "2026-07-16T10:00:00.000Z";
  const excerpt =
    "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.";
  return {
    title: "Nigeria expands regional digital trade infrastructure",
    summary: excerpt,
    severity: "medium",
    category: "sovereignty",
    isoCode: "nga",
    timeAgo: "2 hours ago",
    source: "African Business Magazine",
    url: "https://www.african.business/news/item?utm_source=fixture",
    sourcePublishedAt,
    sourceEvidence: {
      origin: "quality-fixture",
      canonicalUrl: "https://www.african.business/news/item",
      sourcePublishedAt,
      excerpt,
      timestampField: "sourcePublishedAt",
      supported: true,
      disagreements: [],
    },
  };
}

function validBlogFixture() {
  return {
    title: "African infrastructure financing enters a new phase",
    summary:
      "A review of how African infrastructure investors are adapting financing models to regional trade priorities.",
    author: "Axis Research",
    tag: "African development",
    source: "Medium Africa",
    url: "https://medium.com/@axis/african-infrastructure?source=feed",
    sourcePublishedAt: "2026-07-15T10:00:00.000Z",
  };
}

function reasonCodes(decision: PublicationDecision): Set<string> {
  return new Set(decision.reasons.map((item) => item.code));
}

function persistedFixture(): IngestionPersistence {
  return async (
    _dataset: IngestionDataset,
    decisions: readonly AtomicPublicationDecision[],
  ): Promise<PublicationPersistenceResult> => ({
    published: decisions.filter((decision) => decision.decision === "publish")
      .length,
    quarantined: decisions.filter(
      (decision) => decision.decision === "quarantine",
    ).length,
    auditRecorded: decisions.length,
    trustStorageAvailable: true,
    warnings: [],
    errors: [],
  });
}

async function ingestionSummaryCheck(now: Date): Promise<CheckEvidence> {
  const adapter: IngestionAdapter = {
    async collectIntelligence(source) {
      if (source.name === "Broken fixture") {
        throw new Error("deterministic source failure");
      }
      return [validIntelligenceFixture()];
    },
    async collectBlog() {
      return [{ ...validBlogFixture(), summary: "Too short." }];
    },
  };
  const summary = await runIntelligenceIngestion({
    adapter,
    persist: persistedFixture(),
    now,
    intelligenceSources: [
      { name: "Working fixture", url: "https://african.business/" },
      { name: "Broken fixture", url: "https://example.invalid/" },
    ],
    blogSources: [BLOG_SOURCES[0]],
  });

  equal(summary.totals.candidates, 2, "candidate count");
  equal(summary.totals.published, 1, "published count");
  equal(summary.totals.quarantined, 1, "quarantined count");
  equal(summary.totals.sourcesFailed, 1, "source-failure count");
  equal(summary.totals.accepted, 1, "accepted count");
  equal(summary.intelligence.sourceStatus[0].status, "succeeded", "working source status");
  equal(summary.intelligence.sourceStatus[1].status, "failed", "failed source status");
  equal(summary.blog.quality.rejectionReasons.summary_missing, 1, "summary rejection");

  return {
    detail:
      "Ingestion summaries expose candidate, accepted, published, quarantined, rejection, and source-failure aggregates.",
    metrics: {
      candidates: summary.totals.candidates,
      published: summary.totals.published,
      quarantined: summary.totals.quarantined,
      sourceFailures: summary.totals.sourcesFailed,
    },
  };
}

async function runtimeBudgetCheck(): Promise<CheckEvidence> {
  let starts = 0;
  let releaseBoth: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  const markStarted = async () => {
    starts += 1;
    if (starts === 2) releaseBoth?.();
    await bothStarted;
  };
  const concurrentAdapter: IngestionAdapter = {
    async collectIntelligence() {
      await markStarted();
      return [validIntelligenceFixture()];
    },
    async collectBlog() {
      await markStarted();
      return [validBlogFixture()];
    },
  };
  const summary = await runIntelligenceIngestion({
    adapter: concurrentAdapter,
    persist: persistedFixture(),
    intelligenceSources: [INTELLIGENCE_SOURCES[0]],
    blogSources: [BLOG_SOURCES[0]],
    deadlineAt: Date.now() + 1_000,
  });
  equal(starts, 2, "datasets started concurrently");
  equal(summary.success, true, "concurrent ingestion success");

  let retryAttempts = 0;
  let retryFailed = false;
  try {
    await withBoundedRetry(
      "budget fixture",
      async () => {
        retryAttempts += 1;
        throw new Error("fixture failure");
      },
      { attempts: 3, delayMs: 100, deadlineAt: Date.now() + 20 },
    );
  } catch {
    retryFailed = true;
  }
  invariant(retryFailed, "retry fixture must fail");
  equal(retryAttempts, 1, "retry attempts within remaining budget");

  let persistenceStarts = 0;
  let postDeadlineWrites = 0;
  const abortAwarePersistence: IngestionPersistence = async (
    _dataset,
    decisions,
    signal,
  ) => {
    persistenceStarts += 1;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 100);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
    signal.throwIfAborted();
    postDeadlineWrites += 1;
    return persistedFixture()(_dataset, decisions, signal);
  };
  const deadlineStartedAt = Date.now();
  let deadlineFailed = false;
  try {
    await runIntelligenceIngestion({
      adapter: concurrentAdapter,
      persist: abortAwarePersistence,
      intelligenceSources: [INTELLIGENCE_SOURCES[0]],
      blogSources: [BLOG_SOURCES[0]],
      deadlineAt: Date.now() + 30,
    });
  } catch (error) {
    deadlineFailed =
      error instanceof Error &&
      error.message === "Ingestion run deadline exhausted";
  }
  invariant(deadlineFailed, "run deadline must stop hanging datasets");
  equal(persistenceStarts, 2, "persistence operations started");
  equal(postDeadlineWrites, 0, "writes completed after deadline");
  await new Promise((resolve) => setTimeout(resolve, 110));
  equal(postDeadlineWrites, 0, "background writes after deadline response");
  invariant(
    Date.now() - deadlineStartedAt < 250,
    "run deadline exceeded its test budget",
  );

  return {
    detail:
      "Run cancellation reaches retries and persistence; the deadline waits for abort settlement and prevents post-response writes.",
    metrics: {
      concurrentDatasets: starts,
      retryAttempts,
      persistenceStarts,
      postDeadlineWrites,
    },
  };
}

export async function runDeterministicQualitySuite(
  generatedAt = new Date(),
): Promise<DataQualityReport> {
  const now = new Date(QUALITY_FIXTURE_TIME);
  const checks = await Promise.all([
    runCheck("runtime-budget", "Runtime deadline and concurrency", runtimeBudgetCheck),
    runCheck("publication-coverage", "Publication coverage modes", () => {
      const partial = getPublicationCoverage(["a", "b", "c"], ["a"]);
      equal(partial.publicationTier, "mixed", "partial publication tier");
      equal(partial.coverageMode, "partial", "partial coverage mode");
      equal(partial.records, 1, "partial trusted records");
      equal(partial.ratio, 0.3333, "partial trusted ratio");
      const complete = getPublicationCoverage(
        ["a", "b", "c"],
        ["a", "b", "c"],
      );
      equal(complete.publicationTier, "trusted", "complete publication tier");
      const absent = getPublicationCoverage(["a", "b", "c"], []);
      equal(absent.publicationTier, "legacy", "absent publication tier");
      return {
        detail:
          "Partial trusted commodity coverage is labeled mixed/partial; only complete coverage is trusted.",
        metrics: { partialRatio: partial.ratio },
      };
    }),
    runCheck("validators", "Validator contracts", () => {
      equal(AFRICAN_ISO3_CODES.length, 54, "African ISO list size");
      invariant(africanIso3Schema.safeParse("NGA").success, "NGA must validate");
      invariant(!africanIso3Schema.safeParse("PAN").success, "PAN must be rejected");
      const accepted = evaluatePublicationCandidate(
        "intelligence",
        validIntelligenceFixture(),
        { now },
      );
      equal(accepted.decision, "publish", "valid intelligence fixture");
      invariant(
        accepted.normalized &&
          normalizedPublicationCandidateSchema.safeParse(accepted.normalized)
            .success,
        "normalized candidate must satisfy its schema",
      );
      const trust = trustMetadataSchema.safeParse({
        dataset: "intelligence",
        publicationState: "published",
        dataMode: "live",
        provenance: {
          sourceUrl: accepted.normalized?.sourceUrl,
          publisher: accepted.normalized?.source,
          sourcePublishedAt: accepted.normalized?.sourcePublishedAt,
          retrievedAt: accepted.normalized?.retrievedAt,
          observedAt: accepted.normalized?.sourcePublishedAt,
          contentHash: accepted.identity?.contentHash,
          excerpt: accepted.normalized?.summary,
          extractor: "quality-fixture",
          extractorVersion: "1",
        },
        confidence: accepted.confidence.confidence,
        validationErrors: [],
        generatedAt: now.toISOString(),
        asOf: accepted.normalized?.sourcePublishedAt,
        methodologyVersion: null,
      });
      invariant(trust.success, "trust metadata fixture must validate");
      return {
        detail: "Valid fixtures pass and unsupported country/schema fixtures fail closed.",
        metrics: { schemas: 4, countries: AFRICAN_ISO3_CODES.length },
      };
    }),
    runCheck("normalization", "Deterministic normalization", () => {
      equal(
        normalizeText("  Africa\u2019s   <b>trade</b>  "),
        "Africa's trade",
        "text normalization",
      );
      equal(
        normalizeUrl(
          "HTTPS://WWW.Example.COM/path/?b=2&utm_source=x&a=1#fragment",
        ),
        "https://example.com/path?a=1&b=2",
        "URL canonicalization",
      );
      equal(normalizeIso3(" nga "), "NGA", "ISO normalization");
      equal(normalizeIso3("PAN"), null, "non-African ISO rejection");
      equal(
        normalizeDate("2 hours ago", now),
        "2026-07-16T10:00:00.000Z",
        "relative date normalization",
      );
      return {
        detail: "Text, URL, ISO-3, and relative-date normalization are stable.",
        metrics: { fixtures: 5 },
      };
    }),
    runCheck("score-boundaries", "Score boundaries and coverage", () => {
      const observations = getBundledBaselineObservations();
      const scores = computeCompositeScores(observations);
      for (const score of scores) {
        invariant(score.axisScore >= 0 && score.axisScore <= 100, "score outside 0–100");
        invariant(score.coverage >= 0 && score.coverage <= 1, "coverage outside 0–1");
        for (const value of Object.values(score.dimensions)) {
          invariant(value >= 0 && value <= 100, "dimension outside 0–100");
        }
        for (const indicator of score.indicators) {
          invariant(
            indicator.normalizedScore >= 0 &&
              indicator.normalizedScore <= 100,
            "normalized indicator outside 0–100",
          );
        }
      }
      const lower: ScoreObservation[] = INDICATOR_DEFINITIONS.map((indicator) => ({
        country: "DZA",
        indicatorId: indicator.id,
        year: 2024,
        value: indicator.normalization.min - 1,
      }));
      const upper: ScoreObservation[] = INDICATOR_DEFINITIONS.map((indicator) => ({
        country: "DZA",
        indicatorId: indicator.id,
        year: 2024,
        value: indicator.normalization.max + 1,
      }));
      const lowerIndicators = computeCompositeScores(lower)[0].indicators;
      const upperIndicators = computeCompositeScores(upper)[0].indicators;
      INDICATOR_DEFINITIONS.forEach((indicator, index) => {
        equal(
          lowerIndicators[index].normalizedScore,
          indicator.direction === "higher" ? 0 : 100,
          `${indicator.id} lower clamp`,
        );
        equal(
          upperIndicators[index].normalizedScore,
          indicator.direction === "higher" ? 100 : 0,
          `${indicator.id} upper clamp`,
        );
      });
      equal(computeCompositeScores([])[0].coverage, 0, "empty coverage");
      return {
        detail: "Composite, dimension, indicator, clamp, and coverage bounds hold.",
        metrics: {
          scores: scores.length,
          observations: observations.length,
          minimumCoverage: Math.min(...scores.map((score) => score.coverage)),
          maximumCoverage: Math.max(...scores.map((score) => score.coverage)),
        },
      };
    }),
    runCheck("freshness-fallback", "Freshness and fallback semantics", () => {
      const maxAge = DATASET_TRUST_POLICIES.intelligence.maximumAgeMs;
      equal(
        getDataMode(
          new Date(now.getTime() - maxAge).toISOString(),
          "intelligence",
          "live",
          now.getTime(),
        ),
        "live",
        "exact freshness boundary",
      );
      equal(
        getDataMode(
          new Date(now.getTime() - maxAge - 1).toISOString(),
          "intelligence",
          "live",
          now.getTime(),
        ),
        "stale",
        "expired freshness",
      );
      equal(
        getDataMode(
          new Date(now.getTime() + 86_400_001).toISOString(),
          "intelligence",
          "live",
          now.getTime(),
        ),
        "stale",
        "future freshness",
      );
      const fallback = getFreshnessMetadata({
        observedAt: now.toISOString(),
        dataset: "blog",
        requestedMode: "fallback",
        now: now.getTime(),
      });
      equal(fallback.dataMode, "fallback", "fallback mode preservation");
      equal(fallback.asOf, now.toISOString(), "observed fallback timestamp");
      equal(
        getLatestTimestamp([
          "2026-07-15T00:00:00.000Z",
          "2026-07-16T00:00:00.000Z",
        ]),
        "2026-07-16T00:00:00.000Z",
        "latest timestamp",
      );
      return {
        detail: "Boundary, stale, future, fallback, and as-of semantics hold.",
        metrics: { fixtures: 6 },
      };
    }),
    runCheck("deduplication", "Canonical and near-duplicate rejection", () => {
      const decisions = evaluatePublicationBatch(
        "intelligence",
        [
          validIntelligenceFixture(),
          {
            ...validIntelligenceFixture(),
            url: "https://african.business/news/item?utm_campaign=duplicate",
          },
        ],
        { now },
      );
      equal(decisions[0].decision, "publish", "first candidate");
      equal(decisions[1].decision, "quarantine", "duplicate candidate");
      invariant(
        reasonCodes(decisions[1]).has("duplicate_candidate"),
        "duplicate reason missing",
      );
      invariant(
        decisions[0].normalized &&
          decisions[1].normalized &&
          areNearDuplicates(decisions[0].normalized, decisions[1].normalized),
        "near-duplicate comparison must match",
      );
      return {
        detail: "Tracking variants and equivalent content are deterministically deduplicated.",
        metrics: { candidates: 2, duplicates: 1 },
      };
    }),
    runCheck("quarantine", "Quarantine reasons", () => {
      const invalidCountry = evaluatePublicationCandidate(
        "intelligence",
        { ...validIntelligenceFixture(), isoCode: "PAN" },
        { now },
      );
      const stale = evaluatePublicationCandidate(
        "intelligence",
        {
          ...validIntelligenceFixture(),
          sourcePublishedAt: "2026-01-01T00:00:00.000Z",
          timeAgo: "",
        },
        { now },
      );
      const incoherent = evaluatePublicationCandidate(
        "intelligence",
        {
          ...validIntelligenceFixture(),
          category: "OUTSIDE INFLUENCE",
          actor: "",
        },
        { now },
      );
      invariant(reasonCodes(invalidCountry).has("country_unresolved"), "country reason");
      invariant(reasonCodes(stale).has("stale_source"), "stale reason");
      invariant(
        reasonCodes(incoherent).has("classification_incoherent"),
        "classification reason",
      );
      return {
        detail: "Invalid country, stale source, and incoherent classification fail closed.",
        metrics: { quarantined: 3, reasonFamilies: 3 },
      };
    }),
    runCheck("country-coverage", "54 unique ISO-3 countries", () => {
      const scoreCodes = BASELINE_COUNTRY_SCORES.map((score) => score.country);
      const dashboardCodes = ALL_SOVEREIGN_DATA.map((country) => country.country);
      for (const codes of [scoreCodes, dashboardCodes]) {
        equal(codes.length, 54, "country row count");
        equal(new Set(codes).size, 54, "unique ISO-3 count");
        equal(
          [...codes].sort().join(","),
          [...AFRICAN_ISO3_CODES].sort().join(","),
          "canonical ISO-3 coverage",
        );
      }
      equal(Object.keys(BASELINE_SCORE_BY_ISO).length, 54, "score index size");
      return {
        detail: "Dashboard, score bundle, and canonical list contain the same 54 unique countries.",
        metrics: { countries: 54, uniqueCountries: 54 },
      };
    }),
    runCheck("status-consistency", "Status boundary consistency", () => {
      const boundaries = [
        [0, "EXTRACTIVE"],
        [50, "EXTRACTIVE"],
        [51, "IMPROVING"],
        [59, "IMPROVING"],
        [60, "STABLE"],
        [74, "STABLE"],
        [75, "OPTIMAL"],
        [100, "OPTIMAL"],
      ] as const;
      for (const [score, status] of boundaries) {
        equal(deriveSovereigntyStatus(score), status, `status at ${score}`);
      }
      for (const score of BASELINE_COUNTRY_SCORES) {
        equal(
          score.status,
          deriveSovereigntyStatus(score.axisScore),
          `${score.country} score status`,
        );
        equal(
          score.methodologyVersion,
          SCORE_METHODOLOGY_VERSION,
          `${score.country} methodology`,
        );
      }
      for (const country of ALL_SOVEREIGN_DATA) {
        equal(
          country.status,
          deriveSovereigntyStatus(country.axisScore),
          `${country.country} dashboard status`,
        );
      }
      return {
        detail: "All threshold fixtures and published/fallback rows derive the same status.",
        metrics: { boundaryFixtures: boundaries.length, rows: 54 },
      };
    }),
    runCheck("provenance", "Provenance completeness", () => {
      const decision = evaluatePublicationCandidate(
        "intelligence",
        validIntelligenceFixture(),
        { now },
      );
      invariant(decision.normalized && decision.identity, "accepted fixture provenance");
      const provenance = provenanceSchema.safeParse({
        sourceUrl: decision.normalized.sourceUrl,
        publisher: decision.normalized.source,
        sourcePublishedAt: decision.normalized.sourcePublishedAt,
        retrievedAt: decision.normalized.retrievedAt,
        observedAt: decision.normalized.sourcePublishedAt,
        contentHash: decision.identity.contentHash,
        excerpt: decision.normalized.summary,
        extractor: "quality-fixture",
        extractorVersion: "1",
      });
      invariant(provenance.success, "provenance schema must validate");
      equal(decision.identity.contentHash.length, 64, "SHA-256 length");
      return {
        detail: "Published fixtures retain canonical URL, publisher, source time, retrieval time, excerpt, and hash.",
        metrics: { hashLength: 64, provenanceFields: 8 },
      };
    }),
    runCheck("blog-relevance", "Blog relevance gate", () => {
      const relevant = evaluatePublicationCandidate(
        "blog",
        validBlogFixture(),
        { now },
      );
      const irrelevant = evaluatePublicationCandidate(
        "blog",
        {
          ...validBlogFixture(),
          title: "European municipal transport procurement outlook",
          summary:
            "A detailed review of municipal transport procurement policy across northern European cities this year.",
          tag: "European transport",
          url: "https://medium.com/@axis/european-transport",
        },
        { now },
      );
      equal(relevant.decision, "publish", "Africa-relevant blog");
      equal(irrelevant.decision, "quarantine", "irrelevant blog");
      invariant(
        reasonCodes(irrelevant).has("africa_relevance_failed"),
        "relevance reason missing",
      );
      return {
        detail: "African development content passes while unrelated content is quarantined.",
        metrics: { relevant: 1, rejected: 1 },
      };
    }),
    runCheck("summary-presence", "Substantive summary requirement", () => {
      const missing = evaluatePublicationCandidate(
        "intelligence",
        { ...validIntelligenceFixture(), summary: "" },
        { now },
      );
      const short = evaluatePublicationCandidate(
        "blog",
        { ...validBlogFixture(), summary: "Too short." },
        { now },
      );
      for (const decision of [missing, short]) {
        equal(decision.decision, "quarantine", "summary gate");
        invariant(
          reasonCodes(decision).has("summary_missing"),
          "summary reason missing",
        );
      }
      return {
        detail: "Missing and undersized intelligence/blog summaries are quarantined.",
        metrics: { rejected: 2, minimumCharacters: 40 },
      };
    }),
    runCheck("rss-intelligence-parity", "RSS and intelligence parity", () => {
      invariant(
        INTELLIGENCE_SOURCES.every((source) => Boolean(source.rssUrl)),
        "every intelligence source needs an RSS fallback",
      );
      const source = INTELLIGENCE_SOURCES.find(
        (item) => item.name === "African Business Magazine",
      );
      invariant(source, "African Business fixture source missing");
      const base = validIntelligenceFixture();
      const direct = shapeIntelligenceCandidates(source, [base], now)[0];
      const rss = shapeIntelligenceCandidates(
        source,
        [
          {
            ...base,
            sourcePublishedAt: undefined,
            isoDate: "2026-07-16T10:00:00.000Z",
          },
        ],
        now,
      )[0];
      const directDecision = evaluatePublicationCandidate(
        "intelligence",
        direct,
        { now },
      );
      const rssDecision = evaluatePublicationCandidate(
        "intelligence",
        rss,
        { now },
      );
      equal(directDecision.decision, "publish", "direct candidate");
      equal(rssDecision.decision, "publish", "RSS candidate");
      invariant(
        directDecision.normalized?.dataset === "intelligence" &&
          rssDecision.normalized?.dataset === "intelligence",
        "RSS/direct candidates must normalize as intelligence",
      );
      equal(
        directDecision.normalized.isoCode,
        rssDecision.normalized.isoCode,
        "RSS/direct ISO parity",
      );
      const blog = shapeBlogCandidates(BLOG_SOURCES[0], [validBlogFixture()], now)[0];
      equal(
        evaluatePublicationCandidate("blog", blog, { now }).decision,
        "publish",
        "RSS-shaped blog",
      );
      return {
        detail: "Configured RSS fallbacks produce the same publishable trust shape as direct extraction.",
        metrics: {
          intelligenceSources: INTELLIGENCE_SOURCES.length,
          rssFallbacks: INTELLIGENCE_SOURCES.filter((item) => item.rssUrl).length,
          blogSources: BLOG_SOURCES.length,
        },
      };
    }),
    runCheck("ingestion-summary", "Ingestion aggregate reporting", () =>
      ingestionSummaryCheck(now),
    ),
  ]);

  const passed = checks.filter((check) => check.passed).length;
  const failed = checks.length - passed;
  const scores = BASELINE_COUNTRY_SCORES;
  const ingestion = checks.find((check) => check.id === "ingestion-summary");
  return {
    version: QUALITY_REPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    fixtureTime: now.toISOString(),
    status: failed === 0 ? "pass" : "fail",
    summary: {
      checks: checks.length,
      passed,
      failed,
      criticalFailed: checks.filter(
        (check) => check.critical && !check.passed,
      ).length,
    },
    metrics: {
      countries: AFRICAN_ISO3_CODES.length,
      uniqueCountries: new Set(AFRICAN_ISO3_CODES).size,
      observations: getBundledBaselineObservations().length,
      minimumCoverage: Math.min(...scores.map((score) => score.coverage)),
      maximumCoverage: Math.max(...scores.map((score) => score.coverage)),
      candidates: Number(ingestion?.metrics.candidates ?? 0),
      published: Number(ingestion?.metrics.published ?? 0),
      quarantined: Number(ingestion?.metrics.quarantined ?? 0),
      sourceFailures: Number(ingestion?.metrics.sourceFailures ?? 0),
    },
    checks,
  };
}
