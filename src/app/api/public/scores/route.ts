import { NextResponse } from "next/server";
import { ALL_SOVEREIGN_DATA } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const countries = ALL_SOVEREIGN_DATA.map((d) => ({
    country: d.country,
    name: d.name,
    axisScore: d.axisScore,
    resourceWealth: d.resourceWealth,
    status: d.status,
    trend: d.trend,
    keyResources: d.keyResources,
  }));

  return NextResponse.json(
    {
      countries,
      timestamp: new Date().toISOString(),
      total: countries.length,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=3600",
      },
    }
  );
}
