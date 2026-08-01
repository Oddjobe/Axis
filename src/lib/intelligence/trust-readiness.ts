import { DATASET_TRUST_POLICIES } from "./trust";

export const READINESS_DATASETS = [
  "intelligence",
  "blog",
  "country-score",
  "commodity",
] as const;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export type ReadinessDataset = (typeof READINESS_DATASETS)[number];
export type DiagnosticState =
  | "ready"
  | "missing_config"
  | "migration"
  | "permission"
  | "connectivity"
  | "empty_data"
  | "stale_data";
export type DiagnosticRole = "anon" | "service";

interface RelationDefinition {
  name: string;
  select: string;
  kind: "legacy" | "trust-table" | "trust-view";
  anonReadable: boolean;
}

export const READINESS_RELATIONS: readonly RelationDefinition[] = [
  { name: "intelligence_alerts", select: "id", kind: "legacy", anonReadable: true },
  { name: "blog_posts", select: "id", kind: "legacy", anonReadable: true },
  { name: "countries", select: "id", kind: "legacy", anonReadable: true },
  { name: "commodity_prices", select: "id", kind: "legacy", anonReadable: true },
  {
    name: "intelligence_source_evidence",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "intelligence_evidence_publications",
    select: "evidence_id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "intelligence_evidence_provenance",
    select: "child_evidence_id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "intelligence_raw_observations",
    select: "id",
    kind: "trust-table",
    anonReadable: false,
  },
  {
    name: "intelligence_candidates",
    select: "id",
    kind: "trust-table",
    anonReadable: false,
  },
  {
    name: "intelligence_quarantine_reason_codes",
    select: "code",
    kind: "trust-table",
    anonReadable: false,
  },
  {
    name: "intelligence_quarantine_items",
    select: "id",
    kind: "trust-table",
    anonReadable: false,
  },
  {
    name: "score_methodology_versions",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "score_methodology_indicators",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "indicator_observations",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "country_score_releases",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "country_score_snapshots",
    select: "id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "country_score_snapshot_indicators",
    select: "snapshot_id",
    kind: "trust-table",
    anonReadable: true,
  },
  {
    name: "trusted_published_records",
    select: "dataset",
    kind: "trust-view",
    anonReadable: true,
  },
] as const;

export const READINESS_RPCS = [
  "persist_publication_batch_atomic",
  "publish_country_score_release",
] as const;

const DATASET_RELATIONS: Record<ReadinessDataset, string> = {
  intelligence: "intelligence_alerts",
  blog: "blog_posts",
  "country-score": "countries",
  commodity: "commodity_prices",
};

