import { evaluatePublicationBatch } from "@/lib/intelligence/publication-gate";
import type { PublicationPersistenceResult } from "@/lib/intelligence/publication-storage";

import {
  shapeBlogCandidates,
  shapeIntelligenceCandidates,
} from "./candidates";
import {
  BLOG_SOURCES,
  CONFIGURED_SOURCE_QUALITY,
  INTELLIGENCE_SOURCES,
  type BlogSource,
  type IntelligenceSource,
} from "./sources";
import type {
  DatasetRunSummary,
  IngestionAdapter,
  IngestionDataset,
  IngestionLogger,
  IngestionPersistence,
  IngestionRunSummary,
  RawCandidate,
  SourceFailure,
  SourceRunStatus,
} from "./types";

interface RunIngestionOptions {
  adapter: IngestionAdapter;
  persist: IngestionPersistence;
  intelligenceSources?: readonly IntelligenceSource[];
  blogSources?: readonly BlogSource[];
  now?: Date;
  logger?: IngestionLogger;
  deadlineAt?: number;
  signal?: AbortSignal;
}

const quietLogger: IngestionLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class IngestionDeadlineError extends Error {
  constructor() {
    super("Ingestion run deadline exhausted");
    this.name = "IngestionDeadlineError";
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(signal.reason ? String(signal.reason) : "Ingestion run aborted");
}

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

function createRunController(options: RunIngestionOptions): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onExternalAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new Error("Ingestion run aborted"),
      );
    }
  };
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  if (options.deadlineAt !== undefined && !controller.signal.aborted) {
    const remainingMs = options.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      controller.abort(new IngestionDeadlineError());
    } else {
      deadlineTimer = setTimeout(
        () => controller.abort(new IngestionDeadlineError()),
        remainingMs,
      );
    }
  }
  return {
    controller,
    cleanup: () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      options.signal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function failedPersistence(message: string): PublicationPersistenceResult {
  return {
    published: 0,
    quarantined: 0,
    auditRecorded: 0,
    trustStorageAvailable: false,
    warnings: [],
    errors: [message],
  };
}

async function collectSources<TSource extends { name: string }>(
  dataset: IngestionDataset,
  sources: readonly TSource[],
  collect: (source: TSource) => Promise<RawCandidate[]>,
  shape: (
    source: TSource,
    candidates: readonly unknown[],
    now: Date,
  ) => RawCandidate[],
  now: Date,
  signal: AbortSignal,
): Promise<{
  candidates: RawCandidate[];
  failures: SourceFailure[];
  sourceStatus: SourceRunStatus[];
  succeeded: number;
}> {
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      ensureActive(signal);
      const candidates = await collect(source);
      ensureActive(signal);
      if (candidates.length === 0) {
        throw new Error("source returned no candidates");
      }
      return shape(source, candidates, now);
    }),
  );
  ensureActive(signal);
  const failures: SourceFailure[] = [];
  const candidates: RawCandidate[] = [];
  const sourceStatus: SourceRunStatus[] = [];
  let succeeded = 0;
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded += 1;
      candidates.push(...result.value);
      sourceStatus.push({
        source: sources[index].name,
        status: "succeeded",
        candidates: result.value.length,
      });
    } else {
      sourceStatus.push({
        source: sources[index].name,
        status: "failed",
        candidates: 0,
      });
      failures.push({
        dataset,
        source: sources[index].name,
        message: messageOf(result.reason),
      });
    }
  });
  return { candidates, failures, sourceStatus, succeeded };
}

