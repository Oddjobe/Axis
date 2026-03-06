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
        source: "Reuters",
        url: "https://www.reuters.com/markets/commodities/drc-cobalt-ban-impact-2024-03-06/",
        imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "IMF STRUCTURAL ADJUSTMENT IN GHANA",
        summary: "IMF conditions bailout on privatization of state energy assets, raising concerns over sovereignty of critical infrastructure.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "GHA",
        timeAgo: "6 HRS AGO",
        source: "Al Jazeera",
        url: "https://www.aljazeera.com/economy/2024/3/6/ghana-imf-sovereignty-concerns",
        imageUrl: "https://images.unsplash.com/photo-1523456760081-306915f79927?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "CHINA SECURES KENYAN PORT EXPANSION",
        summary: "New BRI-funded port expansion at Mombasa increases trade capacity but adds $2.1B to sovereign debt.",
        severity: "MEDIUM",
        category: "OUTSIDE INFLUENCE",
        isoCode: "KEN",
        timeAgo: "8 HRS AGO",
        source: "Bloomberg",
        url: "https://www.bloomberg.com/news/articles/2024-03-06/china-kenya-port-deal",
        imageUrl: "https://images.unsplash.com/photo-1493946740624-75b8429e3e9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "ZAMBIA DEBT RESTRUCTURING FINALIZED",
        summary: "Zambia successfully completes historic $3B debt restructuring with international bondholders under the G20 Common Framework.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "ZMB",
        timeAgo: "10 HRS AGO",
        source: "Financial Times",
        url: "https://www.ft.com/content/zambia-debt-restructuring",
        imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "EU CBAM IMPACTS SOUTH AFRICAN EXPORTS",
        summary: "EU Carbon Border Adjustment Mechanism expected to sharply reduce South African steel and aluminum export competitiveness.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "ZAF",
        timeAgo: "11 HRS AGO",
        source: "News24",
        url: "https://www.news24.com/fin24/economy/eu-carbon-tax-impact-sa",
        imageUrl: "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "NIGERIA DANGOTE REFINERY SCALES",
        summary: "Dangote Refinery ramps up domestic petrol production, significantly reducing West Africa's dependency on imported European fuels.",
        severity: "HIGH",
        category: "SOVEREIGNTY RISK",
        isoCode: "NGA",
        timeAgo: "14 HRS AGO",
        source: "Vanguard",
        url: "https://www.vanguardngr.com/dangote-refinery-petrol-supply",
        imageUrl: "https://images.unsplash.com/photo-1544256223-746768a41981?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "RWANDA TECH HUB EXPANSION",
        summary: "Kigali Innovation City attracts $500M in African-led venture capital, positioning Rwanda as a leading tech hub.",
        severity: "LOW",
        category: "SOVEREIGNTY RISK",
        isoCode: "RWA",
        timeAgo: "16 HRS AGO",
        source: "TechCrunch",
        url: "https://techcrunch.com/2024/03/06/rwanda-tech-innovation-city/",
        imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "FRANCE WITHDRAWS FROM NIGER URANIUM",
        summary: "Orano ceases uranium extraction operations in Niger after the military government revokes mining licenses.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "NER",
        timeAgo: "18 HRS AGO",
        source: "France24",
        url: "https://www.france24.com/en/africa/niger-uranium-extraction-halt",
        imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "NAMIBIA LITHIUM PROCESSING LAW",
        summary: "Namibian parliament debates legislation requiring 50% state ownership in new corporate lithium mining ventures.",
        severity: "MEDIUM",
        category: "SOVEREIGNTY RISK",
        isoCode: "NAM",
        timeAgo: "22 HRS AGO",
        source: "AllAfrica",
        url: "https://allafrica.com/stories/namibia-lithium-bill",
        imageUrl: "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "US AGOA EXPIRATION LOOMS",
        summary: "African manufacturers brace for potential tariff hikes as US Congress stalls on reauthorizing the AGOA act.",
        severity: "HIGH",
        category: "OUTSIDE INFLUENCE",
        isoCode: "PAN",
        timeAgo: "24 HRS AGO",
        source: "The EastAfrican",
        url: "https://www.theeastafrican.co.ke/tea/business/agoa-expiration-concerns",
        imageUrl: "https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?q=80&w=400&auto=format&fit=crop"
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