interface Environment {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface RequestResult {
  state: DiagnosticState;
  status: number | null;
  response?: Response;
  bodyText?: string;
}

export interface ReadProbe {
  state: DiagnosticState;
  status: number | null;
  readable: boolean;
  count: number | null;
}

export interface RoleReadiness {
  configured: boolean;
  openApi: {
    state: DiagnosticState;
    status: number | null;
  };
  relations: Record<
    string,
    {
      kind: RelationDefinition["kind"];
      openApiAvailable: boolean;
      expectedReadable: boolean;
      expectationMet: boolean;
      read: ReadProbe;
    }
  >;
  rpcs: Record<
    string,
    {
      openApiAvailable: boolean;
      expectedExecutable: boolean;
      expectationMet: boolean;
      invoked: false;
    }
  >;
}

export interface DatasetReadiness {
  currentCount: number | null;
  comparableCount: number | null;
  trustedCount: number | null;
  matchedCount: number | null;
  freshCount: number | null;
  coverageRate: number | null;
  freshnessRate: number | null;
  rejectionRate: null;
  newestSourcePublishedAt: string | null;
  maximumAgeMs: number;
  state: DiagnosticState;
}

export interface TrustReadinessReport {
  version: 1;
  mode: "read-only-readiness";
  generatedAt: string;
  environment: {
    variables: Record<keyof Environment, { present: boolean }>;
    resolved: {
      urlFrom: "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL" | null;
      anonCredentialFrom: "NEXT_PUBLIC_SUPABASE_ANON_KEY" | null;
      serviceCredentialFrom: "SUPABASE_SERVICE_ROLE_KEY" | null;
    };
  };
  safety: {
    readOnly: true;
    allowedMethods: ["GET", "HEAD"];
    rpcInvocations: 0;
  };
  roles: Record<DiagnosticRole, RoleReadiness>;
  schema: {
    trustRelations: Record<string, { available: boolean; state: DiagnosticState }>;
    rpcs: Record<string, { available: boolean; state: DiagnosticState; invoked: false }>;
  };
  metricsSourceRole: DiagnosticRole | null;
  byDataset: Record<ReadinessDataset, DatasetReadiness>;
  quarantine: {
    state: DiagnosticState;
    totalCount: number | null;
    reasonCounts: Record<string, number>;
  };
  issues: Array<{
    state: Exclude<DiagnosticState, "ready">;
    scope: string;
    role?: DiagnosticRole;
  }>;
  ready: boolean;
}

export interface TrustReadinessOptions {
  env?: Environment;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
}

/**
 * Checks that the storage contract is safe to ingest into. Dataset completeness
 * intentionally does not participate: an empty or stale dataset is precisely
 * what a repair ingestion run must be allowed to remediate.
 */
export function isTrustStorageReadyForIngestion(
  report: TrustReadinessReport,
): boolean {
  const roles = Object.values(report.roles);
  return (
    roles.every(
      (role) =>
        role.configured &&
        Object.values(role.relations).every(
          (relation) => relation.expectationMet,
        ) &&
        Object.values(role.rpcs).every((rpc) => rpc.expectationMet),
    ) &&
    Object.values(report.schema.trustRelations).every(
      (relation) => relation.available,
    ) &&
    Object.values(report.schema.rpcs).every((rpc) => rpc.available)
  );
}

interface Credential {
  role: DiagnosticRole;
  value: string;
}

interface OpenApiProbe {
  request: RequestResult;
  paths: Set<string>;
}

function diagnosticState(status: number): DiagnosticState {
  if (status === 401 || status === 403) return "permission";
  if (status === 404 || status === 406) return "migration";
  if (status === 408 || status === 429 || status >= 500) return "connectivity";
  return status >= 200 && status < 300 ? "ready" : "connectivity";
}

function countFromResponse(response: Response): number | null {
  const range = response.headers.get("content-range");
  if (!range) return null;
  const match = range.match(/\/(\d+|\*)$/);
  return match && match[1] !== "*" ? Number(match[1]) : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function priorityState(states: DiagnosticState[]): DiagnosticState {
  for (const state of [
    "missing_config",
    "connectivity",
    "migration",
    "permission",
    "empty_data",
    "stale_data",
  ] as const) {
    if (states.includes(state)) return state;
  }
  return "ready";
}

function environmentReport(env: Environment): TrustReadinessReport["environment"] {
  return {
    variables: {
      SUPABASE_URL: { present: Boolean(env.SUPABASE_URL) },
      NEXT_PUBLIC_SUPABASE_URL: {
        present: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        present: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        present: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      },
    },
    resolved: {
      urlFrom: env.SUPABASE_URL
        ? "SUPABASE_URL"
        : env.NEXT_PUBLIC_SUPABASE_URL
          ? "NEXT_PUBLIC_SUPABASE_URL"
          : null,
      anonCredentialFrom: env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        : null,
      serviceCredentialFrom: env.SUPABASE_SERVICE_ROLE_KEY
        ? "SUPABASE_SERVICE_ROLE_KEY"
        : null,
    },
  };
}

function emptyRead(state: DiagnosticState): ReadProbe {
  return { state, status: null, readable: false, count: null };
}

class ReadOnlyPostgrest {
  private readonly restBase: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number,
  ) {
    const normalized = baseUrl.replace(/\/+$/, "");
    this.restBase = normalized.endsWith("/rest/v1")
      ? normalized
      : `${normalized}/rest/v1`;
  }

  async request(
    credential: Credential,
    method: "GET" | "HEAD",
    relation = "",
    query?: URLSearchParams,
    headers?: Record<string, string>,
  ): Promise<RequestResult> {
    if (!["GET", "HEAD"].includes(method)) {
      throw new Error("Trust readiness permits GET and HEAD only.");
    }
    if (relation.startsWith("rpc/") || relation.includes("/rpc/")) {
      throw new Error("Trust readiness never invokes RPC paths.");
    }
    const url = new URL(
      relation ? `${this.restBase}/${encodeURIComponent(relation)}` : `${this.restBase}/`,
    );
    if (/(^|\/)rpc(?:\/|$)/i.test(url.pathname)) {
      throw new Error("Trust readiness never invokes RPC paths.");
    }
    if (query) url.search = query.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: relation ? "application/json" : "application/openapi+json",
          apikey: credential.value,
          Authorization: `Bearer ${credential.value}`,
          ...headers,
        },
        signal: controller.signal,
      });
      const bodyText = method === "GET" ? await response.text() : undefined;
      return {
        state:
          !relation && (response.status === 404 || response.status === 406)
            ? "connectivity"
            : diagnosticState(response.status),
        status: response.status,
        response,
        bodyText,
      };
    } catch {
      return { state: "connectivity", status: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function openApi(
  client: ReadOnlyPostgrest,
  credential: Credential,
): Promise<OpenApiProbe> {
  const request = await client.request(credential, "GET");
  if (request.state !== "ready" || !request.response) {
    return { request, paths: new Set() };
  }
  try {
    const body = JSON.parse(request.bodyText ?? "") as { paths?: unknown };
    const paths =
      body.paths && typeof body.paths === "object"
        ? new Set(Object.keys(body.paths as Record<string, unknown>))
        : new Set<string>();
    return { request, paths };
  } catch {
    return {
      request: { state: "connectivity", status: request.status },
      paths: new Set(),
    };
  }
}

async function headCount(
  client: ReadOnlyPostgrest,
  credential: Credential,
  relation: string,
  select: string,
  filters?: Record<string, string>,
): Promise<ReadProbe> {
  const query = new URLSearchParams({ select });
  for (const [name, value] of Object.entries(filters ?? {})) {
    query.set(name, value);
  }
  const result = await client.request(credential, "HEAD", relation, query, {
    Prefer: "count=exact",
    Range: "0-0",
  });
  if (result.state !== "ready" || !result.response) {
    return {
      state: result.state,
      status: result.status,
      readable: false,
      count: null,
    };
  }
  const count = countFromResponse(result.response);
  if (count === null) {
    return {
      state: "connectivity",
      status: result.status,
      readable: false,
      count: null,
    };
  }
  return {
    state: count === 0 ? "empty_data" : "ready",
    status: result.status,
    readable: true,
    count,
  };
}

function missingRole(): RoleReadiness {
  return {
    configured: false,
    openApi: { state: "missing_config", status: null },
    relations: Object.fromEntries(
      READINESS_RELATIONS.map((relation) => [
        relation.name,
        {
          kind: relation.kind,
          openApiAvailable: false,
          expectedReadable: false,
          expectationMet: false,
          read: emptyRead("missing_config"),
        },
      ]),
    ),
    rpcs: Object.fromEntries(
      READINESS_RPCS.map((rpc) => [
        rpc,
        {
          openApiAvailable: false,
          expectedExecutable: false,
          expectationMet: false,
          invoked: false as const,
        },
      ]),
    ),
  };
}

async function roleReadiness(
  client: ReadOnlyPostgrest,
  credential: Credential,
  schema: OpenApiProbe,
  canonicalPaths: Set<string>,
): Promise<RoleReadiness> {
  const relations: RoleReadiness["relations"] = {};
  const openApiReady = schema.request.state === "ready";
  for (const relation of READINESS_RELATIONS) {
    const path = `/${relation.name}`;
    const available = schema.paths.has(path);
    const existsForAnotherRole = canonicalPaths.has(path);
    const expectedReadable =
      credential.role === "service" || relation.anonReadable;
    let read: ReadProbe;
    if (available || existsForAnotherRole) {
      // Probe directly when the relation is listed for this role, or when it
      // exists canonically (per the service-role schema) but is absent from
      // this role's own OpenAPI. The latter is the expected secure posture for
      // anon, which is denied OpenAPI root introspection (401/403 -> permission)
      // yet can still read anon-readable tables. Assuming a permission failure
      // here produced false-negative issues; a direct HEAD probe is accurate
      // and still catches genuine RLS/permission problems and over-exposure.
      read = await headCount(
        client,
        credential,
        relation.name,
        relation.select,
      );
    } else if (!openApiReady) {
      read = emptyRead(schema.request.state);
    } else {
      read = emptyRead(!expectedReadable ? "permission" : "migration");
    }
    const expectationMet = expectedReadable
      ? read.readable
      : read.state === "permission";
    relations[relation.name] = {
      kind: relation.kind,
      openApiAvailable: available,
      expectedReadable,
      expectationMet,
      read,
    };
  }

  const rpcs = Object.fromEntries(
    READINESS_RPCS.map((rpc) => {
      const available = schema.paths.has(`/rpc/${rpc}`);
      const expectedExecutable = credential.role === "service";
      return [
        rpc,
        {
          openApiAvailable: available,
          expectedExecutable,
          expectationMet: expectedExecutable ? available : !available,
          invoked: false as const,
        },
      ];
    }),
  );
  return {
    configured: true,
    openApi: {
      state: schema.request.state,
      status: schema.request.status,
    },
    relations,
    rpcs,
  };
}

function unresolvedDatasets(
  state: DiagnosticState,
): Record<ReadinessDataset, DatasetReadiness> {
  return Object.fromEntries(
    READINESS_DATASETS.map((dataset) => [
      dataset,
      {
        currentCount: null,
        comparableCount: null,
        trustedCount: null,
        matchedCount: null,
        freshCount: null,
        coverageRate: null,
        freshnessRate: null,
        rejectionRate: null,
        newestSourcePublishedAt: null,
        maximumAgeMs: DATASET_TRUST_POLICIES[dataset].maximumAgeMs,
        state,
      },
    ]),
  ) as Record<ReadinessDataset, DatasetReadiness>;
}

async function newestTimestamp(
  client: ReadOnlyPostgrest,
  credential: Credential,
  dataset: ReadinessDataset,
  now: Date,
): Promise<{ state: DiagnosticState; value: string | null }> {
  const query = new URLSearchParams({
    select: "source_published_at",
    dataset: `eq.${dataset}`,
    source_published_at: "not.is.null",
    order: "source_published_at.desc",
    limit: "1",
  });
  const result = await client.request(
    credential,
    "GET",
    "trusted_published_records",
    query,
  );
  if (result.state !== "ready" || !result.response) {
    return { state: result.state, value: null };
  }
  try {
    const rows = JSON.parse(result.bodyText ?? "") as unknown;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { state: "empty_data", value: null };
    }
    const value = (rows[0] as Record<string, unknown>).source_published_at;
    const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(timestamp) &&
        timestamp <= now.getTime() + MAX_FUTURE_SKEW_MS
      ? { state: "ready", value: value as string }
      : { state: "stale_data", value: null };
  } catch {
    return { state: "connectivity", value: null };
  }
}

async function datasetMetrics(
  client: ReadOnlyPostgrest,
  credential: Credential,
  role: RoleReadiness,
  now: Date,
): Promise<Record<ReadinessDataset, DatasetReadiness>> {
  const output = {} as Record<ReadinessDataset, DatasetReadiness>;
  for (const dataset of READINESS_DATASETS) {
    const legacyRelation = DATASET_RELATIONS[dataset];
    const legacy = role.relations[legacyRelation]?.read ?? emptyRead("migration");
    const trustedView =
      role.relations.trusted_published_records?.read ?? emptyRead("migration");
    const trusted = trustedView.readable
      ? await headCount(
          client,
          credential,
          "trusted_published_records",
          "dataset",
          { dataset: `eq.${dataset}` },
        )
      : trustedView;
    const cutoff = new Date(
      now.getTime() - DATASET_TRUST_POLICIES[dataset].maximumAgeMs,
    ).toISOString();
    const futureLimit = new Date(
      now.getTime() + MAX_FUTURE_SKEW_MS,
    ).toISOString();
    const fresh =
      trusted.readable && (trusted.count ?? 0) > 0
        ? await headCount(
            client,
            credential,
            "trusted_published_records",
            "dataset",
            {
              dataset: `eq.${dataset}`,
              source_published_at: `gte.${cutoff}`,
              and: `(source_published_at.lte.${futureLimit})`,
            },
          )
        : emptyRead(trusted.state);
    const newest =
      trusted.readable && (trusted.count ?? 0) > 0
        ? await newestTimestamp(client, credential, dataset, now)
        : { state: trusted.state, value: null };
    const matched =
      legacy.count === null || trusted.count === null
        ? null
        : Math.min(legacy.count, trusted.count);
    const states = [legacy.state, trusted.state];
    if ((trusted.count ?? 0) > 0) {
      states.push(
        fresh.state === "empty_data" ? "stale_data" : fresh.state,
        newest.state === "empty_data" ? "stale_data" : newest.state,
      );
      states.push(
        (fresh.count ?? 0) > 0 && newest.value ? "ready" : "stale_data",
      );
    }
    output[dataset] = {
      currentCount: legacy.count,
      comparableCount: legacy.count,
      trustedCount: trusted.count,
      matchedCount: matched,
      freshCount: fresh.count,
      coverageRate: ratio(matched, legacy.count),
      freshnessRate: ratio(fresh.count, trusted.count),
      rejectionRate: null,
      newestSourcePublishedAt: newest.value,
      maximumAgeMs: DATASET_TRUST_POLICIES[dataset].maximumAgeMs,
      state: priorityState(states),
    };
  }
  return output;
}

async function quarantineMetrics(
  client: ReadOnlyPostgrest,
  credential: Credential | null,
  role: RoleReadiness,
): Promise<TrustReadinessReport["quarantine"]> {
  if (!credential) {
    return {
      state: "missing_config",
      totalCount: null,
      reasonCounts: {},
    };
  }
  const total =
    role.relations.intelligence_quarantine_items?.read ??
    emptyRead("migration");
  if (!total.readable) {
    return { state: total.state, totalCount: null, reasonCounts: {} };
  }
  const query = new URLSearchParams({
    select: "code",
    order: "code.asc",
    limit: "1000",
  });
  const codesResult = await client.request(
    credential,
    "GET",
    "intelligence_quarantine_reason_codes",
    query,
  );
  if (codesResult.state !== "ready" || !codesResult.response) {
    return {
      state: codesResult.state,
      totalCount: total.count,
      reasonCounts: {},
    };
  }
  let codes: string[];
  try {
    const rows = JSON.parse(codesResult.bodyText ?? "") as unknown;
    codes = Array.isArray(rows)
      ? [
          ...new Set(
            rows
              .map((row) =>
                row && typeof row === "object"
                  ? (row as Record<string, unknown>).code
                  : null,
              )
              .filter(
                (code): code is string =>
                  typeof code === "string" &&
                  /^[a-z][a-z0-9_]{0,63}$/.test(code),
              ),
          ),
        ]
      : [];
  } catch {
    return {
      state: "connectivity",
      totalCount: total.count,
      reasonCounts: {},
    };
  }
  const reasonCounts: Record<string, number> = {};
  for (const code of codes) {
    const count = await headCount(
      client,
      credential,
      "intelligence_quarantine_items",
      "reason_code",
      { reason_code: `eq.${code}` },
    );
    if (!count.readable) {
      return {
        state: count.state,
        totalCount: total.count,
        reasonCounts,
      };
    }
    reasonCounts[code] = count.count ?? 0;
  }
  return {
    state: total.count === 0 ? "empty_data" : "ready",
    totalCount: total.count,
    reasonCounts,
  };
}

function schemaAvailability(
  service: OpenApiProbe | null,
  anon: OpenApiProbe | null,
): TrustReadinessReport["schema"] {
  const canonical =
    service?.request.state === "ready"
      ? service.paths
      : anon?.request.state === "ready"
        ? anon.paths
        : new Set<string>();
  const fallbackState =
    service?.request.state ??
    anon?.request.state ??
    "missing_config";
  return {
    trustRelations: Object.fromEntries(
      READINESS_RELATIONS.filter((relation) => relation.kind !== "legacy").map(
        (relation) => {
          const available = canonical.has(`/${relation.name}`);
          const unavailableState =
            !service && !relation.anonReadable
              ? "missing_config"
              : fallbackState === "ready"
                ? "migration"
                : fallbackState;
          return [
            relation.name,
            {
              available,
              state: available ? ("ready" as const) : unavailableState,
            },
          ];
        },
      ),
    ),
    rpcs: Object.fromEntries(
      READINESS_RPCS.map((rpc) => {
        const available = canonical.has(`/rpc/${rpc}`);
        const unavailableState = !service
          ? "missing_config"
          : fallbackState === "ready"
            ? "migration"
            : fallbackState;
        return [
          rpc,
          {
            available,
            state: available ? ("ready" as const) : unavailableState,
            invoked: false as const,
          },
        ];
      }),
    ),
  };
}

function collectIssues(
  report: Omit<TrustReadinessReport, "issues" | "ready">,
): TrustReadinessReport["issues"] {
  const issues: TrustReadinessReport["issues"] = [];
  if (!report.environment.resolved.urlFrom) {
    issues.push({ state: "missing_config", scope: "supabase-url" });
  }
  for (const [name, relation] of Object.entries(
    report.schema.trustRelations,
  )) {
    if (relation.state !== "ready") {
      issues.push({
        state: relation.state,
        scope: `schema:${name}`,
      });
    }
  }
  for (const [name, rpc] of Object.entries(report.schema.rpcs)) {
    if (rpc.state !== "ready") {
      issues.push({
        state: rpc.state,
        scope: `openapi-rpc:${name}`,
      });
    }
  }
  for (const role of ["anon", "service"] as const) {
    const roleReport = report.roles[role];
    if (!roleReport.configured) {
      issues.push({ state: "missing_config", scope: "credential", role });
      continue;
    }
    if (roleReport.openApi.state !== "ready") {
      // Anon is expected to be denied OpenAPI root introspection under a
      // hardened posture (401/403 -> permission). Relations are probed
      // directly in that case, so a clean anon permission denial is not a
      // readiness failure. Any non-permission anon failure (connectivity,
      // migration) and every non-ready service state still surface.
      const anonSecurePosture =
        role === "anon" && roleReport.openApi.state === "permission";
      if (!anonSecurePosture) {
        issues.push({
          state: roleReport.openApi.state as Exclude<DiagnosticState, "ready">,
          scope: "openapi",
          role,
        });
      }
    }
    for (const [name, relation] of Object.entries(roleReport.relations)) {
      if (!relation.expectationMet) {
        issues.push({
          state:
            relation.read.state === "ready" ||
            relation.read.state === "empty_data"
              ? "permission"
              : (relation.read.state as Exclude<DiagnosticState, "ready">),
          scope: name,
          role,
        });
      }
    }
    for (const [name, rpc] of Object.entries(roleReport.rpcs)) {
      if (!rpc.expectationMet) {
        issues.push({
          state: "permission",
          scope: `rpc:${name}`,
          role,
        });
      }
    }
  }
  for (const [dataset, metrics] of Object.entries(report.byDataset)) {
    if (metrics.state !== "ready") {
      issues.push({
        state: metrics.state as Exclude<DiagnosticState, "ready">,
        scope: `dataset:${dataset}`,
      });
    }
  }
  if (report.quarantine.state !== "ready") {
    issues.push({
      state: report.quarantine.state,
      scope: "quarantine",
      role: "service",
    });
  }
  return issues;
}

export async function runTrustReadiness(
  options: TrustReadinessOptions = {},
): Promise<TrustReadinessReport> {
  const env: Environment = options.env ?? {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const now = options.now ?? new Date();
  const environment = environmentReport(env);
  const baseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const credentials: Partial<Record<DiagnosticRole, Credential>> = {
    anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? { role: "anon", value: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
      : undefined,
    service: env.SUPABASE_SERVICE_ROLE_KEY
      ? { role: "service", value: env.SUPABASE_SERVICE_ROLE_KEY }
      : undefined,
  };

  if (!baseUrl) {
    const partial = {
      version: 1 as const,
      mode: "read-only-readiness" as const,
      generatedAt: now.toISOString(),
      environment,
      safety: {
        readOnly: true as const,
        allowedMethods: ["GET", "HEAD"] as ["GET", "HEAD"],
        rpcInvocations: 0 as const,
      },
      roles: { anon: missingRole(), service: missingRole() },
      schema: schemaAvailability(null, null),
      metricsSourceRole: null,
      byDataset: unresolvedDatasets("missing_config"),
      quarantine: {
        state: "missing_config" as const,
        totalCount: null,
        reasonCounts: {},
      },
    };
    const issues = collectIssues(partial);
    return { ...partial, issues, ready: false };
  }

  const client = new ReadOnlyPostgrest(
    baseUrl,
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? 10_000,
  );
  const [anonSchema, serviceSchema] = await Promise.all([
    credentials.anon ? openApi(client, credentials.anon) : Promise.resolve(null),
    credentials.service
      ? openApi(client, credentials.service)
      : Promise.resolve(null),
  ]);
  const canonicalPaths =
    serviceSchema?.request.state === "ready"
      ? serviceSchema.paths
      : anonSchema?.request.state === "ready"
        ? anonSchema.paths
        : new Set<string>();
  const [anonRole, serviceRole] = await Promise.all([
    credentials.anon && anonSchema
      ? roleReadiness(client, credentials.anon, anonSchema, canonicalPaths)
      : Promise.resolve(missingRole()),
    credentials.service && serviceSchema
      ? roleReadiness(client, credentials.service, serviceSchema, canonicalPaths)
      : Promise.resolve(missingRole()),
  ]);
  const roles = { anon: anonRole, service: serviceRole };
  const metricRole: DiagnosticRole | null = serviceRole.configured
    ? "service"
    : anonRole.configured
      ? "anon"
      : null;
  const metricCredential = metricRole ? credentials[metricRole] ?? null : null;
  const metricRoleReport = metricRole ? roles[metricRole] : null;
  const byDataset =
    metricCredential && metricRoleReport
      ? await datasetMetrics(client, metricCredential, metricRoleReport, now)
      : unresolvedDatasets("missing_config");
  const quarantine = await quarantineMetrics(
    client,
    credentials.service ?? null,
    serviceRole,
  );
  const partial = {
    version: 1 as const,
    mode: "read-only-readiness" as const,
    generatedAt: now.toISOString(),
    environment,
    safety: {
      readOnly: true as const,
      allowedMethods: ["GET", "HEAD"] as ["GET", "HEAD"],
      rpcInvocations: 0 as const,
    },
    roles,
    schema: schemaAvailability(serviceSchema, anonSchema),
    metricsSourceRole: metricRole,
    byDataset,
    quarantine,
  };
  const issues = collectIssues(partial);
  return {
    ...partial,
    issues,
    ready: issues.every(
      (issue) =>
        issue.state === "empty_data" &&
        issue.scope === "quarantine",
    ),
  };
}

const SENSITIVE_KEY =
  /(^|_)(authorization|apikey|credential|key|secret|token|raw_payload|raw_text|payload|response_headers)($|_)/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function redact(value: unknown, secrets: readonly string[], key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key) && typeof value !== "boolean") {
    const presenceOnly =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      typeof (value as { present?: unknown }).present === "boolean";
    const variableName =
      typeof value === "string" && /^[A-Z][A-Z0-9_]+$/.test(value);
    if (!presenceOnly && !variableName) return "[REDACTED]";
  }
  if (typeof value === "string") {
    let output = value.replace(JWT, "[REDACTED]");
    for (const secret of secrets.filter((item) => item.length > 0)) {
      output = output.split(secret).join("[REDACTED]");
    }
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, nested]) => [
        name,
        redact(nested, secrets, name),
      ]),
    );
  }
  return value;
}

export function serializeRedactedReport(
  report: unknown,
  secrets: readonly string[] = [],
  pretty = true,
): string {
  return `${JSON.stringify(redact(report, secrets), null, pretty ? 2 : 0)}\n`;
}

export function assertReadOnlyArguments(args: readonly string[]): void {
  const prohibited = args.find(
    (argument) =>
      /^--(apply|write|mutate|execute|rpc)(=|$)/i.test(argument) ||
      /^--(mode|method)$/i.test(argument) ||
      /^--mode=(?!read-only(?:-readiness)?$)/i.test(argument) ||
      /^--method=(?!get$|head$)/i.test(argument),
  );
  if (prohibited) {
    throw new Error(
      `Trust readiness is read-only; argument ${prohibited.split("=")[0]} is prohibited.`,
    );
  }
}
