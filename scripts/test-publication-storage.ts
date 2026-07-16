import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluatePublicationCandidate } from "../src/lib/intelligence/publication-gate";
import { persistPublicationDecisions } from "../src/lib/intelligence/publication-storage";

type Row = Record<string, unknown>;
type Operation = "select" | "insert" | "update" | "upsert";

class FakeSupabase {
  readonly tables = new Map<string, Row[]>();

  constructor(
    readonly unavailableTrust = false,
    readonly failedWrite?: { table: string; operation: Operation },
  ) {}

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: Row | null }> {
  private operation: Operation = "select";
  private payload: Row | Row[] | null = null;
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private readonly database: FakeSupabase,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[]): this {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  limit(): this {
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: Row | null }> {
    const failure = this.failure();
    if (failure) return { data: null, error: failure };
    return {
      data: this.database.rows(this.table).find((row) => this.matches(row)) ?? null,
      error: null,
    };
  }

  async single(): Promise<{ data: Row; error: Row | null }> {
    const result = this.execute();
    const data = Array.isArray(result.data) ? result.data[0] : result.data;
    return { data: (data ?? {}) as Row, error: result.error };
  }

  then<TResult1 = { data: unknown; error: Row | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: Row | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => filter(row));
  }

  private failure(): Row | null {
    if (
      this.database.unavailableTrust &&
      this.table.startsWith("intelligence_") &&
      !["intelligence_alerts"].includes(this.table)
    ) {
      return {
        message: `Could not find table public.intelligence_source_evidence in the schema cache`,
      };
    }
    if (
      this.database.failedWrite?.table === this.table &&
      this.database.failedWrite.operation === this.operation
    ) {
      return { message: `forced ${this.operation} failure for ${this.table}` };
    }
    return null;
  }

  private execute(): { data: unknown; error: Row | null } {
    const failure = this.failure();
    if (failure) return { data: null, error: failure };

    const rows = this.database.tables.get(this.table) ?? [];
    this.database.tables.set(this.table, rows);
    if (this.operation === "select") {
      return { data: rows.filter((row) => this.matches(row)), error: null };
    }
    if (this.operation === "update") {
      for (const row of rows.filter((item) => this.matches(item))) {
        Object.assign(row, this.payload);
      }
      return { data: null, error: null };
    }

    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const inserted = payloads.map((value) => ({
      ...value,
      id: value.id ?? `${this.table}-${rows.length + 1}`,
    }));
    rows.push(...inserted);
    return { data: inserted, error: null };
  }
}

const now = new Date("2026-07-16T12:00:00.000Z");
const validCandidate = {
  title: "Nigeria expands regional digital trade infrastructure",
  summary:
    "Nigeria announced a cross-border digital trade programme supporting African exporters and AfCFTA market access.",
  severity: "MEDIUM",
  category: "SOVEREIGNTY RISK",
  isoCode: "NGA",
  timeAgo: "2 hours ago",
  source: "African Business Magazine",
  url: "https://african.business/news/item",
};

function client(database: FakeSupabase): SupabaseClient {
  return database as unknown as SupabaseClient;
}

async function main(): Promise<void> {
  const accepted = evaluatePublicationCandidate("intelligence", validCandidate, {
    now,
  });
  assert.equal(accepted.decision, "publish");

  const auditFailure = new FakeSupabase(false, {
    table: "intelligence_evidence_publications",
    operation: "upsert",
  });
  const failedAuditResult = await persistPublicationDecisions(
    client(auditFailure),
    "intelligence",
    [accepted],
  );
  assert.equal(failedAuditResult.published, 0);
  assert.equal(auditFailure.rows("intelligence_alerts").length, 0);
  assert.equal(failedAuditResult.errors.length, 1);

  const migrationMissing = new FakeSupabase(true);
  const noFallback = await persistPublicationDecisions(
    client(migrationMissing),
    "intelligence",
    [accepted],
  );
  assert.equal(noFallback.published, 0);
  assert.equal(noFallback.trustStorageAvailable, false);
  assert(noFallback.warnings[0].includes("fallback is disabled"));

  const explicitFallback = new FakeSupabase(true);
  const withFallback = await persistPublicationDecisions(
    client(explicitFallback),
    "intelligence",
    [accepted],
    { allowLegacyWithoutTrustStorage: true },
  );
  assert.equal(withFallback.published, 1);
  assert.equal(explicitFallback.rows("intelligence_alerts").length, 1);

  const invalid = evaluatePublicationCandidate(
    "blog",
    { title: "Bad", summary: "short" },
    { now },
  );
  assert.equal(invalid.normalized, null);
  const quarantineStore = new FakeSupabase();
  const quarantineResult = await persistPublicationDecisions(
    client(quarantineStore),
    "blog",
    [invalid],
  );
  assert.equal(quarantineResult.quarantined, 1);
  assert.equal(quarantineResult.auditRecorded, 1);
  assert.equal(quarantineStore.rows("intelligence_raw_observations").length, 1);
  assert.equal(quarantineStore.rows("intelligence_candidates").length, 1);
  assert(quarantineStore.rows("intelligence_quarantine_items").length > 0);
  const rawPayload = quarantineStore.rows("intelligence_raw_observations")[0]
    .payload as Row;
  assert.deepEqual(rawPayload.rawCandidate, {
    title: "Bad",
    summary: "short",
  });

  const failedQuarantine = new FakeSupabase(false, {
    table: "intelligence_quarantine_items",
    operation: "insert",
  });
  const failedQuarantineResult = await persistPublicationDecisions(
    client(failedQuarantine),
    "blog",
    [invalid],
  );
  assert.equal(failedQuarantineResult.quarantined, 0);
  assert.equal(failedQuarantineResult.auditRecorded, 0);

  console.log(
    "Publication storage fixtures passed (audit gating, opt-in fallback, durable raw quarantine, persisted counts).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
