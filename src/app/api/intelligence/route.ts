import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 60; // Cache for 1 minute at the edge

const FALLBACK_DATA = [
    {
        title: "DRC COBALT EXPORT BAN ENFORCEMENT",
        summary: "DRC government enforces ban on raw cobalt exports, mandating domestic processing to capture more value from its critical mineral reserves.",
        severity: "HIGH",
        category: "SOVEREIGNTY RISK",
        isoCode: "COD",
        timeAgo: "4 HRS AGO",
        source: "Fallback"
    },
    {
        title: "IMF STRUCTURAL ADJUSTMENT IN GHANA",
        summary: "IMF conditions bailout on privatization of state energy assets, raising concerns over sovereignty of critical infrastructure.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "GHA",
        timeAgo: "6 HRS AGO",
        source: "Fallback"
    },
    {
        title: "CHINA SECURES KENYAN PORT EXPANSION",
        summary: "New BRI-funded port expansion at Mombasa increases trade capacity but adds $2.1B to sovereign debt, raising intense debt sustainability questions.",
        severity: "MEDIUM",
        category: "OUTSIDE INFLUENCE",
        isoCode: "KEN",
        timeAgo: "8 HRS AGO",
        source: "Fallback"
    },
    {
        title: "ZAMBIA DEBT RESTRUCTURING FINALIZED",
        summary: "Zambia successfully completes historic $3B debt restructuring with international bondholders under the G20 Common Framework.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "ZMB",
        timeAgo: "10 HRS AGO",
        source: "Fallback"
    },
    {
        title: "EU CBAM IMPACTS SOUTH AFRICAN EXPORTS",
        summary: "EU Carbon Border Adjustment Mechanism expected to sharply reduce South African steel and aluminum export competitiveness.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "ZAF",
        timeAgo: "11 HRS AGO",
        source: "Fallback"
    },
    {
        title: "NIGERIA DANGOTE REFINERY SCALES",
        summary: "Dangote Refinery ramps up domestic petrol production, significantly reducing West Africa's dependency on imported European fuels.",
        severity: "HIGH",
        category: "SOVEREIGNTY RISK",
        isoCode: "NGA",
        timeAgo: "14 HRS AGO",
        source: "Fallback"
    },
    {
        title: "RWANDA TECH HUB EXPANSION",
        summary: "Kigali Innovation City attracts $500M in African-led venture capital, positioning Rwanda as the continent's leading tech sovereignty hub.",
        severity: "LOW",
        category: "SOVEREIGNTY RISK",
        isoCode: "RWA",
        timeAgo: "16 HRS AGO",
        source: "Fallback"
    },
    {
        title: "FRANCE WITHDRAWS FROM NIGER URANIUM",
        summary: "Orano ceases uranium extraction operations in Niger after the military government revokes mining licenses in push for resource sovereignty.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "NER",
        timeAgo: "18 HRS AGO",
        source: "Fallback"
    },
    {
        title: "NAMIBIA LITHIUM PROCESSING LAW",
        summary: "Namibian parliament debates legislation requiring 50% state ownership in new corporate lithium mining ventures.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "NAM",
        timeAgo: "22 HRS AGO",
        source: "Fallback"
    },
    {
        title: "US AGOA EXPIRATION LOOMS",
        summary: "African manufacturers brace for potential tariff hikes as US Congress stalls on reauthorizing the African Growth and Opportunity Act.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "PAN",
        timeAgo: "24 HRS AGO",
        source: "Fallback"
    }
];

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('intelligence_alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw error;

        if (data && data.length > 0) {
            return NextResponse.json(data);
        }

        return NextResponse.json(FALLBACK_DATA);
    } catch (error) {
        console.error("Supabase Intel Fetch Error:", error);
        return NextResponse.json(FALLBACK_DATA);
    }
}
