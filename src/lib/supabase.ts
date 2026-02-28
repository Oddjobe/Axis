import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client for the frontend (subject to Row Level Security)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client for the backend cron jobs (bypasses Row Level Security)
// This will only be instantiated in server environments where the service role key is available.
export const getServiceSupabase = () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Cannot securely access database.")
    return createClient(supabaseUrl, serviceKey)
}
