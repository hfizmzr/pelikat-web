/**
 * Event Themes TS contract — spec §4.2 (token JSONB) + §5.1 (ResolvedTheme).
 *
 * ResolvedTheme is computed at request time by resolve.ts, never persisted.
 */

/**
 §4.2 vocabulary — the six fixed keys (Global Constraints). labels.ts (Task 8)
 owns the runtime LABEL_KEYS list / sanitization; this is the type-level shape.
 */
export type LabelKey =
  | 'bib_label'
  | 'checkpoint_label'
  | 'medal_label'
  | 'run_label'
  | 'participant_label'
  | 'certificate_label'

/**
 * §4.2 token contract (JSONB, `meta.version: 1`).
 *
 * The DB validator (`validate_theme_tokens(tokens, true)`, Task 1) enforces
 * the strict write-time shape: required `primary`/`secondary`/`accent` HEX,
 * https-only URLs, 64-char labels, unknown-key rejection. Every field is
 * optional here because `mergeThemeConfig` must be able to express partial
 * overrides and null-dropped keys faithfully (null → key removed → platform
 * default downstream, spec §4.3).
 */
export type ThemeTokens = {
  colors?: {
    primary?: string
    secondary?: string
    accent?: string
    background?: string
    foreground?: string
    ring?: string
  }
  typography?: {
    heading_font_url?: string
    body_font_url?: string
  }
  assets?: {
    banner_url?: string
    logo_url?: string
    badge_icon_url?: string
    certificate_background_url?: string
  }
  vocabulary?: Partial<Record<LabelKey, string>>
  meta?: { version?: number }
}

/**
 * One themed role in both color modes (spec §5.1). All values are opaque
 * `oklch()` strings: `light` is converted from the validated HEX, `dark` comes
 * from `deriveDarkVariant` (no inverse OKLCH→HEX exists), `fgLight` from
 * `pickForeground` on the HEX, `fgDark` assigned directly — see resolve.ts.
 */
export type BrandSlot = {
  light: string
  dark: string
  fgLight: string
  fgDark: string
}

/**
 * §5.1 — resolved theme consumed by buildStyleVars (Task 10) and
 * EventThemeScope (Task 11). Computed, never persisted.
 */
export type ResolvedTheme = {
  primary: BrandSlot
  secondary: BrandSlot
  accent: BrandSlot
  ring: BrandSlot
  /** Optional override slots; null → platform token for that mode. */
  background: { light: string | null; dark: string | null }
  foreground: { light: string | null; dark: string | null }
  /** Font URLs (https) or null → platform font. */
  fonts: { heading: string | null; body: string | null }
  /** Asset URLs carried post-merge (§4.2 assets slot); null → no themed asset
   * (the reserved-box ThemedImage renders only when a value exists). P2
   * consumers: runner banner/logo scope (Task 10); badge/certificate slots
   * intentionally not resolved until they gain a renderer. */
  assets: { banner: string | null; logo: string | null }
  /** Fully resolved — platform defaults filled. */
  labels: Record<LabelKey, string>
  /** Structured degradation log — resolve never throws (spec §5.5). */
  warnings: string[]
  source: { presetId: string | null; overriddenKeys: string[] }
}
