import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type {
  AtomicPublicationDecision,
  PublicationPersistenceResult,
} from "../src/lib/intelligence/publication-storage";
import { createSupabaseIngestionPersistence } from "../src/lib/intelligence/ingestion/persistence.server";
import { runIntelligenceIngestion } from "../src/lib/intelligence/ingestion/orchestrator.server";
import { withBoundedRetry } from "../src/lib/intelligence/ingestion/retry.server";
import type {
  IngestionAdapter,
  IngestionDataset,
} from "../src/lib/intelligence/ingestion/types";

const now = new Date("2026-07-16T12:00:00.000Z");
const persisted = new Set<string>();

const adapter: IngestionAdapter = {
  async collectIntelligence(source) {
    if (source.name === "Broken source") {
      throw new Error("deterministic adapter failure");
    }
    return [
      {
        title: "Nigeria expands regional digital trade infrastructure",
        summary:
          "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "nga",
        timeAgo: "2 hours ago",
        url: "https://african.business/nigeria-trade?utm_source=smoke",
        sourcePublishedAt: "2026-07-16T10:00:00.000Z",
      },
    ];
  },
  async collectBlog() {
    return [
      {
        title: "African infrastructure outlook",
        summary: "Too short for publication.",
        author: "Axis Research",
        tag: "africa",
        url: "https://medium.com/@axis/infrastructure",
        sourcePublishedAt: "2026-07-16T09:00:00.000Z",
      },
    ];
  },
};

async function persist(
  _dataset: IngestionDataset,
  decisions: readonly AtomicPublicationDecision[],
): Promise<PublicationPersistenceResult> {
  let published = 0;
  for (const decision of decisions) {
    if (
      decision.decision === "publish" &&
      decision.identity &&
      !persisted.has(decision.identity.idempotencyKey)
    ) {
      persisted.add(decision.identity.idempotencyKey);
      published += 1;
    }
  }
  return {
    published,
    quarantined: decisions.filter(
      (decision) => decision.decision === "quarantine",
    ).length,
    auditRecorded: decisions.length,
    trustStorageAvailable: true,
    warnings: [],
    errors: [],
  };
}

const options = {
  adapter,
  persist,
  now,
  intelligenceSources: [
    {
      name: "African Business Magazine",
      url: "https://african.business/",
    },
    {
      name: "Broken source",
      url: "https://broken.example.com/africa",
    },
  ],
  blogSources: [
    {
      name: "Medium",
      url: "https://medium.com/tag/africa/recommended",
      rssUrl: "https://medium.com/feed/tag/africa",
    },
  ],
};

