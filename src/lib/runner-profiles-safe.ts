import type { SupabaseClient } from '@supabase/supabase-js'

export type SafeRunnerProfile = {
  id: string
  full_name: string | null
  gender: string | null
  t_shirt_size: string | null
  [key: string]: unknown
}

/**
 * Fetch runner data through `runner_profiles_safe` — the organizer-safe
 * view that EXCLUDES sensitive columns (ic_encrypted, ic_document_*,
 * phone, dob, emergency_contact_*). Raw `runner_profiles` selects and
 * `runner_profiles(...)` embeds inside joined queries are no longer
 * readable by organizers.
 */
export async function getSafeRunnerProfiles(
  supabase: SupabaseClient,
  runnerIds: (string | null | undefined)[],
  columns = 'id, full_name, gender, t_shirt_size',
): Promise<Map<string, SafeRunnerProfile>> {
  const ids = [...new Set(runnerIds.filter(Boolean))] as string[]
  if (ids.length === 0) return new Map()

  const batches: SafeRunnerProfile[][] = []
  // Chunk to keep URLs within PostgREST limits on big rosters.
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from('runner_profiles_safe')
      .select(columns)
      .in('id', ids.slice(i, i + CHUNK))
    if (data) batches.push((data ?? []) as unknown as SafeRunnerProfile[])
  }

  return new Map(batches.flat().map((p) => [p.id, p]))
}
