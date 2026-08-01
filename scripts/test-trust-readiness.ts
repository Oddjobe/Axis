import assert from "node:assert/strict";

import {
  READINESS_RELATIONS,
  READINESS_RPCS,
  assertReadOnlyArguments,
  isTrustStorageReadyForIngestion,
  runTrustReadiness,
  serializeRedactedReport,
} from "../src/lib/intelligence/trust-readiness";

const PROJECT_URL = "https://fixture-project.supabase.co";
const ANON_KEY =
  "eyJfixtureAnonHeader.eyJfixtureAnonPayload.signatureFixtureAnon";
const SERVICE_KEY = "fixture-service-role-secret-value";
const NOW = new Date("2026-07-17T00:00:00.000Z");

interface MockOptions {
  omit?: string[];
  denyServiceRelation?: string;
  trusted?: Partial<Record<string, number>>;
  fresh?: Partial<Record<string, number>>;
  connectivityFailure?: boolean;
  exposeAnonRpc?: boolean;
  newestTimestamp?: string;
  denyAnonOpenApi?: boolean;
}

function response(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
  });
}

function countResponse(count: number): Response {
  return response(200, undefined, { "content-range": `0-0/${count}` });
}

function mockPostgrest(options: MockOptions = {}): {
  fetchImpl: typeof fetch;
  calls: Array<{ method: string; path: string; query: string }>;
} {
  const calls: Array<{ method: string; path: string; query: string }> = [];
  const trusted = {
    intelligence: 9,
    blog: 8,
    "country-score": 54,
    commodity: 6,
    ...options.trusted,
  };
  const fresh = { ...trusted, ...options.fresh };
  const relationCounts: Record<string, number> = {
    intelligence_alerts: 10,
    blog_posts: 8,
    countries: 54,
    commodity_prices: 6,
    intelligence_source_evidence: 77,
    intelligence_evidence_publications: 74,
    intelligence_evidence_provenance: 4,
    intelligence_raw_observations: 77,
    intelligence_candidates: 77,
    intelligence_quarantine_reason_codes: 2,
    intelligence_quarantine_items: 3,
    score_methodology_versions: 1,
    score_methodology_indicators: 12,
    indicator_observations: 648,
    country_score_releases: 2,
    country_score_snapshots: 108,
    country_score_snapshot_indicators: 648,
    trusted_published_records: Object.values(trusted).reduce(
      (sum, value) => sum + value,
      0,
    ),
  };

  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (options.connectivityFailure) throw new Error("fixture offline");
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/rest/v1", "") || "/";
    calls.push({ method, path, query: url.search });
    const authorization = new Headers(init?.headers).get("authorization");
    const service = authorization === `Bearer ${SERVICE_KEY}`;

    if (path === "/") {
      if (!service && options.denyAnonOpenApi) {
        return response(401);
      }
      const paths = Object.fromEntries(
        [
          ...READINESS_RELATIONS.filter(
            (relation) => service || relation.anonReadable,
          ).map((relation) => `/${relation.name}`),
          ...(service || options.exposeAnonRpc
            ? READINESS_RPCS.map((rpc) => `/rpc/${rpc}`)
            : []),
        ]
          .filter((candidate) => !options.omit?.includes(candidate))
          .map((candidate) => [candidate, { get: {} }]),
      );
      return response(200, {
        openapi: "3.0.0",
        paths,
        components: {
          examples: {
            raw_payload: {
              authorization,
              secret: "raw-sensitive-openapi-fixture",
            },
          },
        },
      });
    }

    const relation = path.slice(1);
    if (
      service &&
      options.denyServiceRelation === relation &&
      method === "HEAD"
    ) {
      return response(403);
    }
    if (
      !service &&
      !READINESS_RELATIONS.find(
        (candidate) =>
          candidate.name === relation && candidate.anonReadable,
      )
    ) {
      return response(403);
    }
    if (method === "HEAD" && relation === "trusted_published_records") {
      const dataset = url.searchParams.get("dataset")?.replace("eq.", "") ?? "";
      const selected = url.searchParams.has("source_published_at")
        ? fresh[dataset as keyof typeof fresh]
        : trusted[dataset as keyof typeof trusted];
      return countResponse(selected ?? relationCounts[relation]);
    }
    if (
      method === "GET" &&
      relation === "trusted_published_records"
    ) {
      const dataset = url.searchParams.get("dataset")?.replace("eq.", "") ?? "";
      const selected = trusted[dataset as keyof typeof trusted] ?? 0;
      return response(
        200,
        selected > 0
          ? [{
              source_published_at:
                options.newestTimestamp ?? "2026-07-16T23:00:00.000Z",
            }]
          : [],
      );
    }
    if (
      method === "GET" &&
      relation === "intelligence_quarantine_reason_codes"
    ) {
      return response(200, [
        { code: "missing_provenance" },
        { code: "schema_invalid" },
      ]);
    }
    if (
      method === "HEAD" &&
      relation === "intelligence_quarantine_items" &&
      url.searchParams.has("reason_code")
    ) {
      return countResponse(
        url.searchParams.get("reason_code") === "eq.missing_provenance"
          ? 2
          : 1,
      );
    }
    if (method === "HEAD" && relation in relationCounts) {
      return countResponse(relationCounts[relation]);
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}${url.search}`);
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

const configuredEnv = {
  SUPABASE_URL: PROJECT_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
};

async function validatesReadyAndRedactedReport(): Promise<void> {
  const mock = mockPostgrest();
  const report = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: mock.fetchImpl,
    now: NOW,
  });
  assert.equal(report.ready, true);
  assert.equal(isTrustStorageReadyForIngestion(report), true);
  assert.equal(report.mode, "read-only-readiness");
  assert.equal(report.safety.rpcInvocations, 0);
  assert.equal(report.byDataset.intelligence.currentCount, 10);
  assert.equal(report.byDataset.intelligence.trustedCount, 9);
  assert.equal(report.byDataset.intelligence.coverageRate, 0.9);
  assert.equal(report.byDataset.intelligence.freshnessRate, 1);
  assert(
    mock.calls.some(
      (call) =>
        call.path === "/trusted_published_records" &&
        call.query.includes("source_published_at.lte."),
    ),
  );
  assert.deepEqual(report.quarantine.reasonCounts, {
    missing_provenance: 2,
    schema_invalid: 1,
  });
  assert.equal(
    report.roles.anon.relations.intelligence_candidates.read.state,
    "permission",
  );
  assert.equal(
    report.roles.anon.relations.intelligence_candidates.expectationMet,
    true,
  );
  assert(
    mock.calls.every(
      (call) =>
        ["GET", "HEAD"].includes(call.method) &&
        !call.path.startsWith("/rpc/"),
    ),
  );

  const serialized = serializeRedactedReport(report, [
    PROJECT_URL,
    ANON_KEY,
    SERVICE_KEY,
  ]);
  assert(!serialized.includes(PROJECT_URL));
  assert(!serialized.includes(ANON_KEY));
  assert(!serialized.includes(SERVICE_KEY));
  assert(!serialized.includes("raw-sensitive-openapi-fixture"));
  const parsed = JSON.parse(serialized) as typeof report;
  assert.equal(
    parsed.environment.variables.SUPABASE_SERVICE_ROLE_KEY.present,
    true,
  );

  const accidental = serializeRedactedReport(
    {
      authorization: `Bearer ${SERVICE_KEY}`,
      raw_payload: { customer: "sensitive" },
      safe: `prefix ${PROJECT_URL}`,
    },
    [PROJECT_URL, SERVICE_KEY],
  );
  assert(!accidental.includes("sensitive"));
  assert(!accidental.includes(PROJECT_URL));
  assert(!accidental.includes(SERVICE_KEY));
}

async function validatesFailureCategories(): Promise<void> {
  let calls = 0;
  const missing = await runTrustReadiness({
    env: {},
    fetchImpl: (async () => {
      calls += 1;
      throw new Error("must not call");
    }) as typeof fetch,
    now: NOW,
  });
  assert.equal(calls, 0);
  assert.equal(missing.byDataset.intelligence.state, "missing_config");

  const migrationMock = mockPostgrest({
    omit: [
      "/trusted_published_records",
      "/rpc/persist_publication_batch_atomic",
      "/rpc/publish_country_score_release",
    ],
  });
  const migration = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: migrationMock.fetchImpl,
    now: NOW,
  });
  assert.equal(
    migration.schema.trustRelations.trusted_published_records.state,
    "migration",
  );
  assert.equal(
    migration.schema.rpcs.persist_publication_batch_atomic.state,
    "migration",
  );
  assert.equal(migration.ready, false);
  assert.equal(isTrustStorageReadyForIngestion(migration), false);
  assert(
    migrationMock.calls.every(
      (call) => call.path !== "/trusted_published_records",
    ),
  );

  const permissionMock = mockPostgrest({
    denyServiceRelation: "trusted_published_records",
  });
  const permission = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: permissionMock.fetchImpl,
    now: NOW,
  });
  assert.equal(
    permission.roles.service.relations.trusted_published_records.read.state,
    "permission",
  );
  assert.equal(permission.byDataset.blog.state, "permission");

  const exposedRpc = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: mockPostgrest({ exposeAnonRpc: true }).fetchImpl,
    now: NOW,
  });
  assert.equal(
    exposedRpc.roles.anon.rpcs.persist_publication_batch_atomic.expectationMet,
    false,
  );
  assert(
    exposedRpc.issues.some(
      (issue) =>
        issue.role === "anon" &&
        issue.scope === "rpc:persist_publication_batch_atomic" &&
        issue.state === "permission",
    ),
  );
  assert.equal(exposedRpc.ready, false);

  const futureEvidence = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: mockPostgrest({
      newestTimestamp: "2026-07-17T00:05:00.001Z",
    }).fetchImpl,
    now: NOW,
  });
  assert.equal(futureEvidence.byDataset.intelligence.state, "stale_data");
  assert.equal(futureEvidence.ready, false);

  const connectivityMock = mockPostgrest({ connectivityFailure: true });
  const connectivity = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: connectivityMock.fetchImpl,
    now: NOW,
  });
  assert.equal(connectivity.roles.service.openApi.state, "connectivity");
  assert.equal(connectivity.byDataset.commodity.state, "connectivity");

  const dataMock = mockPostgrest({
    trusted: { intelligence: 0 },
    fresh: { intelligence: 0, blog: 0 },
  });
  const data = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: dataMock.fetchImpl,
    now: NOW,
  });
  assert.equal(data.byDataset.intelligence.state, "empty_data");
  assert.equal(data.byDataset.blog.state, "stale_data");
  assert.equal(data.ready, false);
  assert.equal(isTrustStorageReadyForIngestion(data), true);
}

async function validatesAnonSecurePosture(): Promise<void> {
  const anonDeniedMock = mockPostgrest({ denyAnonOpenApi: true });
  const report = await runTrustReadiness({
    env: configuredEnv,
    fetchImpl: anonDeniedMock.fetchImpl,
    now: NOW,
  });

  // Anon OpenAPI introspection is denied (hardened posture); relations must
  // still be probed directly rather than short-circuited to permission.
  assert.equal(report.roles.anon.openApi.state, "permission");
  assert.equal(
    report.roles.anon.relations.intelligence_alerts.read.state,
    "ready",
  );
  assert.equal(
    report.roles.anon.relations.intelligence_alerts.expectationMet,
    true,
  );
  // Anon-internal relation stays a clean permission denial with expectation met.
  assert.equal(
    report.roles.anon.relations.intelligence_candidates.read.state,
    "permission",
  );
  assert.equal(
    report.roles.anon.relations.intelligence_candidates.expectationMet,
    true,
  );

  // A clean anon permission denial at the OpenAPI root is expected posture,
  // not a readiness failure.
  assert(
    !report.issues.some(
      (issue) => issue.role === "anon" && issue.scope === "openapi",
    ),
  );
  assert(
    !report.issues.some(
      (issue) => issue.role === "anon" && issue.state === "permission",
    ),
  );
  assert.equal(report.ready, true);
}

function validatesWriteRejection(): void {
  for (const argument of [
    "--apply",
    "--write=true",
    "--mode=apply",
    "--method=POST",
    "--rpc=publish_country_score_release",
  ]) {
    assert.throws(
      () => assertReadOnlyArguments([argument]),
      /read-only/,
    );
  }
  assert.doesNotThrow(() =>
    assertReadOnlyArguments(["--mode=read-only", "--method=HEAD"]),
  );
}

async function main(): Promise<void> {
  await validatesReadyAndRedactedReport();
  await validatesFailureCategories();
  await validatesAnonSecurePosture();
  validatesWriteRejection();
  console.log(
    "Trust readiness fixtures passed (redaction, categories, OpenAPI discovery, GET/HEAD-only paths, zero RPC invocation).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
