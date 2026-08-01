import {
  canonicalizeUrl,
  contentHash,
  normalizeText,
  type GateReasonCode,
} from "@/lib/intelligence/publication-gate";
import { DATASET_TRUST_POLICIES } from "@/lib/intelligence/trust";
import type { IngestionPersistence } from "./types";

import type {
  CommodityAdapter,
  RawCommodityCandidate,
} from "./commodity-adapter.server";
import type { CommodityHistorySummary } from "./commodity-history.server";
import {
  COMMODITY_IDS,
  COMMODITY_SOURCES,
  COPPER_LB_TO_TONNE_FORMULA,
  ECB_DAILY_FX_URL,
  ECB_USD_PER_CNY_FORMULA,
  LITHIUM_CNY_TO_USD_FORMULA,
  POUNDS_PER_METRIC_TONNE,
  type CommodityId,
  type CommoditySource,
  type CommodityUnit,
} from "./commodity-sources";

export type CommodityQuarantineCode =
  | "missing_explicit_timestamp"
  | "future_timestamp"
  | "stale_timestamp"
  | "implausible_price"
  | "implausible_price_change"
  | "unsupported_currency"
  | "unsupported_unit"
  | "missing_fx_evidence"
  | "malformed_fx_evidence"
  | "stale_fx_evidence"
  | "future_fx_evidence"
  | "older_than_trusted_source"
  | "source_mismatch"
  | "schema_invalid"
  | "duplicate_candidate"
  | "confidence_below_threshold";

export interface CommodityQuarantineReason {
  code: GateReasonCode;
  commodityCode: CommodityQuarantineCode;
  detail: string;
  retryable: boolean;
}

interface CopperUnitConversion {
  kind: "unit";
  factor: number;
  formula: string;
  fromUnit: "LB" | "LBS";
  toUnit: "T";
}

interface LithiumCurrencyConversion {
  kind: "currency";
  factor: number;
  factorFormula: string;
  formula: string;
  fromCurrency: "CNY";
  toCurrency: "USD";
  fxDate: string;
  fxSourceUrl: typeof ECB_DAILY_FX_URL;
  rates: {
    usdPerEur: number;
    cnyPerEur: number;
  };
}

type CommodityConversion = CopperUnitConversion | LithiumCurrencyConversion | null;

export interface NormalizedCommodityCandidate {
  dataset: "commodity";
  id: CommodityId;
  commodityId: CommodityId;
  rawPrice: number;
  rawUnit: string;
  rawCurrency: string;
  price: number;
  unit: CommodityUnit;
  currency: "USD";
  sourceMarket: string;
  source: string;
  publisher: string;
  sourceUrl: string;
  canonicalUrl: string;
  excerpt: string;
  sourcePublishedAt: string;
  retrievedAt: string;
  conversion: CommodityConversion;
  maximumChangeRatio: number;
  sourceEvidence: {
    publisher: string;
    sourceMarket: string;
    canonicalUrl: string;
    sourcePublishedAt: string;
    excerpt: string;
    retrievedAt: string;
    rawQuote: {
      price: number;
      unit: string;
      currency: string;
    };
    canonicalQuote: {
      price: number;
      unit: CommodityUnit;
      currency: "USD";
    };
    conversion: CommodityConversion;
  };
  contentHash: string;
  confidence: number;
}

interface CommodityConfidence {
  overall: number;
  sourceQuality: number;
  completeness: number;
  corroboration: number;
  recency: number;
  classification: number;
}

export interface CommodityPublicationDecision {
  decision: "publish" | "quarantine";
  dataset: "commodity";
  rawCandidate: unknown;
  evaluatedAt: string;
  normalized: NormalizedCommodityCandidate | null;
  identity: {
    canonicalUrl: string;
    contentHash: string;
    idempotencyKey: string;
  } | null;
  confidence: {
    confidence: CommodityConfidence;
    weights: Omit<CommodityConfidence, "overall">;
    evidence: Record<keyof Omit<CommodityConfidence, "overall">, string>;
  };
  reasons: CommodityQuarantineReason[];
}

export interface CommodityPersistenceResult {
  published: number;
  quarantined: number;
  auditRecorded: number;
  trustStorageAvailable: boolean;
  warnings: string[];
  errors: string[];
}

