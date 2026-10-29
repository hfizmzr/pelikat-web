import { describe, it, expect } from 'vitest'
import { validateThemeConfig } from '@/lib/theme/validate'
import { PLATFORM_BG_HEX, contrastRatio } from '@/lib/theme/color'
import type { ThemeTokens } from '@/lib/theme/types'

// Full valid config — Batik Heritage palette (§4.6 family), every section
// populated, all colors clear the §5.5 gate vs the platform background.
const FULL: ThemeTokens = {
  colors: {
    primary: '#9C4A1A', // 5.90:1 vs #fafafa
    secondary: '#3E2C23', // 12.66:1
    accent: '#8C6D1F', // 4.65:1
    ring: '#9C4A1A',
    background: '#FBF6EC', // tint L 0.974 ∈ [0.93, 0.995]
    foreground: '#2B2118',
  },
  typography: {
    heading_font_url: 'https://fonts.gstatic.com/s/heading.woff2',
    body_font_url: 'https://fonts.gstatic.com/s/body.woff2',
  },
  assets: {
    banner_url:
      'organizers/00000000-0000-0000-0000-000000000000/events/11111111-1111-1111-1111-111111111111/banner.png',
    logo_url: 'https://cdn.example.com/logo.png',
  },
  vocabulary: {
    bib_label: 'Nombor',
    checkpoint_label: 'Checkpoint',
    medal_label: 'Pingat',
    run_label: 'Larian',
    participant_label: 'Peserta',
    certificate_label: 'Sijil',
  },
  meta: { version: 1 },
}

function errorFor(config: unknown, fragment: string): string | undefined {
  return validateThemeConfig(config).errors.find((e) => e.includes(fragment))
}

