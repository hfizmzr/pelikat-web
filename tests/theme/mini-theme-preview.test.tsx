import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prerender } from 'react-dom/static'
import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
import { deriveTheme } from '@/lib/theme/resolve'
import type { ThemeTokens } from '@/lib/theme/types'

// storageAssetUrl reads NEXT_PUBLIC_SUPABASE_URL per call — same env stub as
// tests/theme/utils.test.ts + theme-editor.test.tsx (per-file isolation).
const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
})
afterAll(() => {
  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
})

const PRESET_ID = '11111111-1111-1111-1111-111111111111'

async function toHtml(node: React.ReactElement): Promise<string> {
  const { prelude } = await prerender(node)
  let html = ''
  const reader = prelude.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
  }
  return html + decoder.decode()
}

/** Synthetic ResolvedTheme (P3 Task 1): a full 6-key vocabulary override. */
const ALL_SIX: ThemeTokens = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  vocabulary: {
    bib_label: 'Nombor',
    checkpoint_label: 'Kampung',
    medal_label: 'Pingat',
    run_label: 'Larian',
    participant_label: 'Peserta',
    certificate_label: 'Sijil',
  },
  meta: { version: 1 },
}

describe('MiniThemePreview vocabulary line (P3 Task 1: all six labels)', () => {
  it('renders all six resolved labels (bib keeps its #1234 mock slot)', async () => {
    const resolved = deriveTheme(ALL_SIX, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain('Nombor')
    expect(html).toContain('#1234')
    expect(html).toContain('Kampung')
    expect(html).toContain('Pingat')
    expect(html).toContain('Larian')
    expect(html).toContain('Peserta')
    expect(html).toContain('Sijil')
  })

  it('partial override → missing keys fall back to the platform labels', async () => {
    const PARTIAL: ThemeTokens = { ...ALL_SIX, vocabulary: { medal_label: 'Pingat' } }
    const resolved = deriveTheme(PARTIAL, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain('Pingat')
    expect(html).toContain('Bib Number')
    expect(html).toContain('Checkpoint')
    expect(html).toContain('Run')
    expect(html).toContain('Participant')
    expect(html).toContain('Certificate')
  })

  it('hostile labels (angle-bracket markup) render sanitized — resolve.ts ran sanitizeLabel', async () => {
    const HOSTILE: ThemeTokens = {
      ...ALL_SIX,
      vocabulary: {
        bib_label: '<b>Bib</b>',
        medal_label: '<scr<script>ipt> Pingat',
        checkpoint_label: 'Kampung <',
      },
    }
    const resolved = deriveTheme(HOSTILE, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    // sanitizeLabel already stripped markup at resolve time …
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<scr<script>ipt>')
    expect(html).not.toContain('<b')
    // … and the cleaned text still appears.
    expect(html).toContain('Kampung')
    expect(html).toContain('Pingat')
  })
})

describe('MiniThemePreview certificate mock (P4 Task 5: A4 landscape)', () => {
  const CERT_BG_PATH = 'organizers/o1/events/e1/certificate_background-v1.png'
  const CERT_BG_URL = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/${CERT_BG_PATH}`
  const CERT_TOKENS: ThemeTokens = { ...ALL_SIX, assets: { certificate_background_url: CERT_BG_PATH } }

  it('no themed bg → A4 landscape reserved box: aspect attr 1.414/1, gradient fallback, no img', async () => {
    const resolved = deriveTheme(ALL_SIX, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    // the shipping artifact ratio (3508x2480 ≈ 1.414) — plan "16:9" superseded
    expect(html).toContain('style="aspect-ratio:1.414/1"')
    // nothing anywhere resolves into an img — banner/logo/cert all unset
    expect(html).not.toContain('<img')
    expect(html).toContain('bg-gradient-to-br')
    // the reserved box carries the cert metadata too (overlaid labels)
    expect(html).toContain('Sijil')
    expect(html).toContain('Peserta')
    expect(html).toContain('Nombor')
  })

  it('bucket-path bg → src present AND expanded to the storage public URL', async () => {
    const resolved = deriveTheme(CERT_TOKENS, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain(`<img src="${CERT_BG_URL}"`)
    expect(html).toContain('alt="Certificate background"')
  })

  it('https bg passthrough renders verbatim (no re-expansion)', async () => {
    const resolved = deriveTheme(
      { ...ALL_SIX, assets: { certificate_background_url: CERT_BG_URL } },
      null,
      PRESET_ID,
    )
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain(`<img src="${CERT_BG_URL}"`)
  })

  it('platform fallback labels render in the cert card when nothing is overridden', async () => {
    const resolved = deriveTheme({}, null, null)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain('Certificate')
    expect(html).toContain('Participant')
    expect(html).toContain('Bib Number')
  })

  it('hostile cert-card labels (angle brackets) stay sanitized — text children only', async () => {
    const HOSTILE: ThemeTokens = {
      ...ALL_SIX,
      vocabulary: {
        certificate_label: '<b>Sijil</b>',
        participant_label: '<i>Peserta</i>',
        bib_label: '<b>Bib</b>',
      },
    }
    const resolved = deriveTheme(HOSTILE, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).not.toContain('<b')
    expect(html).not.toContain('<i')
    // the cleaned plain text still renders
    expect(html).toContain('Sijil')
    expect(html).toContain('Peserta')
    expect(html).toContain('Bib')
  })
})
