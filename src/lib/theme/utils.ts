/**
 * Shared theme utilities — P2 Task 2. One implementation each for the plain
 * object guard and the §5.4 font-URL allowlist; resolve/validate/draft/scope/css
 * all consume THESE (previous per-module copies deleted).
 */
/** Non-null, non-array, non-Date/Map object (JSONB can only ever be the plain kind). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Map)
  )
}

/**
 * Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$)
 * — the ONE shared instance (validate/resolve/theme-editor). color.ts's own
 * runtime regex is looser (`#` optional) and intentionally stays private.
 */
export const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Font URL allowlist — spec §5.4, enforced here (app layer). The DB-layer
 *  charset check is bypassable via `https://host/../x` (Task 1 review pin);
 *  URL normalization + the .woff2 check below close that path. */
const FONT_STATIC_HOST = 'fonts.gstatic.com'

function platformStorageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).host
  } catch {
    return null
  }
}

/** 076 asset value rule (shared with the save validator): relative bucket paths
 * ([A-Za-z0-9/_.-]+, no '..') or https URLs pinned to the platform storage
 * origin (P3 Task 7 — assets are not fonts: fonts.gstatic.com is
 * themeFontUrlOk's allowlist only, invalid for ASSET values). ':' is
 * off-charset, so javascript:/http: URIs fail the path branch. */
const ASSET_PATH_RE = /^[A-Za-z0-9/_.-]+$/

export function assetValueOk(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (value.startsWith('https://')) {
    const host = platformStorageHost()
    if (host === null) return false
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }
  return !value.includes('..') && ASSET_PATH_RE.test(value)
}

/**
 * Validate a font URL against the §5.4 allowlist: https only, host is the
 * platform storage origin (Supabase) or fonts.gstatic.com, path ends
 * `.woff2`, no dot-dot path segments. Returns false for anything else —
 * callers degrade instead of throwing (spec §5.5).
 */
export function themeFontUrlOk(url: unknown): boolean {
  if (typeof url !== 'string') return false
  // Traversal guard runs on the RAW string: URL normalization silently
  // resolves `..` away, which is exactly the DB-layer bypass this boundary
  // replaces (Task 1 review pin). Covers raw and percent-encoded segments on
  // BOTH sides of the dot-dot run — including the fully-encoded `%2e%2e%2f`
  // and the `x%2f..%2fy` leader form (Task 14 hardening).
  if (/(?:^|\/|%2f|\?)(?:\.|%2e){2}(?:\/|%2f|\?|#|$)/i.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.host !== FONT_STATIC_HOST && parsed.host !== platformStorageHost()) return false
  if (!parsed.pathname.toLowerCase().endsWith('.woff2')) return false
  return true
}