describe('DB validator mirror (076 non-strict mode — events.theme_config CHECK)', () => {
  it('accepts minimal {} and column-NULL inputs (null/undefined)', () => {
    for (const empty of [{}, null, undefined]) {
      expect(validateThemeConfig(empty)).toEqual({ ok: true, errors: [], warnings: [] })
    }
  })

  it('accepts the full valid token set with zero errors and zero warnings', () => {
    expect(validateThemeConfig(FULL)).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('accepts partial configs (any subset of sections and leaves)', () => {
    expect(validateThemeConfig({ colors: { primary: '#9C4A1A' } }).ok).toBe(true)
    expect(
      validateThemeConfig({ typography: { heading_font_url: 'https://fonts.gstatic.com/a.woff2' } }).ok,
    ).toBe(true)
    expect(validateThemeConfig({ vocabulary: { bib_label: 'Nombor' } }).ok).toBe(true)
    expect(validateThemeConfig({ assets: { logo_url: 'organizers/x/logo.png' } }).ok).toBe(true)
  })

  it('rejects non-object configs (number, string, boolean, array)', () => {
    for (const bad of [42, 'x', true, []]) {
      const res = validateThemeConfig(bad)
      expect(res.ok).toBe(false)
      expect(res.errors.some((e) => e.includes('must be a JSON object'))).toBe(true)
    }
  })

  it('rejects unknown keys at the top level and in every section', () => {
    expect(errorFor({ evil: 1 }, 'theme_config.evil')).toBeDefined()
    expect(errorFor({ colors: { evil: '#000000' } }, 'colors.evil')).toBeDefined()
    expect(errorFor({ typography: { evil: 'https://x' } }, 'typography.evil')).toBeDefined()
    expect(errorFor({ assets: { evil: 'a.png' } }, 'assets.evil')).toBeDefined()
    expect(errorFor({ vocabulary: { evil: 'x' } }, 'vocabulary.evil')).toBeDefined()
    expect(errorFor({ meta: { version: 1, evil: 2 } }, 'meta.evil')).toBeDefined()
  })

  it('rejects malformed HEX per ^#[0-9a-fA-F]{6}$ (stored-token contract)', () => {
    for (const hex of ['not-a-hex', '#12345', '123456', '#GGGGGG', '#9C4A1A7']) {
      expect(errorFor({ colors: { primary: hex } }, 'colors.primary')).toBeDefined()
    }
    // non-string leaves (numbers, booleans, objects) fail the same check
    expect(errorFor({ colors: { primary: 5 } }, 'colors.primary')).toBeDefined()
    expect(errorFor({ colors: { primary: { deep: true } } }, 'colors.primary')).toBeDefined()
  })

  it('rejects explicit JSON nulls at every nesting level (076 mirror)', () => {
    // Verified against the live 076 validate_theme_tokens: jsonb 'null' is
    // neither 'object' (sections) nor 'string' (leaves) — ALL rejected.
    for (const section of ['colors', 'typography', 'assets', 'vocabulary', 'meta']) {
      expect(errorFor({ [section]: null }, section)).toBeDefined()
    }
    expect(errorFor({ colors: { primary: null } }, 'colors.primary')).toBeDefined()
    expect(errorFor({ typography: { heading_font_url: null } }, 'typography.heading_font_url')).toBeDefined()
    expect(errorFor({ vocabulary: { bib_label: null } }, 'vocabulary.bib_label')).toBeDefined()
    expect(errorFor({ meta: { version: null } }, 'meta.version')).toBeDefined()
  })

  it('rejects non-https font URLs (http:, javascript:) — https floor per §4.3', () => {
    expect(errorFor({ typography: { heading_font_url: 'http://evil.com/x.woff2' } }, 'typography')).toBeDefined()
    expect(errorFor({ typography: { body_font_url: 'javascript:alert(1)' } }, 'typography')).toBeDefined()
  })

  it('rejects unsafe asset values: .. traversal, off-charset, javascript:, empty', () => {
    expect(errorFor({ assets: { banner_url: '../evil.png' } }, 'assets.banner_url')).toBeDefined()
    expect(errorFor({ assets: { banner_url: 'has space.png' } }, 'assets.banner_url')).toBeDefined()
    expect(errorFor({ assets: { banner_url: 'a;b.png' } }, 'assets.banner_url')).toBeDefined()
    // ':' is off-charset, so URI schemes fail the path branch (076 semantics)
    expect(errorFor({ assets: { banner_url: 'javascript:alert(1)' } }, 'assets.banner_url')).toBeDefined()
    expect(errorFor({ assets: { banner_url: '' } }, 'assets.banner_url')).toBeDefined()
  })

  it('rejects vocabulary labels over the 64-char DB cap (UI enforces 40)', () => {
    expect(validateThemeConfig({ vocabulary: { bib_label: 'a'.repeat(64) } }).ok).toBe(true)
    expect(errorFor({ vocabulary: { bib_label: 'a'.repeat(65) } }, 'vocabulary.bib_label')).toBeDefined()
  })

  it('rejects wrong meta: version ≠ 1, string "1", missing version, non-object meta', () => {
    expect(errorFor({ meta: { version: 2 } }, 'meta.version')).toBeDefined()
    expect(errorFor({ meta: { version: '1' } }, 'meta.version')).toBeDefined()
    expect(errorFor({ meta: {} }, 'meta.version')).toBeDefined()
    expect(errorFor({ meta: 'nope' }, 'meta')).toBeDefined()
    expect(errorFor({ meta: [] }, 'meta')).toBeDefined()
  })

  it('rejects payloads over the 64 KB JSON cap', () => {
    // Padded via a typography URL (no per-value length cap); otherwise valid.
    const big = {
      typography: { heading_font_url: `https://fonts.gstatic.com/${'a'.repeat(70000)}.woff2` },
    }
    expect(errorFor(big, '64 KB')).toBeDefined()
  })

  it('never throws — unserializable input returns a structured error', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const res = validateThemeConfig(circular)
    expect(res.ok).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
  })
})

describe('WCAG contrast gate (§5.5 — vs PLATFORM_BG_HEX, shared with resolve)', () => {
  it('hard-blocks primary <3:1 — the ONLY hard block (§13 ④)', () => {
    const res = validateThemeConfig({ colors: { primary: '#949494' } }) // 2.91:1 vs #fafafa
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('colors.primary') && e.includes('contrast'))).toBe(true)
    expect(res.warnings.some((w) => w.includes('colors.primary'))).toBe(false)
  })

  it('pins the 3:1 boundary to the shared #fafafa background', () => {
    // #919191 = 3.02:1 vs #fafafa → passes. Under the old #f4f4f4 proxy it
    // measured 2.87:1 (blocked) — this pair pins the carried shared-constant
    // decision (save-gate ↔ render-degrade agreement).
    expect(validateThemeConfig({ colors: { primary: '#919191' } }).ok).toBe(true)
    expect(validateThemeConfig({ colors: { primary: '#929292' } }).ok).toBe(false) // 2.98:1
  })

  it('does NOT block #777777 — plan Task 9 example conflicts with WCAG math', () => {
    // Plan Task 9 lists "#777777 primary on white → blocked (<3:1)", but the
    // WCAG 2.1 ratio is 4.48:1 vs white / 4.29:1 vs #fafafa — ≥3:1. Spec §5.5
    // (locked gate) wins; Task 7's reviewed resolve test pins the same
    // #777777-passes behavior. Conflict recorded in the Task 9 report.
    expect(contrastRatio('#777777', PLATFORM_BG_HEX)).toBeGreaterThanOrEqual(3)
    expect(validateThemeConfig({ colors: { primary: '#777777' } }).ok).toBe(true)
  })

  it('accepts the Batik pairing: #9C4A1A primary on #FBF6EC (≈5.7:1 vs themed bg)', () => {
    // ≈5.72:1 against the Batik background; the gate itself measures vs the
    // platform background (#fafafa, 5.90:1) — OK either way, no errors.
    const res = validateThemeConfig({ colors: { primary: '#9C4A1A', background: '#FBF6EC' } })
    expect(res).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('warn-and-degrades secondary/accent <3:1 (ok:true, warnings only)', () => {
    const secondary = validateThemeConfig({ colors: { secondary: '#949494' } })
    expect(secondary.ok).toBe(true)
    expect(secondary.errors).toEqual([])
    expect(secondary.warnings.some((w) => w.includes('colors.secondary') && w.includes('contrast'))).toBe(true)

    // the real Batik accent — gold on light background
    const accent = validateThemeConfig({ colors: { accent: '#D4A017' } }) // 2.28:1
    expect(accent.ok).toBe(true)
    expect(accent.warnings.some((w) => w.includes('colors.accent') && w.includes('contrast'))).toBe(true)
  })

  it('warns (recommended) for ring <3:1, never blocks', () => {
    const res = validateThemeConfig({ colors: { ring: '#949494' } })
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.warnings.some((w) => w.includes('colors.ring') && w.includes('contrast'))).toBe(true)
  })

  it('emits no contrast noise when colors are absent', () => {
    expect(validateThemeConfig({ vocabulary: { bib_label: 'Nombor' } }).warnings).toEqual([])
  })
})

describe('background tint gate (§5.5.1 — oklch L windows)', () => {
  it('accepts light and dark tints without warning', () => {
    // light tint: Batik bg (L 0.974); the platform bg itself (L 0.985);
    // dark tint: L 0.115 ∈ [0.05, 0.12]
    for (const background of ['#FBF6EC', '#FAFAFA', '#050505']) {
      const res = validateThemeConfig({ colors: { background } })
      expect(res.warnings).toEqual([])
    }
  })

  it('warns + will-ignore outside the tint windows (mid-tone or pure black)', () => {
    const mid = validateThemeConfig({ colors: { background: '#FFD700' } }) // L 0.887
    expect(mid.ok).toBe(true)
    expect(mid.warnings.some((w) => w.includes('colors.background') && w.includes('tint'))).toBe(true)

    const black = validateThemeConfig({ colors: { background: '#000000' } }) // L 0 < 0.05
    expect(black.warnings.some((w) => w.includes('colors.background'))).toBe(true)
  })

  it('applies no tint window to colors.foreground (no gate in §5.5)', () => {
    const res = validateThemeConfig({ colors: { foreground: '#FFD700' } })
    expect(res.warnings).toEqual([])
  })
})
