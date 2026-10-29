/**
 * Theme asset upload/cleanup engine (P2 Task 7, spec §6) — direct Storage
 * uploads (merch-product precedent) against the dedicated public
 * `event-themes` bucket, plus post-save orphan cleanup.
 *
 * Hard rules (§6 + plan Task 7):
 *  - the CLIENT gate runs FIRST (per-type size + image mime allowlist /
 *    font ext) — an oversized or wrong-type file must result in ZERO network
 *    calls (the 10 MB bucket cap alone would pass a 9 MB banner);
 *  - storage path convention (mandatory, tenant path equality +
 *    `can_manage_theme_path`): `organizers/{organizerId}/events/{eventId}/{kind}-v{ts}.{ext}`;
 *    the `-v{ts}` filename makes every re-upload a NEW path ⇒ the SW's
 *    cache-first rule can never serve a stale overwrite;
 *  - upload 409/conflict → remove() the same path once → re-upload once;
 *    never silently swallowed (warn log);
 *  - cleanup runs ONLY after a successful save, keeps the object referenced
 *    by the freshly-read DB config (URL basename match), deletes other
 *    `{kind}-v*` objects for kinds PRESENT in the saved config, and NEVER
 *    touches kinds that are absent (no false orphans);
 *  - all rejections/cleanup failures are STRUCTURED — warnings, never throws
 *    for cleanup; uploads reject with a readable message for the editor.
 */
import { isPlainObject } from './utils'

/** Storage bucket (locked, spec §6). */
export const THEME_ASSET_BUCKET = 'event-themes'

/** Image asset kinds — the stored `assets` keys carry a `_url` suffix. */
export const IMAGE_ASSET_KINDS = ['banner', 'logo', 'badge_icon', 'certificate_background'] as const
export type AssetKind = (typeof IMAGE_ASSET_KINDS)[number]

export const IMAGE_ASSET_KEYS = [
  'banner_url',
  'logo_url',
  'badge_icon_url',
  'certificate_background_url',
] as const
export type ImageAssetKey = (typeof IMAGE_ASSET_KEYS)[number]

/** Font upload kinds — stored in `typography.heading_font_url`/`body_font_url`. */
export const FONT_KINDS = ['heading_font', 'body_font'] as const
export type FontKind = (typeof FONT_KINDS)[number]
export type FontSlotKey = 'heading_font_url' | 'body_font_url'

export type ThemeAssetKind = AssetKind | FontKind

/** §6 per-type limits (Revision 3) — the client gate is the ONLY stopper. */
export const ASSET_LIMITS: Record<AssetKind, { maxBytes: number; types: string[] }> = {
  banner: { maxBytes: 2_097_152, types: ['image/png', 'image/jpeg', 'image/webp'] },
  logo: { maxBytes: 524_288, types: ['image/png', 'image/jpeg', 'image/webp'] },
  badge_icon: { maxBytes: 262_144, types: ['image/png', 'image/jpeg', 'image/webp'] },
  certificate_background: { maxBytes: 8_388_608, types: ['image/png', 'image/jpeg', 'image/webp'] },
}

/** Font upload limit (plan Global Constraints; .woff2 only — the saved URL is
 * re-gated by `themeFontUrlOk` at save AND resolve). */
export const FONT_LIMIT = 3_145_728

/**
 * Curated font families → the EXACT gstatic .woff2 literals seeded by
 * `081_seed_preset_typography.sql` (latin subset, weight 400). DUPLICATED
 * from that migration on purpose — importing SQL is not possible — so drift
 * between the two lists is a real risk: if 081 changes, this map MUST be
 * updated with it (regenerate via the CSS2 API + Chrome UA, see 081).
 */
