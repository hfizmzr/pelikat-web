/**
 * Theme-asset service-worker caching (P2 Task 7, spec §5.3 cache-safety):
 * cache-first 7-day runtime caching for `event-themes` bucket objects only.
 *
 * The SW source (`src/app/sw.ts`) is compiled as a SEPARATE webpack child
 * compilation, so Next's NEXT_PUBLIC_ DefinePlugin values are NOT inlined
 * there — `next.config.ts` passes a DefinePlugin for the storage origin
 * explicitly (`webpackCompilationPlugins`). This module keeps the matcher
 * construction PURE and unit-tested (tests/theme/serwist.test.ts); the SW
 * only composes it with the env-inlined origin.
 */

/** Bucket path prefix — ONLY objects under it may be served from the cache. */
export const THEME_ASSET_PATH_PREFIX = '/storage/v1/object/public/event-themes/'

/** Cache name — versioned so a rule change can be dropped by bumping. */
export const THEME_ASSET_CACHE_NAME = 'theme-assets-v1'

/** 7 days, in seconds (plan Task 7). */
export const THEME_ASSET_MAX_AGE_SECONDS = 604800
/** Cache entries cap (plan Task 7). */
export const THEME_ASSET_MAX_ENTRIES = 60

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g

function escapeRegExp(v: string): string {
  return v.replace(REGEX_SPECIAL, '\\$&')
}

/**
 * Regex source for the runtimeCaching matcher: the platform storage origin
 * (escaped, https only) immediately followed by the event-themes public
 * prefix. Anchored `^` so other buckets (certificates) and other hosts never
 * match. Returns null for unset/invalid/non-https origins — the SW then
 * ships WITHOUT the theme-asset rule instead of matching broadly.
 */
export function themeAssetMatcherSource(storageOrigin: unknown): string | null {
  if (typeof storageOrigin !== 'string' || storageOrigin.length === 0) return null
  let origin: URL
  try {
    origin = new URL(storageOrigin)
  } catch {
    return null
  }
  if (origin.protocol !== 'https:') return null
  return `^${escapeRegExp(origin.origin)}${escapeRegExp(THEME_ASSET_PATH_PREFIX)}`
}
