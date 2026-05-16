import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const hasPublicSupabaseConfig = !!(supabaseUrl && supabaseAnonKey)
const fallbackSupabaseUrl = 'https://placeholder.supabase.co'
const fallbackSupabaseAnonKey = 'placeholder-anon-key'

// Client for the frontend (subject to Row Level Security)
// If env vars are missing in local/dev, keep app routes/components alive so
// existing fallback datasets can render instead of crashing on import.
export const supabase = createClient(
    hasPublicSupabaseConfig ? supabaseUrl : fallbackSupabaseUrl,
    hasPublicSupabaseConfig ? supabaseAnonKey : fallbackSupabaseAnonKey
)

// Client for the backend cron jobs (bypasses Row Level Security)
// This will only be instantiated in server environments where the service role key is available.
export const getServiceSupabase = () => {
    if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.")
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Cannot securely access database.")
    return createClient(supabaseUrl, serviceKey)
}