async function main(): Promise<void> {
  const atomicMigration = readFileSync(
    "supabase_ingestion_atomic_migration.sql",
    "utf8",
  );
  assert.match(
    atomicMigration,
    /intelligence_raw_observations\s*\(\s*evidence_id,[\s\S]*?VALUES\s*\(\s*v_evidence_id,/,
  );
  assert.match(
    atomicMigration,
    /intelligence_evidence_publications\s*\(\s*evidence_id,[\s\S]*?VALUES\s*\(\s*v_evidence_id,/,
  );
  assert.match(
    atomicMigration,
    /intelligence_quarantine_items\s*\(\s*candidate_id,[\s\S]*?VALUES\s*\(\s*v_candidate_id,/,
  );
  assert.match(
    atomicMigration,
    /p_dataset NOT IN \('intelligence', 'blog', 'commodity'\)/,
  );
  assert.match(
    atomicMigration,
    /Commodity %s was atomically published to trust storage; no legacy commodity write was attempted/,
  );
  assert.match(atomicMigration, /pg_advisory_xact_lock/);
  assert.match(
    atomicMigration,
    /source timestamp % is older than trusted baseline %/,
  );
  assert.match(
    atomicMigration,
    /price change exceeds atomic trusted baseline limit/,
  );
  assert.match(atomicMigration, /maximumChangeRatio/);
  assert.match(
    atomicMigration,
    /c\.validation_state = CASE WHEN item->>'decision' = 'publish'/,
  );
  assert.match(
    atomicMigration,
    /WHEN intelligence_evidence_publications\.publication_state = 'published'/,
  );
  assert.match(
    atomicMigration,
    /FROM PUBLIC, anon, authenticated/,
  );

  const first = await runIntelligenceIngestion(options);
  assert.equal(first.success, false);
  assert.equal(first.partialSuccess, true);
  assert.equal(first.totals.sourcesFailed, 1);
  assert.equal(first.totals.published, 1);
  assert.equal(first.totals.quarantined, 1);
  assert.equal(first.intelligence.failures[0].source, "Broken source");
  assert(
    first.blog.quarantines[0].reasons.some(
      (reason) => reason.code === "schema_invalid",
    ),
  );

  const second = await runIntelligenceIngestion(options);
  assert.equal(second.totals.published, 0);
  assert.equal(persisted.size, 1);

  let starts = 0;
  let releaseBoth: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  const concurrentAdapter: IngestionAdapter = {
    async collectIntelligence(_source, signal) {
      starts += 1;
      if (starts === 2) releaseBoth?.();
      await bothStarted;
      return adapter.collectIntelligence({
        name: "African Business Magazine",
        url: "https://example.com",
      }, signal);
    },
    async collectBlog(_source, signal) {
      starts += 1;
      if (starts === 2) releaseBoth?.();
      await bothStarted;
      return adapter.collectBlog({
        name: "Medium",
        url: "https://medium.com",
        rssUrl: "https://medium.com/feed",
      }, signal);
    },
  };
  await runIntelligenceIngestion({
    ...options,
    adapter: concurrentAdapter,
    intelligenceSources: [options.intelligenceSources[0]],
    deadlineAt: Date.now() + 1_000,
  });
  assert.equal(starts, 2);

  let retryAttempts = 0;
  await assert.rejects(
    withBoundedRetry(
      "smoke budget",
      async () => {
        retryAttempts += 1;
        throw new Error("retry fixture");
      },
      { attempts: 3, delayMs: 100, deadlineAt: Date.now() + 20 },
    ),
  );
  assert.equal(retryAttempts, 1);

  const providerController = new AbortController();
  let providerActive = true;
  const providerWork = withBoundedRetry(
    "abortable provider",
    async (_attempt, _timeout, signal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            providerActive = false;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
    { signal: providerController.signal },
  );
  providerController.abort(new Error("run aborted"));
  await assert.rejects(providerWork, /run aborted/);
  assert.equal(providerActive, false);

  let persistenceStarts = 0;
  let writes = 0;
  const abortAwarePersist = async (
    dataset: IngestionDataset,
    decisions: readonly AtomicPublicationDecision[],
    signal: AbortSignal,
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
    writes += 1;
    return persist(dataset, decisions);
  };
  await assert.rejects(
    runIntelligenceIngestion({
      ...options,
      intelligenceSources: [options.intelligenceSources[0]],
      persist: abortAwarePersist,
      deadlineAt: Date.now() + 30,
    }),
    /deadline exhausted/,
  );
  assert.equal(persistenceStarts, 2);
  assert.equal(writes, 0);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(writes, 0);

  let rpcCalls = 0;
  const fakeSupabase = {
    rpc(name: string) {
      assert.equal(name, "persist_publication_batch_atomic");
      rpcCalls += 1;
      return {
        async abortSignal(signal: AbortSignal) {
          signal.throwIfAborted();
          return {
            data: {
              published: 0,
              quarantined: 0,
              auditRecorded: 0,
              trustStorageAvailable: true,
              warnings: [],
              errors: [],
            },
            error: null,
          };
        },
      };
    },
  };
  const atomicPersist = createSupabaseIngestionPersistence(
    fakeSupabase as never,
  );
  await atomicPersist("intelligence", [], new AbortController().signal);
  assert.equal(rpcCalls, 1);
  await atomicPersist("commodity", [], new AbortController().signal);
  assert.equal(rpcCalls, 2);
  const aborted = new AbortController();
  aborted.abort(new Error("deadline"));
  await assert.rejects(atomicPersist("intelligence", [], aborted.signal));
  assert.equal(rpcCalls, 2);

  console.log(
    "Ingestion smoke passed (abort settlement, atomic persistence, no post-deadline writes).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
