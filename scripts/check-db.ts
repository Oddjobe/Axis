import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function check() {
    const { count: intelCount, error: err1 } = await supabase.from('intelligence_alerts').select('*', { count: 'exact', head: true });
    const { count: blogCount, error: err2 } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true });

    const { data: alerts } = await supabase.from('intelligence_alerts').select('*').limit(3);
    const { data: blogs } = await supabase.from('blog_posts').select('*').limit(3);

    console.log(`Intel count: ${intelCount}`);
    console.log(`Blog count: ${blogCount}`);
    console.log('Sample Alerts:', JSON.stringify(alerts, null, 2));
    console.log('Sample Blogs:', JSON.stringify(blogs, null, 2));
}

check();
