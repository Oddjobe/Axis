import type { PublicationDecision } from "@/lib/intelligence/publication-gate";
import type { PublicationPersistenceResult } from "@/lib/intelligence/publication-storage";
import type {
  AtomicPublicationDecision,
} from "@/lib/intelligence/publication-storage";

import type { BlogSource, IntelligenceSource } from "./sources";
import type { CommodityRunSummary } from "./commodity-runner.server";

export type IngestionDataset = "intelligence" | "blog" | "commodity";
export type GateIngestionDataset = Exclude<IngestionDataset, "commodity">;
export type RawCandidate = Record<string, unknown>;

export interface IngestionAdapter {
  collectIntelligence(
    source: IntelligenceSource,
    signal: AbortSignal,
  ): Promise<RawCandidate[]>;
  collectBlog(source: BlogSource, signal: AbortSignal): Promise<RawCandidate[]>;
}

export interface IngestionPersistence {
  (
    dataset: IngestionDataset,
    decisions: readonly AtomicPublicationDecision[],
    signal: AbortSignal,
  ): Promise<PublicationPersistenceResult>;
}

export interface IngestionLogger {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface SourceFailure {
  dataset: IngestionDataset;
  source: string;
  message: string;
}

export interface SourceRunStatus {
  source: string;
  status: "succeeded" | "failed";
  candidates: number;
}

export interface IngestionQualityMetrics {
  candidateCount: number;
  acceptedCount: number;
  publishedCount: number;
  quarantinedCount: number;
  sourceFailureCount: number;
  publicationRate: number;
  quarantineRate: number;
  rejectionReasons: Record<string, number>;
}

export interface QuarantineSummary {
  dataset: IngestionDataset;
  idempotencyKey: string | null;
  reasons: PublicationDecision["reasons"];
}

export interface DatasetRunSummary {
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  candidates: number;
  published: number;
  quarantined: number;
  auditRecorded: number;
  trustStorageAvailable: boolean;
  failures: SourceFailure[];
  sourceStatus: SourceRunStatus[];
  quarantines: QuarantineSummary[];
  quality: IngestionQualityMetrics;
  warnings: string[];
  errors: string[];
}

export interface IngestionRunSummary {
  success: boolean;
  partialSuccess: boolean;
  startedAt: string;
  completedAt: string;
  deadlineAt: string | null;
  intelligence: DatasetRunSummary;
  blog: DatasetRunSummary;
  commodity: CommodityRunSummary | null;
  totals: {
    sourcesAttempted: number;
    sourcesSucceeded: number;
    sourcesFailed: number;
    candidates: number;
    published: number;
    quarantined: number;
    accepted: number;
    errors: number;
    rejectionReasons: Record<string, number>;
  };
}
