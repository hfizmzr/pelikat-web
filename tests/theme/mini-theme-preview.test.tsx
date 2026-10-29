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