export interface CommodityRunSummary {
  success: boolean;
  partialSuccess: boolean;
  publicationTier: "trusted" | "mixed" | "legacy";
  coverageMode: "trusted" | "partial" | "legacy";
  trustedCoverage: {
    records: number;
    total: 5;
    ratio: number;
    missingIds: CommodityId[];
  };
  sourceStatus: Array<{
    id: CommodityId;
    publisher: string;
    status: "succeeded" | "failed";
    candidates: number;
    message?: string;
  }>;
  decisions: CommodityPublicationDecision[];
  quality: {
    candidateCount: number;
    acceptedCount: number;
    quarantinedCount: number;
    sourceFailureCount: number;
    rejectionReasons: Record<string, number>;
  };
  persistence: CommodityPersistenceResult | null;
  history: CommodityHistorySummary | null;
}

export interface RunCommodityIngestionOptions {
  adapter: CommodityAdapter;
  persist?: IngestionPersistence;
  sources?: readonly CommoditySource[];
  previousPrices?: Partial<Record<CommodityId, number>>;
  previousSourcePublishedAt?: Partial<Record<CommodityId, string>>;
  history?: CommodityHistorySummary;
  now?: Date;
  signal?: AbortSignal;
}

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const UNIT_ALIASES: Readonly<Record<string, CommodityUnit>> = {
  T: "T",
  TON: "T",
  TONNE: "T",
  "METRIC TON": "T",
  "METRIC TONNE": "T",
  OZ: "OZ",
  OUNCE: "OZ",
  "TROY OUNCE": "OZ",
  MT: "T",
};

function canonicalQuote(
  source: CommoditySource,
  rawPrice: number,
  rawUnit: string,
): {
  price: number;
  unit: CommodityUnit | undefined;
  conversion: CommodityConversion;
} {
  const normalizedUnit = rawUnit
    .toUpperCase()
    .replace(/^[A-Z]{3}\s*\/\s*/, "")
    .trim();
  if (
    source.id === "copper" &&
    (normalizedUnit === "LB" || normalizedUnit === "LBS")
  ) {
    return {
      price: rawPrice * POUNDS_PER_METRIC_TONNE,
      unit: "T",
      conversion: {
        kind: "unit",
        factor: POUNDS_PER_METRIC_TONNE,
        formula: COPPER_LB_TO_TONNE_FORMULA,
        fromUnit: normalizedUnit,
        toUnit: "T",
      },
    };
  }
  return {
    price: rawPrice,
    unit: UNIT_ALIASES[normalizedUnit],
    conversion: null,
  };
}

function emptyConfidence(overall = 0): CommodityPublicationDecision["confidence"] {
  return {
    confidence: {
      overall,
      sourceQuality: 0,
      completeness: 0,
      corroboration: 0,
      recency: 0,
      classification: 0,
    },
    weights: {
      sourceQuality: 0.25,
      completeness: 0.25,
      corroboration: 0.1,
      recency: 0.15,
      classification: 0.25,
    },
    evidence: {
      sourceQuality: "Not calculated because normalization failed.",
      completeness: "Not calculated because normalization failed.",
      corroboration: "Not calculated because normalization failed.",
      recency: "Not calculated because normalization failed.",
      classification: "Not calculated because normalization failed.",
    },
  };
}

function reason(
  code: GateReasonCode,
  commodityCode: CommodityQuarantineCode,
  detail: string,
  retryable = false,
): CommodityQuarantineReason {
  return { code, commodityCode, detail, retryable };
}

