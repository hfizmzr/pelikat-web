/**
 * Surface theme helper (P3 Task 3) — the explicit server-side resolve call for
 * pages that need TEXT LABELS, not just CSS vars. Per the plan architecture:
 * EventThemeScope stays CSS-vars-only; surfaces wanting labels call
 * getSurfaceTheme with their own Supabase client and consume
 * ResolvedTheme.labels.
 *
 * labels stays single-source-of-truth via ResolvedTheme; double-resolve with
 * EventThemeScope is the accepted P3 contract (CSS vars use scope, text
 * labels use helper). NOT a React component — pure async helper,
 * server-component-safe (uses the passed client only; callers create their
 * own createClient()).
 *
 * Degrade contract (spec §5.5, plan Task 3): never throws. Three outcomes:
 * - no preset id AND no usable config → BOTH nulls, caller renders platform
 *   defaults with zero DB queries (the fast path — the null-null short
 *   circuit returns before any client access);
 * - resolvable input → full ResolvedTheme + its 6-key labels map
 *   (degradation inside getResolvedTheme still resolves — platform theme,
 *   never a null);
 * - any unexpected failure → both nulls, never a throw.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getResolvedTheme } from './resolve'
import type { EventThemeInput } from './resolve'
import { isPlainObject } from './utils'
import type { LabelKey, ResolvedTheme } from './types'

/** Event-row subset a themed surface must select (Task 11 extends the select
 * with theme columns; consumers pass the row straight through). `id` (the
 * scope always carries it) unlocks the §4.3 RPC fallback for RLS-hidden
 * preset rows inside getResolvedTheme. */
export type SurfaceEventInput = {
  id: string
  theme_preset_id: string | null
  theme_config: unknown
}

export type SurfaceTheme = {
  resolved: ResolvedTheme | null
  labels: Record<LabelKey, string> | null
}

export async function getSurfaceTheme(
  event: SurfaceEventInput,
  client: SupabaseClient,
): Promise<SurfaceTheme> {
  try {
    const presetId =
      typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0
        ? event.theme_preset_id
        : null
    // "No config" = no plain-object theme_config. The merge inside resolve
    // treats non-object shapes the same way (they contribute nothing), so a
    // hostile hand-crafted config with no preset id is the platform-defaults
    // case: short-circuit BEFORE any client access (zero queries).
    const hasConfig = isPlainObject(event.theme_config)
    if (presetId === null && !hasConfig) {
      return { resolved: null, labels: null }
    }
    const resolved = await getResolvedTheme(client, {
      id: event.id,
      theme_preset_id: presetId,
      theme_config: event.theme_config,
    } satisfies EventThemeInput)
    return { resolved, labels: resolved.labels }
  } catch {
    // Belt-and-braces: getResolvedTheme itself never throws (spec §5.5), but
    // the surface helper's public contract is unconditional — any failure
    // → nulls, the caller renders platform defaults.
    return { resolved: null, labels: null }
  }
}
