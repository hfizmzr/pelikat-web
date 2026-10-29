import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSurfaceTheme } from '@/lib/theme/surface'
import { LABEL_KEYS } from '@/lib/theme/labels'
import type { ThemeTokens } from '@/lib/theme/types'
import { oklchToString, hexToOklch } from '@/lib/theme/color'

// Platform tokens mirror src/app/globals.css (:root / .dark) — same literals
// as resolve.test.ts; a drift there fails that test too.
const PLATFORM = {
  primaryLight: 'oklch(0.51 0.16 190)',
  primaryDark: 'oklch(0.75 0.13 190)',
}

const BATIK: ThemeTokens = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  vocabulary: { bib_label: 'Nombor', medal_label: 'Pingat' },
  meta: { version: 1 },
}

const PRESET_ID = '11111111-1111-1111-1111-111111111111'
const EVENT_ID = '00000000-0000-4000-8000-00000000000e'

type PresetRow = { id: string; tokens: unknown } | null

/** Minimal chainable mock of the only supabase queries getSurfaceTheme can
 * make (delegating to getResolvedTheme): the theme_presets select + the
 * get_event_theme RPC fallback. `queryCalls` is the spy for the zero-query
 * fast-path assertion. */
function fakeSupabase(
  row: PresetRow,
  error: unknown = null,
  rpc: { data: unknown; error: unknown } | null = null,
): SupabaseClient & { queryCalls: number } {
  let queryCalls = 0
  const client = {
    from: () => {
      queryCalls += 1
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }
    },
    rpc: () => {
      queryCalls += 1
      return Promise.resolve(rpc ?? { data: null, error: null })
    },
  }
  return Object.assign(client as unknown as SupabaseClient, {
    get queryCalls() {
      return queryCalls
    },
  })
}

function surfaceEvent(theme_preset_id: string | null, theme_config: unknown) {
  return { id: EVENT_ID, theme_preset_id, theme_config }
}

describe('getSurfaceTheme', () => {
  it('null presets AND null config → BOTH nulls, zero DB queries (spy)', async () => {
    const client = fakeSupabase(null)
    const result = await getSurfaceTheme(surfaceEvent(null, null), client)
    expect(result.resolved).toBeNull()
    expect(result.labels).toBeNull()
    expect(client.queryCalls).toBe(0)
  })

  it('hostile non-object config (no preset id) → nulls platform-defaults fast path, zero queries, never throws', async () => {
    const client = fakeSupabase(null)
    for (const cfg of [42, 'x', [], new Map()]) {
      const result = await getSurfaceTheme(surfaceEvent(null, cfg), client)
      expect(result.resolved).toBeNull()
      expect(result.labels).toBeNull()
    }
    expect(client.queryCalls).toBe(0)
  })

  it('preset row → resolved + full 6-label map (override wins, fallbacks fill)', async () => {
    const client = fakeSupabase({ id: PRESET_ID, tokens: BATIK })
    const result = await getSurfaceTheme(
      surfaceEvent(PRESET_ID, { vocabulary: { bib_label: 'Nombor Larian' } }),
      client,
    )
    expect(result.resolved).not.toBeNull()
    expect(result.labels).toEqual(result.resolved?.labels)
    // all six keys present, plain strings
    expect(Object.keys(result.labels!).sort()).toEqual([...LABEL_KEYS].sort())
    expect(result.labels?.bib_label).toBe('Nombor Larian')
    expect(result.labels?.medal_label).toBe('Pingat')
    // platform fallbacks for keys the preset does not set
    expect(result.labels?.checkpoint_label).toBe('Checkpoint')
    expect(result.labels?.run_label).toBe('Run')
    expect(result.labels?.participant_label).toBe('Participant')
    expect(result.labels?.certificate_label).toBe('Certificate')
    // themed color flowed through (fgDark = DARK_FG constant, not derived)
    expect(result.resolved?.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
    expect(result.resolved?.primary.fgDark).toBe('oklch(0.145 0 0)')
  })

  it('degraded config (with preset) → resolved-with-platform tokens + labels fallback map, never throws', async () => {
    const client = fakeSupabase({ id: PRESET_ID, tokens: BATIK })
    const result = await getSurfaceTheme(
      surfaceEvent(PRESET_ID, { colors: { primary: 'not-a-hex' }, vocabulary: { bib_label: 42 } }),
      client,
    )
    // degraded color host-side → platform tokens, still a full resolution
    expect(result.resolved?.primary.light).toBe(PLATFORM.primaryLight)
    expect(result.resolved?.primary.dark).toBe(PLATFORM.primaryDark)
    expect(result.resolved?.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
    // labels degrade to the fallback map — never nulls while resolution succeeds
    expect(Object.keys(result.labels!).sort()).toEqual([...LABEL_KEYS].sort())
    expect(result.labels?.bib_label).toBe('Bib Number')
    expect(result.labels?.medal_label).toBe('Pingat') // preset vocab survives
  })

  it('client failure (preset query throws) → resolved degrades inside getResolvedTheme; labels never null', async () => {
    const client = fakeSupabase(null, new Error('boom'))
    const result = await getSurfaceTheme(surfaceEvent(PRESET_ID, null), client)
    expect(result.resolved?.primary.light).toBe(PLATFORM.primaryLight)
    expect(result.labels?.bib_label).toBe('Bib Number')
    expect(result.resolved?.warnings.length).toBeGreaterThan(0)
  })

  it('full-surface fuzz: hostile event inputs never throw', async () => {
    const garbage: { id: string; theme_preset_id: string | null; theme_config: unknown }[] = [
      surfaceEvent(PRESET_ID, null),
      surfaceEvent(PRESET_ID, [null]),
      surfaceEvent(PRESET_ID, { colors: 5 }),
      surfaceEvent(PRESET_ID, { vocabulary: { bib_label: 42 } }),
      surfaceEvent(PRESET_ID, { colors: { primary: { deep: true } } }),
    ]
    for (const ev of garbage) {
      await expect(getSurfaceTheme(ev, fakeSupabase(null))).resolves.toMatchObject({
        resolved: expect.anything(),
        labels: expect.anything(),
      })
    }
  })
})