function lithiumFxConversion(
  value: unknown,
  now: Date,
  maximumAgeMs: number,
): {
  conversion: LithiumCurrencyConversion | null;
  issue: CommodityQuarantineReason | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      conversion: null,
      issue: reason(
        "missing_provenance",
        "missing_fx_evidence",
        "Lithium CNY quotes require ECB daily USD and CNY reference-rate evidence.",
        true,
      ),
    };
  }
  const evidence = value as Record<string, unknown>;
  if (typeof evidence.error === "string") {
    const malformed = evidence.errorKind === "malformed";
    return {
      conversion: null,
      issue: reason(
        malformed ? "schema_invalid" : "missing_provenance",
        malformed ? "malformed_fx_evidence" : "missing_fx_evidence",
        `ECB daily FX evidence is unavailable: ${normalizeText(evidence.error)}`,
        !malformed,
      ),
    };
  }
  const fxDate = normalizeText(evidence.date);
  const fxSourceUrl = canonicalizeUrl(evidence.sourceUrl);
  const usdPerEur = numberValue(evidence.usdPerEur);
  const cnyPerEur = numberValue(evidence.cnyPerEur);
  const fxTimestamp = /^\d{4}-\d{2}-\d{2}$/.test(fxDate)
    ? Date.parse(`${fxDate}T00:00:00.000Z`)
    : Number.NaN;
  if (
    !Number.isFinite(fxTimestamp) ||
    fxSourceUrl !== canonicalizeUrl(ECB_DAILY_FX_URL) ||
    !Number.isFinite(usdPerEur) ||
    !Number.isFinite(cnyPerEur) ||
    usdPerEur <= 0 ||
    cnyPerEur <= 0
  ) {
    return {
      conversion: null,
      issue: reason(
        "schema_invalid",
        "malformed_fx_evidence",
        "ECB FX evidence must contain its canonical URL, date, and positive USD/CNY rates per EUR.",
      ),
    };
  }
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const ageMs = todayUtc - fxTimestamp;
  if (ageMs < 0) {
    return {
      conversion: null,
      issue: reason(
        "stale_source",
        "future_fx_evidence",
        `ECB FX date ${fxDate} is in the future.`,
        true,
      ),
    };
  }
  if (ageMs > maximumAgeMs) {
    return {
      conversion: null,
      issue: reason(
        "stale_source",
        "stale_fx_evidence",
        `ECB FX date ${fxDate} exceeds the commodity freshness policy.`,
        true,
      ),
    };
  }
  const factor = usdPerEur / cnyPerEur;
  return {
    conversion: {
      kind: "currency",
      factor,
      factorFormula: ECB_USD_PER_CNY_FORMULA,
      formula: LITHIUM_CNY_TO_USD_FORMULA,
      fromCurrency: "CNY",
      toCurrency: "USD",
      fxDate,
      fxSourceUrl: ECB_DAILY_FX_URL,
      rates: { usdPerEur, cnyPerEur },
    },
    issue: null,
  };
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.replace(/[,$\s]/g, "");
  return normalized ? Number(normalized) : Number.NaN;
}

function rawText(raw: RawCommodityCandidate, key: string): string {
  return normalizeText(raw[key]);
}

function matchesConfiguredProvenance(
  source: CommoditySource,
  publisher: string,
  canonicalUrl: string | null,
): boolean {
  const actualPublisher = publisher.toLowerCase();
  const actualUrl = canonicalizeUrl(canonicalUrl);
  if (!actualUrl) return false;
  return [
    { publisher: source.publisher, canonicalUrl: source.canonicalUrl },
    ...(source.alternateProvenance ?? []),
  ].some(
    (provenance) =>
      actualPublisher === provenance.publisher.toLowerCase() &&
      actualUrl === canonicalizeUrl(provenance.canonicalUrl),
  );
}

