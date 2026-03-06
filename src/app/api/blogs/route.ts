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
        url: "https://medium.com/search?q=AfCFTA+Africa",
        imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "The New Scramble for Africa's Critical Minerals",
        summary: "How DRC, Zambia, and Zimbabwe are learning from Indonesia's nickel playbook to capture more value from lithium and cobalt.",
        author: "James Mwangi",
        tag: "Resource Sovereignty",
        url: "https://medium.com/search?q=DRC+cobalt+lithium",
        imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Digital Bank: Can Africa Build Its Own Financial Rails?",
        summary: "PAPSS, e-Naira, and the push for a Pan-African payment system that bypasses SWIFT and dollar dependency.",
        author: "Amina Osei",
        tag: "Digital Economy",
        url: "https://medium.com/search?q=PAPSS+Africa+banking",
        imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Belt & Road vs. Build Back Better: Africa Caught Between Superpowers",
        summary: "Mapping the competing infrastructure investment frameworks and their implications for African debt sustainability.",
        author: "Chen Wei-Lin",
        tag: "Foreign Influence",
        url: "https://medium.com/search?q=Africa+Belt+and+Road+debt",
        imageUrl: "https://images.unsplash.com/photo-1493946740624-75b8429e3e9f?q=80&w=400&auto=format&fit=crop"
    },
    {
        title: "Dangote Effect: How One Refinery Is Rewriting Nigeria's Oil Story",
        summary: "The 650K bpd Lagos refinery signals a shift from raw export dependency to domestic value-add processing.",
        author: "Okonkwo Emeka",
        tag: "Infrastructure",
        url: "https://medium.com/search?q=Dangote+Refinery+petrol",
        imageUrl: "https://images.unsplash.com/photo-1544256223-746768a41981?q=80&w=400&auto=format&fit=crop"
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