export const FAMILY_FONT_URLS: Record<string, string> = {
  Prata: 'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2',
  Inter: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2',
  Cinzel: 'https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnfY3lDQ.woff2',
  'Source Sans 3': 'https://fonts.gstatic.com/s/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EK9Cs.woff2',
  'Bebas Neue': 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2',
  Orbitron: 'https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6BoWgz.woff2',
  Poppins: 'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2',
  Roboto: 'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2',
  Barlow: 'https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2',
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Minimal structural surface of the Supabase client this module needs —
 * keeps storage operations mockable/testable without the full supabase-js
 * type graph. A real `SupabaseClient` satisfies it.
 */
export type ThemeAssetClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: Blob,
        opts: { upsert: boolean; contentType: string },
      ): Promise<{ error: unknown }>
      remove(paths: string[]): Promise<{ error: unknown }>
      getPublicUrl(path: string): { data: { publicUrl: string } }
      list(folder: string): Promise<{ data: Array<{ name: string }> | null; error: unknown }>
    }
  }
}

export function kindFromAssetKey(key: string): ThemeAssetKind | null {
  if (!key.endsWith('_url')) return null
  const kind = key.slice(0, -4)
  if ((IMAGE_ASSET_KINDS as readonly string[]).includes(kind) || (FONT_KINDS as readonly string[]).includes(kind)) {
    return kind as ThemeAssetKind
  }
  return null
}

/**
 * Deterministic versioned path — plan Task 7: `{kind}-v{ts}.{ext}` with
 * `ts` defaulting to Date.now() and the extra dot staying ONE path segment
 * (passes the 4-segment tenancy equality).
 */
export function assetPath(
  organizerId: string,
  eventId: string,
  kind: ThemeAssetKind,
  ext: string,
  ts: number = Date.now(),
): string {
  if (!/^[A-Za-z0-9_-]+$/.test(organizerId) || !/^[A-Za-z0-9-]{1,64}$/.test(eventId)) {
    throw new Error('assetPath: invalid organizer or event id')
  }
  const clean = ext.replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  if (!clean) throw new Error('assetPath: empty file extension')
  return `organizers/${organizerId}/events/${eventId}/${kind}-v${ts}.${clean}`
}

/** Last path segment of a stored value (public URL or relative bucket path). */
function basenameOf(value: string): string | null {
  try {
    return decodeURIComponent(new URL(value).pathname.split('/').pop() ?? '') || null
  } catch {
    const last = value.split('/').pop() ?? ''
    return last || null
  }
}

/**
 * Structured upload with the client gate FIRST, then a direct Storage upload
 * (upsert), then a single remove+retry on conflict. Returns the canonical
 * public URL consumed as the draft/DB value.
 */
export async function uploadThemeAsset(
  client: ThemeAssetClient,
  input: { organizerId: string; eventId: string; kind: ThemeAssetKind; file: Blob; ts?: number },
): Promise<{ path: string; publicUrl: string }> {
  const { organizerId, eventId, kind, file, ts } = input

  // ── client gate — BEFORE any network byte ─────────────────────────────
  if (!organizerId || !eventId) {
    throw new Error('uploadThemeAsset: missing organizer or event id')
  }
  let ext: string
  if ((IMAGE_ASSET_KINDS as readonly string[]).includes(kind)) {
    const limits = ASSET_LIMITS[kind as AssetKind]
    if (file.size > limits.maxBytes) {
      throw new Error(
        `${kind}: ${(file.size / 1_048_576).toFixed(1)} MB exceeds the ${(limits.maxBytes / 1_048_576).toFixed(1)} MB limit`,
      )
    }
    if (!limits.types.includes(file.type)) {
      throw new Error(`${kind}: only PNG, JPEG or WebP images are allowed (got ${file.type || 'unknown type'})`)
    }
    ext = MIME_EXT[file.type] ?? ''
  } else if ((FONT_KINDS as readonly string[]).includes(kind)) {
    const name = (file as File).name ?? ''
    if (!/\.woff2$/i.test(name)) {
      throw new Error(`${kind}: only .woff2 font files are allowed (got ${name || 'unnamed file'})`)
    }
    if (file.size > FONT_LIMIT) {
      throw new Error(`${kind}: ${(file.size / 1_048_576).toFixed(1)} MB exceeds the font limit`)
    }
    ext = 'woff2'
  } else {
    throw new Error(`uploadThemeAsset: unknown asset kind "${String(kind)}"`)
  }

  const bucket = client.storage.from(THEME_ASSET_BUCKET)
  const path = assetPath(organizerId, eventId, kind, ext, ts)
  const contentType = (IMAGE_ASSET_KINDS as readonly string[]).includes(kind) ? file.type : 'font/woff2'

  let { error } = await bucket.upload(path, file, { upsert: true, contentType })
  if (error && conflict(error)) {
    // Upkeep of the 409/conflict contract (plan Task 7): remove the same
    // path once, re-upload once — never silently swallowed on failure.
    console.warn(`[theme-assets] 409/conflict on upload ${path} — remove + retry once`)
    await bucket.remove([path])
    const retry = await bucket.upload(path, file, { upsert: true, contentType })
    error = retry.error
  }
  if (error) {
    throw new Error(`${kind}: upload failed — ${describeError(error)}`)
  }

  return { path, publicUrl: bucket.getPublicUrl(path).data.publicUrl }
}

