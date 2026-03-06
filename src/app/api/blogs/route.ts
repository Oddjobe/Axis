import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 300; // Cache for 5 minutes

const FALLBACK_BLOGS = [
    {
        title: "Why AfCFTA Could Be Africa's Greatest Economic Lever",
        summary: "Analysis of how the continental free trade agreement is reshaping intra-African commerce and reducing dependency on external markets.",
        author: "Dr. Folasade Akinwale",
        tag: "AfCFTA Trade",
        url: "https://medium.com/tag/africa"
    },
    {
        title: "The New Scramble for Africa's Critical Minerals",
        summary: "How DRC, Zambia, and Zimbabwe are learning from Indonesia's nickel playbook to capture more value from lithium and cobalt.",
        author: "James Mwangi",
        tag: "Resource Sovereignty",
        url: "https://medium.com/tag/africa"
    },
    {
        title: "Digital Currency Wars: Can Africa Build Its Own Financial Rails?",
        summary: "PAPSS, e-Naira, and the push for a Pan-African payment system that bypasses SWIFT and dollar dependency.",
        author: "Amina Osei",
        tag: "Digital Economy",
        url: "https://medium.com/tag/africa"
    },
    {
        title: "Belt & Road vs. Build Back Better: Africa Caught Between Superpowers",
        summary: "Mapping the competing infrastructure investment frameworks and their implications for African debt sustainability.",
        author: "Chen Wei-Lin",
        tag: "Foreign Influence",
        url: "https://medium.com/tag/geopolitics"
    },
    {
        title: "Dangote Effect: How One Refinery Is Rewriting Nigeria's Oil Story",
        summary: "The 650K bpd Lagos refinery signals a shift from raw export dependency to domestic value-add processing across the continent.",
        author: "Okonkwo Emeka",
        tag: "Infrastructure",
        url: "https://medium.com/tag/african-development"
    }
];

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('blog_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (data && data.length > 0) {
            return NextResponse.json(data);
        }

        return NextResponse.json(FALLBACK_BLOGS);
    } catch (error) {
        console.error("Supabase Blog Fetch Error:", error);
        return NextResponse.json(FALLBACK_BLOGS);
    }
}
