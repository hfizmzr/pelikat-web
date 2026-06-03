import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // We handle session detection manually in /callback route
        // so disable auto-detection to avoid race conditions
        detectSessionInUrl: false,
      },
    }
  )
}
