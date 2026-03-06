import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function clearDatabase() {
    console.log("Clearing intelligence_alerts table...");
    // A trick to delete all rows in Supabase without a specific match is to use neq on a dummy UUID or just not-null
    const { error: error1 } = await supabase
        .from('intelligence_alerts')
        .delete()
        .not('id', 'is', null);

    if (error1) {
        console.error("Error clearing intelligence_alerts:", error1.message);
    } else {
        console.log("intelligence_alerts cleared successfully.");
    }

    console.log("Clearing blog_posts table...");
    const { error: error2 } = await supabase
        .from('blog_posts')
        .delete()
        .not('id', 'is', null);

    if (error2) {
        console.error("Error clearing blog_posts:", error2.message);
    } else {
        console.log("blog_posts cleared successfully.");
    }
}

clearDatabase();
