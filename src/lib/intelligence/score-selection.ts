import {
  AFRICAN_ISO3_CODES,
  deriveSovereigntyStatus,
  type SovereigntyStatus,
} from "@/lib/intelligence/trust";
import type { LegacyRecord } from "@/lib/intelligence/trust-rollout";

export interface TrustedScoreSelection {
  releaseId: string | null;
  publishedAt: string | null;
  records: LegacyRecord[];
}

function countryCode(record: LegacyRecord): string {
  return String(record.country ?? record.id ?? "").toUpperCase();
}

function timestamp(record: LegacyRecord): string | null {
  for (const key of [
    "trustedPublishedAt",
    "publishedAt",
    "sourcePublishedAt",
    "retrievedAt",
  ]) {
    const value = record[key];
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

function newestTimestamp(records: readonly LegacyRecord[]): string | null {
  return records.reduce<string | null>((latest, record) => {
    const candidate = timestamp(record);
    if (!candidate) return latest;
    return !latest || Date.parse(candidate) > Date.parse(latest)
      ? candidate
      : latest;
  }, null);
}

function completeRelease(
  records: readonly LegacyRecord[],
  expectedCodes: readonly string[],
): LegacyRecord[] | null {
  const expected = new Set(expectedCodes);
  const byCountry = new Map<string, LegacyRecord>();
  for (const record of records) {
    const country = countryCode(record);
    if (
      !expected.has(country)
      || typeof record.axisScore !== "number"
      || !Number.isFinite(record.axisScore)
      || record.axisScore < 0
      || record.axisScore > 100
    ) {
      continue;
    }
    const current = byCountry.get(country);
    if (
      !current
      || Date.parse(timestamp(record) ?? "") > Date.parse(timestamp(current) ?? "")
    ) {
      byCountry.set(country, record);
    }
  }
  return byCountry.size === expected.size
    ? expectedCodes.map((code) => byCountry.get(code)!)
    : null;
}

export function selectLatestCompleteTrustedScoreRelease(
  records: readonly LegacyRecord[] | null | undefined,
  expectedCodes: readonly string[] = AFRICAN_ISO3_CODES,
): TrustedScoreSelection | null {
  if (!records?.length) return null;

  const releases = new Map<string, LegacyRecord[]>();
  const legacy: LegacyRecord[] = [];
  for (const record of records) {
    const releaseId = record.releaseId;
    if (typeof releaseId === "string" && releaseId.trim()) {
      const grouped = releases.get(releaseId) ?? [];
      grouped.push(record);
      releases.set(releaseId, grouped);
    } else {
      legacy.push(record);
    }
  }

  const complete = [...releases.entries()]
    .map(([releaseId, grouped]) => ({
      releaseId,
      publishedAt: newestTimestamp(grouped),
      records: completeRelease(grouped, expectedCodes),
    }))
    .filter(
      (
        release,
      ): release is {
        releaseId: string;
        publishedAt: string | null;
        records: LegacyRecord[];
      } =>
        release.records !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""),
    );
  if (complete.length > 0) return complete[0];

  const legacyRelease = completeRelease(legacy, expectedCodes);
  return legacyRelease
    ? {
        releaseId: null,
        publishedAt: newestTimestamp(legacyRelease),
        records: legacyRelease,
      }
    : null;
}

export function resolveAuthoritativeScore(
  baselineScore: number,
  trustedRecord: LegacyRecord | null | undefined,
): { axisScore: number; status: SovereigntyStatus } {
  const trustedScore = trustedRecord?.axisScore;
  const axisScore =
    typeof trustedScore === "number"
    && Number.isFinite(trustedScore)
    && trustedScore >= 0
    && trustedScore <= 100
      ? trustedScore
      : baselineScore;
  return {
    axisScore,
    status: deriveSovereigntyStatus(axisScore),
  };
}

export function mergeAuthoritativeCountryScores<
  T extends { country: string; name: string },
>(
  staticCountries: readonly T[],
  scoreRecords: readonly LegacyRecord[],
): Array<T & LegacyRecord> {
  const byCountry = new Map(
    scoreRecords.map((record) => [countryCode(record), record]),
  );
  return staticCountries.map((staticCountry) => {
    const score = byCountry.get(staticCountry.country);
    if (!score) return { ...staticCountry };
    const dimensions =
      score.dimensions && typeof score.dimensions === "object"
        ? score.dimensions as Record<string, unknown>
        : {};
    return {
      ...staticCountry,
      ...score,
      country: staticCountry.country,
      name: staticCountry.name,
      infrastructureControl:
        dimensions.infrastructureControl ?? score.infrastructureControl,
      policyIndependence:
        dimensions.policyIndependence ?? score.policyIndependence,
      currencyStability:
        dimensions.currencyStability ?? score.currencyStability,
      resourceWealth: dimensions.resourceWealth ?? score.resourceWealth,
    };
  });
}