function normalizeCandidate(
  source: CommoditySource,
  raw: RawCommodityCandidate,
  now: Date,
  previousPrice: number | undefined,
  previousSourcePublishedAt: string | undefined,
): CommodityPublicationDecision {
  const evaluatedAt = now.toISOString();
  const reasons: CommodityQuarantineReason[] = [];
  const rawId = rawText(raw, "commodityId").toLowerCase();
  const rawPrice = numberValue(raw.price);
  const rawUnit = rawText(raw, "unit");
  const canonical = canonicalQuote(source, rawPrice, rawUnit);
  let price = canonical.price;
  const unit = canonical.unit;
  const rawCurrency = rawText(raw, "currency").toUpperCase();
  let canonicalCurrency = rawCurrency;
  let conversion: CommodityConversion = canonical.conversion;
  if (source.id === "lithium" && rawCurrency === "CNY") {
    const fx = lithiumFxConversion(raw.fxEvidence, now, source.maximumAgeMs);
    if (fx.issue) reasons.push(fx.issue);
    if (fx.conversion) {
      price *= fx.conversion.factor;
      canonicalCurrency = "USD";
      conversion = fx.conversion;
    } else {
      price = Number.NaN;
    }
  }
  const sourceMarket = rawText(raw, "sourceMarket");
  const publisher = rawText(raw, "publisher");
  const excerpt = normalizeText(raw.excerpt);
  const canonicalUrl = canonicalizeUrl(raw.canonicalUrl);
  const configuredProvenance = matchesConfiguredProvenance(
    source,
    publisher,
    canonicalUrl,
  );
  const timestampText =
    typeof raw.sourcePublishedAt === "string"
      ? raw.sourcePublishedAt.trim()
      : "";
  const timestampMs = ISO_TIMESTAMP.test(timestampText)
    ? Date.parse(timestampText)
    : Number.NaN;
  const sourcePublishedAt = Number.isFinite(timestampMs)
    ? new Date(timestampMs).toISOString()
    : null;

  if (rawId !== source.id) {
    reasons.push(
      reason(
        "schema_invalid",
        "source_mismatch",
        `Expected commodityId ${source.id}; received ${rawId || "missing"}.`,
      ),
    );
  }
  if (!sourcePublishedAt) {
    reasons.push(
      reason(
        "missing_provenance",
        "missing_explicit_timestamp",
        "sourcePublishedAt must be an explicit ISO-8601 timestamp with a timezone.",
        true,
      ),
    );
  } else {
    const ageMs = now.getTime() - Date.parse(sourcePublishedAt);
    if (ageMs < 0) {
      reasons.push(
        reason(
          "stale_source",
          "future_timestamp",
          `sourcePublishedAt ${sourcePublishedAt} is in the future.`,
          true,
        ),
      );
    } else if (ageMs > source.maximumAgeMs) {
      reasons.push(
        reason(
          "stale_source",
          "stale_timestamp",
          `Evidence is older than the ${Math.round(source.maximumAgeMs / 86_400_000)}-day commodity policy.`,
          true,
        ),
      );
    }
  }
  const previousSourceTimestamp = previousSourcePublishedAt
    ? Date.parse(previousSourcePublishedAt)
    : Number.NaN;
  if (
    sourcePublishedAt &&
    Number.isFinite(previousSourceTimestamp) &&
    Date.parse(sourcePublishedAt) < previousSourceTimestamp
  ) {
    reasons.push(
      reason(
        "stale_source",
        "older_than_trusted_source",
        `Source timestamp ${sourcePublishedAt} is older than trusted baseline ${new Date(previousSourceTimestamp).toISOString()}.`,
      ),
    );
  }
  if (
    (!Number.isFinite(rawPrice) && !Number.isFinite(price)) ||
    (unit === source.unit &&
      canonicalCurrency === "USD" &&
      (price < source.minimumPrice || price > source.maximumPrice))
  ) {
    reasons.push(
      reason(
        "schema_invalid",
        "implausible_price",
        `${source.id} price must be between ${source.minimumPrice} and ${source.maximumPrice} ${source.currency}/${source.unit}.`,
      ),
    );
  }
  if (
    Number.isFinite(price) &&
    unit === source.unit &&
    canonicalCurrency === "USD" &&
    previousPrice !== undefined &&
    Number.isFinite(previousPrice) &&
    previousPrice > 0 &&
    Math.abs(price - previousPrice) / previousPrice > source.maximumChangeRatio
  ) {
    reasons.push(
      reason(
        "schema_invalid",
        "implausible_price_change",
        `${source.id} changed by more than ${(source.maximumChangeRatio * 100).toFixed(0)}% from the previous trusted price.`,
      ),
    );
  }
  const supportedCurrency =
    rawCurrency === source.currency ||
    (source.id === "lithium" && rawCurrency === "CNY");
  if (!supportedCurrency) {
    reasons.push(
      reason(
        "schema_invalid",
        "unsupported_currency",
        `Only ${source.currency}${source.id === "lithium" ? " or native CNY" : ""} quotes are supported; received ${rawCurrency || "missing"}.`,
      ),
    );
  }
  if (!unit || unit !== source.unit) {
    reasons.push(
      reason(
        "schema_invalid",
        "unsupported_unit",
        `Only ${source.unit}${source.id === "copper" ? ", Lb, or Lbs" : ""} is supported for ${source.id}; received ${rawUnit || "missing"}.`,
      ),
    );
  }
  if (
    !configuredProvenance
  ) {
    reasons.push(
      reason(
        "missing_provenance",
        "source_mismatch",
        "Publisher and canonical URL must match a configured public source.",
      ),
    );
  }
  if (
    sourceMarket.toLowerCase() !== source.market.toLowerCase() ||
    excerpt.length < 20
  ) {
    reasons.push(
      reason(
        "schema_invalid",
        "schema_invalid",
        "The configured source market and a substantive supporting excerpt are required.",
      ),
    );
  }

  const suppliedConfidence = numberValue(raw.confidence);
  const overall = Number(
    Math.min(
      source.sourceQuality,
      Number.isFinite(suppliedConfidence) ? suppliedConfidence : 0,
    ).toFixed(4),
  );
  if (
    !Number.isFinite(suppliedConfidence) ||
    overall < DATASET_TRUST_POLICIES.commodity.minimumConfidence
  ) {
    reasons.push(
      reason(
        "confidence_below_threshold",
        "confidence_below_threshold",
        `Confidence ${overall.toFixed(4)} is below ${DATASET_TRUST_POLICIES.commodity.minimumConfidence.toFixed(2)}.`,
        true,
      ),
    );
  }

  if (
    rawId !== source.id ||
    !sourcePublishedAt ||
    !Number.isFinite(price) ||
    !unit ||
    canonicalCurrency !== "USD" ||
    !canonicalUrl
  ) {
    return {
      decision: "quarantine",
      dataset: "commodity",
      rawCandidate: raw,
      evaluatedAt,
      normalized: null,
      identity: null,
      confidence: emptyConfidence(overall),
      reasons,
    };
  }

  const hash = contentHash(
    JSON.stringify({
      commodityId: source.id,
      rawPrice,
      rawUnit,
      rawCurrency,
      price,
      unit,
      currency: canonicalCurrency,
      sourceMarket,
      sourcePublishedAt,
      publisher,
      canonicalUrl,
      excerpt,
      conversion,
    }),
  );
  const sourceEvidence = {
    publisher,
    sourceMarket,
    canonicalUrl,
    sourcePublishedAt,
    excerpt,
    retrievedAt: evaluatedAt,
    rawQuote: {
      price: rawPrice,
      unit: rawUnit,
      currency: rawCurrency,
    },
    canonicalQuote: {
      price,
      unit,
      currency: "USD" as const,
    },
    conversion,
  };
  const normalized: NormalizedCommodityCandidate = {
    dataset: "commodity",
    id: source.id,
    commodityId: source.id,
    rawPrice,
    rawUnit,
    rawCurrency,
    price,
    unit,
    currency: "USD",
    sourceMarket,
    source: publisher,
    publisher,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    excerpt,
    sourcePublishedAt,
    retrievedAt: evaluatedAt,
    conversion,
    maximumChangeRatio: source.maximumChangeRatio,
    sourceEvidence,
    contentHash: hash,
    confidence: overall,
  };
  const ageHours = Math.max(
    0,
    (now.getTime() - Date.parse(sourcePublishedAt)) / 3_600_000,
  );
  const confidence: CommodityPublicationDecision["confidence"] = {
    confidence: {
      overall,
      sourceQuality: source.sourceQuality,
      completeness: 1,
      corroboration: previousPrice === undefined ? 0.5 : 1,
      recency: Math.max(0, 1 - ageHours * 3_600_000 / source.maximumAgeMs),
      classification: reasons.some((item) => item.code === "schema_invalid") ? 0 : 1,
    },
    weights: {
      sourceQuality: 0.25,
      completeness: 0.25,
      corroboration: 0.1,
      recency: 0.15,
      classification: 0.25,
    },
    evidence: {
      sourceQuality: `Configured public source quality is ${source.sourceQuality.toFixed(2)}.`,
      completeness: "All required commodity evidence fields are present.",
      corroboration:
        previousPrice === undefined
          ? "No previous trusted price was supplied."
          : "Compared with the previous trusted price.",
      recency: `Evidence age is ${Math.round(ageHours)} hour(s).`,
      classification: "Commodity, market, unit, currency, and price checks evaluated.",
    },
  };

  return {
    decision: reasons.length === 0 ? "publish" : "quarantine",
    dataset: "commodity",
    rawCandidate: raw,
    evaluatedAt,
    normalized,
    identity: {
      canonicalUrl,
      contentHash: hash,
      idempotencyKey: contentHash(`commodity\n${source.id}\n${canonicalUrl}\n${hash}`),
    },
    confidence,
    reasons,
  };
}

