export interface PublicationCoverage {
  publicationTier: "trusted" | "mixed" | "legacy";
  coverageMode: "trusted" | "partial" | "legacy";
  records: number;
  total: number;
  ratio: number;
}

export function getPublicationCoverage(
  expectedIds: readonly string[],
  trustedIds: Iterable<string>,
): PublicationCoverage {
  const trusted = new Set(trustedIds);
  const records = expectedIds.filter((id) => trusted.has(id)).length;
  const total = expectedIds.length;
  const ratio = total === 0 ? 0 : Number((records / total).toFixed(4));

  if (records === total && total > 0) {
    return {
      publicationTier: "trusted",
      coverageMode: "trusted",
      records,
      total,
      ratio,
    };
  }
  if (records > 0) {
    return {
      publicationTier: "mixed",
      coverageMode: "partial",
      records,
      total,
      ratio,
    };
  }
  return {
    publicationTier: "legacy",
    coverageMode: "legacy",
    records,
    total,
    ratio,
  };
}
