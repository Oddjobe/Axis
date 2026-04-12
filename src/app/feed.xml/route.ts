import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  let items = "";

  try {
    const { data } = await supabase
      .from("intelligence_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      items = data
        .map(
          (alert) => `    <item>
      <title>${escapeXml(alert.title ?? "")}</title>
      <description>${escapeXml(alert.summary ?? "")}</description>
      <link>${escapeXml(alert.url ?? "https://axis-mocha.vercel.app")}</link>
      <pubDate>${new Date(alert.created_at).toUTCString()}</pubDate>
      <category>${escapeXml(alert.category ?? "")}</category>
    </item>`
        )
        .join("\n");
    }
  } catch {
    // Return empty feed on failure
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AXIS AFRICA Intelligence Feed</title>
    <link>https://axis-mocha.vercel.app</link>
    <description>Live sovereignty and geopolitical intelligence alerts across 54 African nations</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