function describeError(error: unknown): string {
  if (isPlainObject(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }
  return 'unknown storage error'
}

function conflict(error: unknown): boolean {
  if (!isPlainObject(error)) return false
  const status = typeof error.statusCode === 'number' || typeof error.statusCode === 'string' ? String(error.statusCode) : ''
  return status === '409' || (typeof error.message === 'string' && /409|conflict/i.test(error.message))
}

export type CleanupResult = { removed: string[]; warnings: string[] }

/**
 * Post-save orphan cleanup. `savedAssets` maps `*_url` keys (assets +
 * typography font slots) to the references of the FRESHLY-READ DB config —
 * the DB is the canonical reference set, never the client draft.
 *
 * Keeps the object whose basename matches the reference; deletes every other
 * `{kind}-v*` object for kinds present; objects of kinds ABSENT from the
 * saved config (and names matching no kind) are NEVER touched.
 */
export async function cleanupThemeAssets(
  client: ThemeAssetClient,
  input: { organizerId: string; eventId: string; savedAssets: Record<string, unknown> },
): Promise<CleanupResult> {
  const { organizerId, eventId, savedAssets } = input
  const removed: string[] = []
  const warnings: string[] = []

  // Reference set: kind → referenced basename (only known kinds, strings).
  const references = new Map<ThemeAssetKind, string>()
  for (const [key, value] of Object.entries(savedAssets)) {
    if (typeof value !== 'string' || value.length === 0) continue
    const kind = kindFromAssetKey(key)
    if (kind === null) continue
    const base = basenameOf(value)
    if (base === null) {
      warnings.push(`theme assets: could not read the referenced filename for ${key} — cleanup skipped for ${kind}`)
      continue
    }
    references.set(kind, base)
  }
  if (references.size === 0) return { removed, warnings }

  const { data, error } = await client.storage.from(THEME_ASSET_BUCKET).list(
    `organizers/${organizerId}/events/${eventId}`,
  )
  if (error) {
    warnings.push(`theme assets: could not list existing assets — cleanup skipped (${describeError(error)})`)
    return { removed, warnings }
  }
  if (!Array.isArray(data)) return { removed, warnings }

  for (const name of data.map((o) => o.name)) {
    if (typeof name !== 'string') continue
    for (const [kind, keptName] of references) {
      if (!name.startsWith(`${kind}-v`)) continue
      if (name === keptName) continue // the object the saved config references — KEEP
      const { error: removeError } = await client.storage.from(THEME_ASSET_BUCKET).remove([name])
      if (removeError) {
        warnings.push(`theme assets: could not delete stale "${name}" (${describeError(removeError)})`)
      } else {
        removed.push(name)
      }
      break // one kind owns each `-v` name (kinds are prefix-disjoint)
    }
  }
  return { removed, warnings }
}
