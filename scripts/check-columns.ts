import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function checkColumns() {
    console.log('--- intelligence_alerts ---');
    const { data: data1, error: error1 } = await supabase.from('intelligence_alerts').select('*').limit(1);
    if (error1) console.error(error1);
    else {
        const columns = Object.keys(data1[0] || {});
        console.log('Columns:', columns);
        console.log('Has url:', columns.includes('url'));
        console.log('Has imageUrl:', columns.includes('imageUrl'));
    }

    console.log('\n--- blog_posts ---');
    const { data: data2, error: error2 } = await supabase.from('blog_posts').select('*').limit(1);
    if (error2) console.error(error2);
    else console.log('Columns:', Object.keys(data2[0] || {}));
}

checkColumns();
