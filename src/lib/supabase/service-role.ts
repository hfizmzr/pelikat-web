import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only use in server-side admin API routes.
// Env values are resolved at ACCESS time, not module load: `next build`
// evaluates imported modules while collecting page data and the Docker builder
// stage runs without SUPABASE_SERVICE_ROLE_KEY (runtime-only env_file). The
// first property access builds the real client; a missing key throws loudly
// there — no silent fallback to the public client.
function buildClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set (admin-first access at runtime)')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL not set (admin-first access at runtime)')
  }
  return createClient(url, key)
}

let realClient: SupabaseClient | null = null

// Lazy facade: keeps the same `supabaseAdmin` import shape for API routes while
// deferring createClient until a property is actually used at request time.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    realClient ??= buildClient()
    const value = Reflect.get(realClient, prop)
    return typeof value === 'function' ? value.bind(realClient) : value
  },
})