function deduplicateNewest(
  decisions: CommodityPublicationDecision[],
): CommodityPublicationDecision[] {
  const publishable = decisions
    .filter(
      (decision): decision is CommodityPublicationDecision & {
        normalized: NormalizedCommodityCandidate;
      } => decision.decision === "publish" && decision.normalized !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.normalized.sourcePublishedAt) -
        Date.parse(left.normalized.sourcePublishedAt),
    );
  const newestById = new Map<CommodityId, CommodityPublicationDecision>();
  const hashes = new Set<string>();
  for (const decision of publishable) {
    const normalized = decision.normalized;
    const duplicate =
      newestById.has(normalized.id) || hashes.has(normalized.contentHash);
    if (duplicate) {
      decision.decision = "quarantine";
      decision.reasons.push(
        reason(
          "duplicate_candidate",
          "duplicate_candidate",
          `A newer or identical ${normalized.id} quote was already selected.`,
        ),
      );
      continue;
    }
    newestById.set(normalized.id, decision);
    hashes.add(normalized.contentHash);
  }
  return decisions;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rejectionReasons(
  decisions: readonly CommodityPublicationDecision[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    for (const item of decision.reasons) {
      counts[item.commodityCode] = (counts[item.commodityCode] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function runCommodityIngestion(
  options: RunCommodityIngestionOptions,
): Promise<CommodityRunSummary> {
  const now = options.now ?? new Date();
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const signal = controller.signal;
  const sources = options.sources ?? COMMODITY_SOURCES;

  try {
    signal.throwIfAborted();
    if (options.history?.status === "failed") {
      const message =
        options.history.error ?? "Trusted commodity history is unavailable.";
      return {
        success: false,
        partialSuccess: false,
        publicationTier: "legacy",
        coverageMode: "legacy",
        trustedCoverage: {
          records: 0,
          total: 5,
          ratio: 0,
          missingIds: [...COMMODITY_IDS],
        },
        sourceStatus: sources.map((source) => ({
          id: source.id,
          publisher: source.publisher,
          status: "failed" as const,
          candidates: 0,
          message,
        })),
        decisions: [],
        quality: {
          candidateCount: 0,
          acceptedCount: 0,
          quarantinedCount: 0,
          sourceFailureCount: sources.length,
          rejectionReasons: { history_unavailable: 1 },
        },
        persistence: null,
        history: options.history,
      };
    }
    const settled = await Promise.allSettled(
      sources.map(async (source) => ({
        source,
        candidates: await options.adapter.collectCommodity(source, signal),
      })),
    );
    signal.throwIfAborted();

    const decisions: CommodityPublicationDecision[] = [];
    const sourceStatus: CommodityRunSummary["sourceStatus"] = [];
    settled.forEach((result, index) => {
      const source = sources[index];
      if (result.status === "rejected") {
        sourceStatus.push({
          id: source.id,
          publisher: source.publisher,
          status: "failed",
          candidates: 0,
          message: messageOf(result.reason),
        });
        return;
      }
      sourceStatus.push({
        id: source.id,
        publisher: source.publisher,
        status: "succeeded",
        candidates: result.value.candidates.length,
      });
      for (const candidate of result.value.candidates) {
        decisions.push(
          normalizeCandidate(
            source,
            candidate,
            now,
            options.previousPrices?.[source.id],
            options.previousSourcePublishedAt?.[source.id],
          ),
        );
      }
    });
    deduplicateNewest(decisions);

    const acceptedIds = new Set(
      decisions.flatMap((decision) =>
        decision.decision === "publish" && decision.normalized
          ? [decision.normalized.id]
          : [],
      ),
    );
    const missingIds = COMMODITY_IDS.filter((id) => !acceptedIds.has(id));
    const acceptedCount = acceptedIds.size;
    const coverageMode =
      acceptedCount === COMMODITY_IDS.length
        ? "trusted"
        : acceptedCount > 0
          ? "partial"
          : "legacy";
    const publicationTier =
      coverageMode === "trusted"
        ? "trusted"
        : coverageMode === "partial"
          ? "mixed"
          : "legacy";
    let persistence: CommodityPersistenceResult | null = null;
    if (options.persist) {
      persistence = await options.persist("commodity", decisions, signal);
      signal.throwIfAborted();
    }
    const sourceFailureCount = sourceStatus.filter(
      (status) => status.status === "failed",
    ).length;
    const quarantinedCount = decisions.filter(
      (decision) => decision.decision === "quarantine",
    ).length;
    const success =
      coverageMode === "trusted" &&
      sourceFailureCount === 0 &&
      (persistence?.errors.length ?? 0) === 0;

    return {
      success,
      partialSuccess: !success && (acceptedCount > 0 || quarantinedCount > 0),
      publicationTier,
      coverageMode,
      trustedCoverage: {
        records: acceptedCount,
        total: 5,
        ratio: Number((acceptedCount / COMMODITY_IDS.length).toFixed(4)),
        missingIds,
      },
      sourceStatus,
      decisions,
      quality: {
        candidateCount: decisions.length,
        acceptedCount,
        quarantinedCount,
        sourceFailureCount,
        rejectionReasons: rejectionReasons(decisions),
      },
      persistence,
      history: options.history ?? null,
    };
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
