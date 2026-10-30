/**
 * Surface theme helper (P3 Task 3) — the explicit server-side resolve call for
 * pages that need TEXT LABELS, not just CSS vars. Per the plan architecture:
 * EventThemeScope stays CSS-vars-only; surfaces wanting labels call
 * getSurfaceTheme with their own Supabase client and consume ResolvedTheme.
 *
 * labels stay single-source-of-truth via ResolvedTheme; double-resolve with
 * EventThemeScope is the accepted P3 contract (CSS vars use scope, text
 * labels use helper). NOT a React component — pure async helper,
 * server-component-safe (uses the passed client only; callers create their
 * own createClient()).
 *
 * Degrade contract (spec §5.5, plan Task 3): never throws. Three outcomes:
 * - no preset id AND no usable config → null, caller renders platform
 *   defaults with zero DB queries (the fast path — the null short circuit
 *   returns before any client access);
 * - resolvable input → the full ResolvedTheme (its 6-key labels map rides
 *   along; degradation inside getResolvedTheme still resolves — platform
 *   theme, never null);
 * - any unexpected failure → null, never a throw.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getResolvedThemeOrNull } from './resolve'
import type { EventThemeInput } from './resolve'
import { isPlainObject } from './utils'
import type { ResolvedTheme } from './types'

/** Event-row subset a themed surface must select (Task 11 extends the select
 * with theme columns; consumers pass the row straight through). `id` (the
 * scope always carries it) unlocks the §4.3 RPC fallback for RLS-hidden
 * preset rows inside getResolvedTheme. */
export type SurfaceEventInput = {
  id: string
  theme_preset_id: string | null
  theme_config: unknown
}

/**
 * "Effective theme input" predicate (shared with EventThemeScope + the cert
 * emission gate): a preset id is set, OR theme_config is a plain object with
 * at least one key. NOTE: getSurfaceTheme itself counts even an EMPTY `{}`
 * config as "config" (plain-object rule, P3 Task 3) — that looser fast-path
 * check is pinned separately (surface.test.ts / cert.test.ts) and stays
 * local.
 */
export function hasThemeInput(
  theme_preset_id: unknown,
  theme_config: unknown,
): boolean {
  if (typeof theme_preset_id === 'string' && theme_preset_id.length > 0) return true
  return isPlainObject(theme_config) && Object.keys(theme_config).length > 0
}

export async function getSurfaceTheme(
  event: SurfaceEventInput,
  client: SupabaseClient,
): Promise<ResolvedTheme | null> {
  try {
    const presetId =
      typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0
        ? event.theme_preset_id
        : null
    // "No config" = no plain-object theme_config. The merge inside resolve
    // treats non-object shapes the same way (they contribute nothing), so a
    // hostile hand-crafted config with no preset id is the platform-defaults
    // case: short-circuit BEFORE any client access (zero queries).
    if (presetId === null && !isPlainObject(event.theme_config)) {
      return null
    }
    return await getResolvedThemeOrNull(client, {
      id: event.id,
      theme_preset_id: presetId,
      theme_config: event.theme_config,
    } satisfies EventThemeInput)
  } catch {
    // Belt-and-braces: getResolvedTheme itself never throws (spec §5.5), but
    // the surface helper's public contract is unconditional — any failure
    // → null, the caller renders platform defaults.
    return null
  }
}
