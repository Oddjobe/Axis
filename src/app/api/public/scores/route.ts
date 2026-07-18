import { NextResponse } from "next/server";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";
import {
  getFreshnessMetadata,
  getLatestTimestamp,
  type FreshnessMetadata,
} from "@/lib/intelligence/trust";
import {
  BASELINE_SCORE_BY_ISO,
  SCORE_BASELINE_AS_OF,
  SCORE_METHODOLOGY,
} from "@/lib/intelligence/score-methodology";
import {
  getTrustedPublishedRecords,
  recordRetrievalTimestamp,
  trustedPublicationSelectionEnabled,
  trustedSnapshotUnavailable,
} from "@/lib/intelligence/publication-selection.server";
import {
  resolveAuthoritativeScore,
  selectLatestCompleteTrustedScoreRelease,
} from "@/lib/intelligence/score-selection";
import { getPublicationPresentation } from "@/lib/intelligence/publication-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const generatedAt = new Date().toISOString();
  const trustedRows = await getTrustedPublishedRecords("country-score", 500);
  const trustedRelease =
    selectLatestCompleteTrustedScoreRelease(trustedRows);
  if (
    trustedSnapshotUnavailable(trustedRows) ||
    (trustedPublicationSelectionEnabled() && !trustedRelease)
  ) {
    return NextResponse.json(
      {
        success: false,
        source: "trusted/unavailable",
        publicationTier: "trusted",
        fallbackUsed: false,
        dataMode: "stale",
        displayState: getPublicationPresentation({ success: false }).state,
        generatedAt,
        countries: [],
        data: [],
        count: 0,
        total: 0,
        error: "No complete trusted country-score snapshot is available.",
      },
      { status: 503 },
    );
  }
  const trustedByCountry = trustedRelease
    ? new Map(
        trustedRelease.records.map((row) => [
          String(row.country ?? row.id).toUpperCase(),
          row,
        ]),
      )
    : null;
  const countries = ALL_SOVEREIGN_DATA.map((d) => {
    const score = BASELINE_SCORE_BY_ISO[d.country as keyof typeof BASELINE_SCORE_BY_ISO];
    const trusted = trustedByCountry?.get(d.country);
    const authoritative = resolveAuthoritativeScore(score.axisScore, trusted);
    const dimensions =
      trusted?.dimensions && typeof trusted.dimensions === "object"
        ? trusted.dimensions as typeof score.dimensions
        : score.dimensions;
    const trustedTimestamp =
      typeof trusted?.sourcePublishedAt === "string"
        ? trusted.sourcePublishedAt
        : null;
    const trustedObservationTimestamp =
      typeof trusted?.observedAt === "string"
        ? trusted.observedAt
        : null;
    const recordFreshness = getFreshnessMetadata({
      sourceUpdatedAt: trusted ? trustedTimestamp : score.asOf,
      observedAt: trusted ? trustedObservationTimestamp : score.asOf,
      dataset: "country-score",
      requestedMode: trusted ? "live" : "fallback",
    });

    return {
      ...trusted,
      country: d.country,
      name: d.name,
      axisScore: authoritative.axisScore,
      resourceWealth: dimensions.resourceWealth,
      status: authoritative.status,
      trend: d.trend,
      keyResources: d.keyResources,
      dimensions,
      indicators: Array.isArray(trusted?.indicators)
        ? trusted.indicators
        : score.indicators,
      coverage:
        typeof trusted?.coverage === "number"
          ? trusted.coverage
          : score.coverage,
      confidence:
        trusted?.confidence && typeof trusted.confidence === "object"
          ? trusted.confidence
          : score.confidence,
      publicationTier: trusted ? "trusted" : "legacy",
      sources: Array.isArray(trusted?.sources) ? trusted.sources : score.sources,
      methodologyVersion:
        typeof trusted?.methodologyVersion === "string"
          ? trusted.methodologyVersion
          : score.methodologyVersion,
      ...recordFreshness,
      freshness: recordFreshness,
      provenance: {
        publisher:
          typeof trusted?.source === "string"
            ? trusted.source
            : "AXIS Africa",
        sourceUrl:
          typeof trusted?.sourceUrl === "string"
            ? trusted.sourceUrl
            : "https://axis-mocha.vercel.app/methodology",
        sourcePublishedAt: trusted ? trustedTimestamp : score.asOf,
        observedAt: trusted ? trustedObservationTimestamp : score.asOf,
        retrievedAt: trusted
          ? recordRetrievalTimestamp(trusted)
          : SCORE_METHODOLOGY.baselineRetrievedAt,
      },
    };
  });
  const latestSource = getLatestTimestamp(
    countries.map((country) => country.sourceUpdatedAt),
  );
  const latestObservation = getLatestTimestamp(
    countries.map((country) => country.observedAt),
  );
  const freshness: FreshnessMetadata = getFreshnessMetadata({
    sourceUpdatedAt:
      latestSource ?? (trustedByCountry ? null : SCORE_BASELINE_AS_OF),
    observedAt:
      latestObservation ?? (trustedByCountry ? null : SCORE_BASELINE_AS_OF),
    dataset: "country-score",
    requestedMode: trustedByCountry ? "live" : "fallback",
  });
  const source = trustedByCountry ? "trusted" : "legacy/static";
  const publicationTier = trustedByCountry ? "trusted" : "legacy";
  const fallbackUsed = !trustedByCountry;
  const displayState = getPublicationPresentation({
    success: true,
    source,
    publicationTier,
    dataMode: freshness.dataMode,
    fallbackUsed,
    sourceUpdatedAt: freshness.sourceUpdatedAt,
    observedAt: freshness.observedAt,
    generatedAt,
  }).state;

  return NextResponse.json(
    {
      success: true,
      countries,
      data: countries,
      count: countries.length,
      total: countries.length,
      generatedAt,
      timestamp: generatedAt,
      updatedAt: freshness.asOf,
      ...freshness,
      freshness,
      source,
      publicationTier,
      releaseId: trustedRelease?.releaseId ?? null,
      fallbackUsed,
      displayState,
      methodology: SCORE_METHODOLOGY,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=3600",
      },
    }
  );
}
