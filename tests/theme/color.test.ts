import { describe, it, expect } from 'vitest'
import {
  hexToOklch,
  oklchToString,
  hexToRgb255,
  relativeLuminance,
  contrastRatio,
  pickForeground,
  deriveDarkVariant,
} from '@/lib/theme/color'

// Parity vectors vs standard OKLCH formulas (Björn Ottosson's OKLab, e.g. as
// implemented by culori / CSS Color 4). Tolerances: L/C to 2 decimals, h to 1.
describe('hexToOklch', () => {
  it('matches standard OKLCH for pure red', () => {
    const o = hexToOklch('#FF0000')
    expect(o.l).toBeCloseTo(0.628, 2)
    expect(o.c).toBeCloseTo(0.258, 2)
    expect(o.h).toBeCloseTo(29.2, 1)
  })

  it('matches standard OKLCH for Batik Heritage primary', () => {
    const o = hexToOklch('#9C4A1A')
    expect(o.l).toBeCloseTo(0.505, 2)
    expect(o.c).toBeCloseTo(0.124, 2)
    expect(o.h).toBeCloseTo(46.9, 0)
  })

  it('maps black and white to the achromatic axis', () => {
    expect(hexToOklch('#000000')).toEqual({ l: 0, c: 0, h: 0 })
    const w = hexToOklch('#FFFFFF')
    expect(w.l).toBeCloseTo(1, 3)
    expect(w.c).toBeLessThan(0.001)
  })

  it('is case-insensitive and accepts an optional # prefix', () => {
    const upper = hexToOklch('#FF0000')
    const lower = hexToOklch('#ff0000')
    const bare = hexToOklch('ff0000')
    expect(lower.l).toBe(upper.l)
    expect(bare.c).toBe(upper.c)
    expect(bare.h).toBe(upper.h)
  })

  it('returns the safe fallback for malformed hex', () => {
    expect(hexToOklch('not-a-hex')).toEqual({ l: 0, c: 0, h: 0 })
    expect(hexToOklch('#12345')).toEqual({ l: 0, c: 0, h: 0 })
    expect(hexToOklch('javascript:alert(1)')).toEqual({ l: 0, c: 0, h: 0 })
  })
})

describe('oklchToString', () => {
  it('formats as `oklch(L C H)` with rounding and trimmed zeros', () => {
    expect(oklchToString({ l: 0.628, c: 0.258, h: 29.2 })).toBe(
      'oklch(0.628 0.258 29.2)'
    )
    expect(oklchToString({ l: 0, c: 0, h: 0 })).toBe('oklch(0 0 0)')
  })
})

describe('hexToRgb255', () => {
  it('converts hex channels to 0-255', () => {
    expect(hexToRgb255('#FF0000')).toEqual([255, 0, 0])
    expect(hexToRgb255('#9C4A1A')).toEqual([156, 74, 26])
    expect(hexToRgb255('ffffff')).toEqual([255, 255, 255])
  })

  it('falls back to black on malformed input', () => {
    expect(hexToRgb255('#xyz123')).toEqual([0, 0, 0])
  })
})

describe('relativeLuminance (WCAG 2.1 sRGB)', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
  })

  it('weights sRGB channels per WCAG 2.1', () => {
    // #FFD700: R=1, G=215/255 → linear 0.6797, B=0.
    expect(relativeLuminance('#FFD700')).toBeCloseTo(0.6987, 3)
  })

  it('is 0 for malformed input', () => {
    expect(relativeLuminance('#12')).toBe(0)
  })
})

describe('contrastRatio (WCAG 2.1)', () => {
  it('gives exactly 21:1 for black vs white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
  })

  it('is order-independent and 1 against itself', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBe(
      contrastRatio('#000000', '#ffffff')
    )
    expect(contrastRatio('#9C4A1A', '#9C4A1A')).toBeCloseTo(1, 10)
  })

  it('degrades to 1 (no contrast) on malformed input', () => {
    expect(contrastRatio('#zzzzzz', '#ffffff')).toBe(1)
    expect(contrastRatio('#000000', '')).toBe(1)
  })
})

describe('pickForeground', () => {
  // oklch(0.145 0 0) is achromatic: LMS = L^3, so each linear sRGB channel is
  // 0.145^3 and the WCAG luminance is the same (channel weights sum to 1).
  const DARK_FG_WCAG_LUM = 0.145 ** 3

  it('picks the dark foreground for light fills (#FFD700), ≥4.5:1', () => {
    // White branch must fail first (≈1.4:1).
    expect(contrastRatio('#FFD700', '#ffffff')).toBeLessThan(4.5)
    expect(pickForeground('#FFD700')).toBe('oklch(0.145 0 0)')
    const gold = relativeLuminance('#FFD700')
    expect((gold + 0.05) / (DARK_FG_WCAG_LUM + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('picks white for dark fills (#9C4A1A), ≥4.5:1', () => {
    expect(contrastRatio('#9C4A1A', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(pickForeground('#9C4A1A')).toBe('#ffffff')
  })

  it('returns the dark foreground for malformed fills', () => {
    expect(pickForeground('')).toBe('oklch(0.145 0 0)')
  })
})

describe('deriveDarkVariant', () => {
  function parseOklch(s: string): { l: number; c: number; h: number } {
    const m = /^oklch\((\S+) (\S+) (\S+)\)$/.exec(s)
    if (!m) throw new Error(`not oklch string: ${s}`)
    return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) }
  }

  it('keeps hue, clamps L to [0.68, 0.82], caps chroma at 0.20', () => {
    const src = hexToOklch('#9C4A1A')
    const dark = parseOklch(deriveDarkVariant('#9C4A1A'))
    expect(dark.h).toBeCloseTo(src.h, 0)
    expect(dark.l).toBeGreaterThanOrEqual(0.68)
    expect(dark.l).toBeLessThanOrEqual(0.82)
    expect(dark.c).toBeLessThanOrEqual(0.2)
    // Sub-cap chroma is reduced (×0.85), never amplified.
    expect(dark.c).toBeLessThan(src.c)
  })

  it('clamps already-light colors down to L 0.82', () => {
    // Light source: L above the clamp ceiling → exactly 0.82, hue preserved.
    const src = hexToOklch('#FFD700')
    const dark = parseOklch(deriveDarkVariant('#FFD700'))
    expect(dark.l).toBe(0.82)
    expect(dark.h).toBeCloseTo(src.h, 0)
  })

  it('returns a neutral dark fallback (no throw) for malformed hex', () => {
    expect(deriveDarkVariant('not-a-hex')).toBe('oklch(0.68 0 0)')
  })
})

describe('malformed input never throws (spec §5.5.4)', () => {
  const garbage: unknown[] = [undefined, null, 42, {}, '#', '#12G45Z']

  it('every function degrades to its safe fallback', () => {
    for (const g of garbage) {
      expect(() => hexToOklch(g as string)).not.toThrow()
      expect(hexToOklch(g as string)).toEqual({ l: 0, c: 0, h: 0 })
      expect(hexToRgb255(g as string)).toEqual([0, 0, 0])
      expect(relativeLuminance(g as string)).toBe(0)
      expect(contrastRatio(g as string, g as string)).toBe(1)
      expect(pickForeground(g as string)).toBe('oklch(0.145 0 0)')
      expect(deriveDarkVariant(g as string)).toBe('oklch(0.68 0 0)')
    }
  })
})
