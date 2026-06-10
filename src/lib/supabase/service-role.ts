import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only use in server-side admin API routes.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
