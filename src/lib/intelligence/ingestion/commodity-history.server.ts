import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COMMODITY_IDS,
  type CommodityId,
} from "./commodity-sources";

export type CommodityHistoryStatus = "loaded" | "bootstrap" | "failed";

export interface CommodityHistorySummary {
  status: CommodityHistoryStatus;
  bootstrap: boolean;
  historyUnavailable: boolean;
  viewAvailable: boolean;
  rowsRead: number;
  duplicateRowsIgnored: number;
  loadedIds: CommodityId[];
  missingIds: CommodityId[];
  latestSourcePublishedAt: string | null;
  latestPublishedAt: string | null;
  error: string | null;
}

export interface CommodityHistoryLoad extends CommodityHistorySummary {
  previousCommodityPrices: Partial<Record<CommodityId, number>>;
  previousCommoditySourcePublishedAt: Partial<Record<CommodityId, string>>;
  previousCommodityPublishedAt: Partial<Record<CommodityId, string>>;
}

export function commodityHistorySummary(
  history: CommodityHistoryLoad,
): CommodityHistorySummary {
  return {
    status: history.status,
    bootstrap: history.bootstrap,
    historyUnavailable: history.historyUnavailable,
    viewAvailable: history.viewAvailable,
    rowsRead: history.rowsRead,
    duplicateRowsIgnored: history.duplicateRowsIgnored,
    loadedIds: history.loadedIds,
    missingIds: history.missingIds,
    latestSourcePublishedAt: history.latestSourcePublishedAt,
    latestPublishedAt: history.latestPublishedAt,
    error: history.error,
  };
}

interface TrustedCommodityRow {
  id: CommodityId;
  price: unknown;
  sourcePublishedAt: number;
  publishedAt: number;
}

const HISTORY_SELECT = "record,source_published_at,published_at";

function normalizePrice(value: unknown): number {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[,$\s]/g, ""))
        : Number.NaN;
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("trusted commodity price must be a positive number");
  }
  return normalized;
}

function requiredId(value: unknown): CommodityId {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!COMMODITY_IDS.includes(id as CommodityId)) {
    throw new Error(`trusted commodity record has unsupported id ${id || "missing"}`);
  }
  return id as CommodityId;
}

function parseRow(value: unknown): TrustedCommodityRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("trusted commodity row must be an object");
  }
  const row = value as Record<string, unknown>;
  const record = row.record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("trusted commodity row is missing its normalized record");
  }
  const normalized = record as Record<string, unknown>;
  const sourcePublishedAt = Date.parse(String(row.source_published_at ?? ""));
  if (!Number.isFinite(sourcePublishedAt)) {
    throw new Error("trusted commodity row has an invalid source_published_at");
  }
  const publishedAt = Date.parse(String(row.published_at ?? ""));
  if (!Number.isFinite(publishedAt)) {
    throw new Error("trusted commodity row has an invalid published_at");
  }
  return {
    id: requiredId(normalized.commodityId ?? normalized.id),
    price: normalized.price,
    sourcePublishedAt,
    publishedAt,
  };
}

function failedHistory(
  error: string,
  options: {
    viewAvailable: boolean;
    rowsRead?: number;
    loadedIds?: CommodityId[];
  },
): CommodityHistoryLoad {
  const loadedIds = [...(options.loadedIds ?? [])].sort() as CommodityId[];
  return {
    status: "failed",
    bootstrap: false,
    historyUnavailable: true,
    viewAvailable: options.viewAvailable,
    rowsRead: options.rowsRead ?? 0,
    duplicateRowsIgnored: 0,
    loadedIds,
    missingIds: COMMODITY_IDS.filter((id) => !loadedIds.includes(id)),
    previousCommodityPrices: {},
    previousCommoditySourcePublishedAt: {},
    previousCommodityPublishedAt: {},
    latestSourcePublishedAt: null,
    latestPublishedAt: null,
    error,
  };
}

function queryError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const value = error as Record<string, unknown>;
  const code = typeof value.code === "string" ? ` (${value.code})` : "";
  const message =
    typeof value.message === "string" ? value.message : "unknown query error";
  return `trusted commodity history query failed${code}: ${message}`;
}