function countRejectionReasons(
  decisions: ReturnType<typeof evaluatePublicationBatch>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    for (const item of decision.reasons) {
      counts[item.code] = (counts[item.code] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function runDataset<TSource extends { name: string }>(
  dataset: IngestionDataset,
  sources: readonly TSource[],
  collect: (source: TSource) => Promise<RawCandidate[]>,
  shape: (
    source: TSource,
    candidates: readonly unknown[],
    now: Date,
  ) => RawCandidate[],
  persist: IngestionPersistence,
  now: Date,
  logger: IngestionLogger,
  signal: AbortSignal,
): Promise<DatasetRunSummary> {
  ensureActive(signal);
  const collected = await collectSources(
    dataset,
    sources,
    collect,
    shape,
    now,
    signal,
  );
  const decisions = evaluatePublicationBatch(
    dataset,
    collected.candidates,
    {
      now,
      approvedSourceQuality: Object.fromEntries(
        sources.flatMap((source) => {
          const name = source.name.toLowerCase();
          const quality = CONFIGURED_SOURCE_QUALITY[name];
          return quality === undefined ? [] : [[name, quality] as const];
        }),
      ),
    },
  );
  ensureActive(signal);
  let persistence: PublicationPersistenceResult;
  try {
    persistence = await persist(dataset, decisions, signal);
    ensureActive(signal);
  } catch (error) {
    if (signal.aborted) throw abortError(signal);
    persistence = failedPersistence(
      `Persistence failed for ${dataset}: ${messageOf(error)}`,
    );
  }
  const quarantines = decisions
    .filter((decision) => decision.decision === "quarantine")
    .map((decision) => ({
      dataset,
      idempotencyKey: decision.identity?.idempotencyKey ?? null,
      reasons: decision.reasons,
    }));
  const accepted = decisions.filter(
    (decision) => decision.decision === "publish",
  ).length;
  const quarantined = persistence.quarantined;
  const rejectionReasons = countRejectionReasons(decisions);
  const candidateCount = collected.candidates.length;

  for (const failure of collected.failures) {
    logger.error(`${failure.dataset} source ${failure.source} failed`, failure.message);
  }
  if (quarantines.length > 0) {
    logger.warn(`${dataset} quarantined ${quarantines.length} candidate(s)`, quarantines);
  }
  for (const error of persistence.errors) logger.error(error);

  return {
    sourcesAttempted: sources.length,
    sourcesSucceeded: collected.succeeded,
    sourcesFailed: collected.failures.length,
    candidates: collected.candidates.length,
    published: persistence.published,
    quarantined,
    auditRecorded: persistence.auditRecorded,
    trustStorageAvailable: persistence.trustStorageAvailable,
    failures: collected.failures,
    sourceStatus: collected.sourceStatus,
    quarantines,
    quality: {
      candidateCount,
      acceptedCount: accepted,
      publishedCount: persistence.published,
      quarantinedCount: quarantined,
      sourceFailureCount: collected.failures.length,
      publicationRate: candidateCount
        ? Number((persistence.published / candidateCount).toFixed(4))
        : 0,
      quarantineRate: candidateCount
        ? Number((quarantined / candidateCount).toFixed(4))
        : 0,
      rejectionReasons,
    },
    warnings: persistence.warnings,
    errors: persistence.errors,
  };
}

export async function runIntelligenceIngestion(
  options: RunIngestionOptions,
): Promise<IngestionRunSummary> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const logger = options.logger ?? quietLogger;
  const intelligenceSources =
    options.intelligenceSources ?? INTELLIGENCE_SOURCES;
  const blogSources = options.blogSources ?? BLOG_SOURCES;
  const run = createRunController(options);
  const signal = run.controller.signal;

  try {
    ensureActive(signal);
    const settled = await Promise.allSettled([
      runDataset(
        "intelligence",
        intelligenceSources,
        (source) => options.adapter.collectIntelligence(source, signal),
        shapeIntelligenceCandidates,
        options.persist,
        now,
        logger,
        signal,
      ),
      runDataset(
        "blog",
        blogSources,
        (source) => options.adapter.collectBlog(source, signal),
        shapeBlogCandidates,
        options.persist,
        now,
        logger,
        signal,
      ),
    ]);
    ensureActive(signal);
    const rejected = settled.find(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    if (rejected) throw rejected.reason;
    const [intelligence, blog] = settled.map(
      (item) => (item as PromiseFulfilledResult<DatasetRunSummary>).value,
    );
    const totals = {
      sourcesAttempted:
        intelligence.sourcesAttempted + blog.sourcesAttempted,
      sourcesSucceeded:
        intelligence.sourcesSucceeded + blog.sourcesSucceeded,
      sourcesFailed: intelligence.sourcesFailed + blog.sourcesFailed,
      candidates: intelligence.candidates + blog.candidates,
      published: intelligence.published + blog.published,
      quarantined: intelligence.quarantined + blog.quarantined,
      accepted:
        intelligence.quality.acceptedCount + blog.quality.acceptedCount,
      errors: intelligence.errors.length + blog.errors.length,
      rejectionReasons: Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(intelligence.quality.rejectionReasons),
            ...Object.keys(blog.quality.rejectionReasons),
          ]),
        ]
          .sort()
          .map((code) => [
            code,
            (intelligence.quality.rejectionReasons[code] ?? 0) +
              (blog.quality.rejectionReasons[code] ?? 0),
          ]),
      ),
    };
    const success = totals.sourcesFailed === 0 && totals.errors === 0;
    const partialSuccess =
      !success &&
      (totals.sourcesSucceeded > 0 ||
        totals.published > 0 ||
        totals.quarantined > 0);
    const summary: IngestionRunSummary = {
      success,
      partialSuccess,
      startedAt,
      completedAt: (options.now ?? new Date()).toISOString(),
      deadlineAt: options.deadlineAt
        ? new Date(options.deadlineAt).toISOString()
        : null,
      intelligence,
      blog,
      totals,
    };
    logger.info("Intelligence ingestion summary", summary);
    return summary;
  } finally {
    run.cleanup();
  }
}
