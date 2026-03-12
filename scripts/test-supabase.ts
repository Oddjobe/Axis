
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    const { count, error } = await supabase.from('countries').select('*', { count: 'exact', head: true });
    if (error) {
        console.error('Error connecting to Supabase:', error.message);
        process.exit(1);
    }
    console.log('Successfully connected to Supabase.');
    console.log('Countries count:', count);

    // Also test another table mentioned in history
    const { count: blogCount, error: blogError } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true });
    if (!blogError) {
        console.log('Blog posts count:', blogCount);
    }
}

testConnection();
