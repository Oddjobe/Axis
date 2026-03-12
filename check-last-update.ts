import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function check() {
    console.log("Checking last updates in Supabase...");

    const { data: alerts, error: alertsErr } = await supabase
        .from("intelligence_alerts")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);

    if (alertsErr) {
        console.error("Error fetching alerts:", alertsErr);
    } else if (alerts && alerts.length > 0) {
        console.log(`Latest intelligence_alert created at: ${alerts[0].created_at}`);
    } else {
        console.log("No intelligence alerts found.");
    }

    const { data: blogs, error: blogsErr } = await supabase
        .from("blog_posts")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);

    if (blogsErr) {
        console.error("Error fetching blogs:", blogsErr);
    } else if (blogs && blogs.length > 0) {
        console.log(`Latest blog_post created at: ${blogs[0].created_at}`);
    } else {
        console.log("No blog posts found.");
    }
}

check();
