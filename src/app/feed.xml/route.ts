import {
  getFreshnessMetadata,
  getLatestTimestamp,
  type DataMode,
} from "@/lib/intelligence/trust";
import {
  selectIntelligencePublications,
  type PublicationTier,
} from "@/lib/intelligence/publication-selection.server";

export const dynamic = "force-dynamic";

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  let items = "";
  let dataMode: DataMode = "stale";
  let sourceUpdatedAt: string | null = null;
  let observedAt: string | null = null;
  let publicationTier: PublicationTier = "legacy";

  try {
    const selection = await selectIntelligencePublications(50);
    const data = selection?.records ?? [];
    publicationTier = selection?.publicationTier ?? "legacy";

    if (data.length > 0) {
      const records = data.map((alert) => {
        const freshness = getFreshnessMetadata({
          sourceUpdatedAt:
            alert.sourceUpdatedAt ??
            alert.source_updated_at ??
            alert.sourcePublishedAt ??
            alert.source_published_at ??
            alert.published_at,
          observedAt: alert.observedAt ?? alert.observed_at ?? alert.created_at,
          dataset: "intelligence",
          requestedMode: "live",
        });
        return { alert, freshness };
      });
      sourceUpdatedAt = getLatestTimestamp(records.map(({ freshness }) => freshness.sourceUpdatedAt));
      observedAt = getLatestTimestamp(records.map(({ freshness }) => freshness.observedAt));
      dataMode = getFreshnessMetadata({
        sourceUpdatedAt,
        observedAt,
        dataset: "intelligence",
        requestedMode: "live",
      }).dataMode;
      items = records
        .map(
          ({ alert, freshness }) => `    <item>
      <title>${escapeXml(alert.title ?? "")}</title>
      <description>${escapeXml(alert.summary ?? "")}</description>
      <link>${escapeXml(alert.url ?? "https://axis-mocha.vercel.app")}</link>
      ${freshness.asOf ? `<pubDate>${new Date(freshness.asOf).toUTCString()}</pubDate>` : ""}
      <category>${escapeXml(alert.category ?? "")}</category>
      <axis:dataMode>${freshness.dataMode}</axis:dataMode>
      <axis:publicationTier>${publicationTier}</axis:publicationTier>
      ${freshness.sourceUpdatedAt ? `<axis:sourceUpdatedAt>${freshness.sourceUpdatedAt}</axis:sourceUpdatedAt>` : ""}
      ${freshness.observedAt ? `<axis:observedAt>${freshness.observedAt}</axis:observedAt>` : ""}
      <axis:publisher>${escapeXml(alert.source ?? "Unknown")}</axis:publisher>
    </item>`
        )
        .join("\n");
    }
  } catch {
    // Return empty feed on failure
  }

  const asOf = sourceUpdatedAt ?? observedAt;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:axis="https://axis-mocha.vercel.app/ns/freshness">
  <channel>
    <title>AXIS AFRICA Intelligence Feed</title>
    <link>https://axis-mocha.vercel.app</link>
    <description>Sovereignty and geopolitical intelligence alerts across 54 African nations</description>
    <language>en-us</language>
    ${asOf ? `<lastBuildDate>${new Date(asOf).toUTCString()}</lastBuildDate>` : ""}
    <axis:generatedAt>${generatedAt}</axis:generatedAt>
    <axis:dataMode>${dataMode}</axis:dataMode>
    <axis:publicationTier>${publicationTier}</axis:publicationTier>
    ${sourceUpdatedAt ? `<axis:sourceUpdatedAt>${sourceUpdatedAt}</axis:sourceUpdatedAt>` : ""}
    ${observedAt ? `<axis:observedAt>${observedAt}</axis:observedAt>` : ""}
    ${asOf ? `<axis:asOf>${asOf}</axis:asOf>` : ""}
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