export async function loadPreviousCommodityPrices(
  client: SupabaseClient,
  { signal }: { signal?: AbortSignal } = {},
): Promise<CommodityHistoryLoad> {
  let results: Array<{
    id: CommodityId;
    data: unknown;
    error: unknown;
  }>;
  try {
    results = await Promise.all(
      COMMODITY_IDS.map(async (id) => {
        let query = client
          .from("trusted_published_records")
          .select(HISTORY_SELECT)
          .eq("dataset", "commodity")
          .eq("record->>id", id)
          .order("source_published_at", { ascending: false })
          .order("published_at", { ascending: false });
        if (signal) query = query.abortSignal(signal);
        const result = await query.limit(1);
        return { id, ...result };
      }),
    );
  } catch (error) {
    return failedHistory(queryError(error), { viewAvailable: false });
  }

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return failedHistory(queryError(failed.error), { viewAvailable: false });
  }
  if (results.some((result) => !Array.isArray(result.data))) {
    return failedHistory(
      "trusted commodity history schema failed: query data must be an array",
      { viewAvailable: true },
    );
  }
  let rows: TrustedCommodityRow[];
  try {
    rows = results.flatMap(({ id, data }) =>
      (data as unknown[])
        .map(parseRow)
        .filter((row) => row.id === id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedHistory(`trusted commodity history schema failed: ${message}`, {
      viewAvailable: true,
    });
  }
  if (rows.length === 0) {
    return {
      status: "bootstrap",
      bootstrap: true,
      historyUnavailable: true,
      viewAvailable: true,
      rowsRead: 0,
      duplicateRowsIgnored: 0,
      loadedIds: [],
      missingIds: [...COMMODITY_IDS],
      previousCommodityPrices: {},
      previousCommoditySourcePublishedAt: {},
      previousCommodityPublishedAt: {},
      latestSourcePublishedAt: null,
      latestPublishedAt: null,
      error: null,
    };
  }

  try {
    const newest = rows
      .sort(
        (left, right) =>
          right.sourcePublishedAt - left.sourcePublishedAt ||
          right.publishedAt - left.publishedAt,
      );
    const previousCommodityPrices: Partial<Record<CommodityId, number>> = {};
    const previousCommoditySourcePublishedAt: Partial<Record<CommodityId, string>> = {};
    const previousCommodityPublishedAt: Partial<Record<CommodityId, string>> = {};
    let duplicateRowsIgnored = 0;
    for (const row of newest) {
      if (previousCommodityPrices[row.id] !== undefined) {
        duplicateRowsIgnored += 1;
        continue;
      }
      previousCommodityPrices[row.id] = normalizePrice(row.price);
      previousCommoditySourcePublishedAt[row.id] =
        new Date(row.sourcePublishedAt).toISOString();
      previousCommodityPublishedAt[row.id] =
        new Date(row.publishedAt).toISOString();
    }
    const loadedIds = COMMODITY_IDS.filter(
      (id) => previousCommodityPrices[id] !== undefined,
    );
    const missingIds = COMMODITY_IDS.filter(
      (id) => previousCommodityPrices[id] === undefined,
    );
    if (missingIds.length > 0) {
      return {
        status: "bootstrap",
        bootstrap: true,
        historyUnavailable: false,
        viewAvailable: true,
        rowsRead: rows.length,
        duplicateRowsIgnored,
        loadedIds,
        missingIds,
        previousCommodityPrices,
        previousCommoditySourcePublishedAt,
        previousCommodityPublishedAt,
        latestSourcePublishedAt:
          newest.length > 0
            ? new Date(Math.max(...newest.map((row) => row.sourcePublishedAt))).toISOString()
            : null,
        latestPublishedAt:
          newest.length > 0
            ? new Date(Math.max(...newest.map((row) => row.publishedAt))).toISOString()
            : null,
        error: null,
      };
    }
    return {
      status: "loaded",
      bootstrap: false,
      historyUnavailable: false,
      viewAvailable: true,
      rowsRead: rows.length,
      duplicateRowsIgnored,
      loadedIds,
      missingIds,
      previousCommodityPrices,
      previousCommoditySourcePublishedAt,
      previousCommodityPublishedAt,
      latestSourcePublishedAt:
        newest.length > 0
          ? new Date(Math.max(...newest.map((row) => row.sourcePublishedAt))).toISOString()
          : null,
      latestPublishedAt:
        newest.length > 0
          ? new Date(Math.max(...newest.map((row) => row.publishedAt))).toISOString()
          : null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedHistory(`trusted commodity history schema failed: ${message}`, {
      viewAvailable: true,
      rowsRead: rows.length,
    });
  }
}
