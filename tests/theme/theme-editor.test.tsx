import { describe, it, expect, vi } from 'vitest'
import { prerender } from 'react-dom/static'
import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
import { ThemeEditor } from '@/components/theme/theme-editor'
import { deriveTheme } from '@/lib/theme/resolve'
import type { ThemeTokens } from '@/lib/theme/types'

/**
 * Task 13 render smoke (prerender convention from event-theme-scope.test.tsx):
 * the gallery cards + live preview render through the SAME `.event-theme`
 * engine, and the editor mounts read-only vs editable without crashing.
 * The interactive click-through (save → runner page themed) stays a manual
 * smoke — see task-13 report.
 */

const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
const PRESET_ID = '11111111-1111-1111-1111-111111111111'

const BATIK: ThemeTokens = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  vocabulary: { medal_label: 'Pingat', checkpoint_label: 'Kampung' },
  meta: { version: 1 },
}

const PRESETS = [{ id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK }]

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

// saveEventTheme is a 'use server' action whose module graph pulls
// server-only modules — never executed in these render smokes.
vi.mock('@/components/events/actions', () => ({ saveEventTheme: vi.fn() }))
vi.mock('@/components/events/event-tabs', () => ({ useThemeDirtyReporter: () => null }))

describe('MiniThemePreview (SSR through the .event-theme engine)', () => {
  it('renders the themed scope with inline --et-* vars (two-arg buildStyleVars)', async () => {
    const resolved = deriveTheme(BATIK, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} eventId={EVENT_ID} />)
    expect(html).toContain('event-theme')
    expect(html).toContain('--et-primary:oklch(')
    // whitelist consumption via Tailwind classes, not ad-hoc token mapping
    expect(html).toContain('bg-primary')
  })

  it('shows resolved vocabulary (fallbacks filled) as text', async () => {
    const resolved = deriveTheme(BATIK, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain('Kampung')
    expect(html).toContain('Pingat')
    expect(html).toContain('Bib Number')
  })
})

describe('ThemeEditor (SSR mount smoke)', () => {
  it('editable mode: gallery + color rows + assets + vocab + save bar render', async () => {
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={PRESET_ID}
        savedConfig={null}
        presets={PRESETS}
      />,
    )
    expect(html).toContain('Batik Heritage')
    for (const role of ['Primary', 'Secondary', 'Accent', 'Ring']) {
      expect(html).toContain(role)
    }
    expect(html).toContain('Save theme')
    // Batik preset selected → its vocabulary seeds the live label preview
    expect(html).toContain('Your Kampung #1234')
    expect(html).toContain('Your Bib Number #1234')
    // P2 Task 7: 4 asset rows + 2 font rows in an Assets section
    expect(html).toContain('Assets')
    expect(html).toContain('Banner')
    expect(html).toContain('Badge icon')
    expect(html).toContain('Certificate background')
    expect(html).toContain('Heading font')
    expect(html).toContain('Body font')
    // per-kind limit hints (exact §6 values)
    expect(html).toContain('2.0 MB max')
    expect(html).toContain('512 KB max')
    expect(html).toContain('256 KB max')
    expect(html).toContain('8.0 MB max')
    // font rows draw from FAMILY_FONT_URLS (assets.test.ts pins all 9 URLs);
    // the Radix Select dropdown items are client-only, so the fixture asserts
    // the trigger's default state instead
    expect(html).toContain('Heading font')
    expect(html).toContain('Body font')
    expect(html).toContain('Google OFL families')
  })

  it('asset draft values render as ThemedImage thumbnails (reserved box, src present)', async () => {
    const banner = 'https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1720000000000.png'
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={null}
        savedConfig={{
          assets: { banner_url: banner },
          typography: { heading_font_url: 'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2' },
        }}
        presets={PRESETS}
      />,
    )
    expect(html).toContain(banner)
    expect(html).toContain('banner-v1720000000000.png')
    // the ThemedImage reserved box is part of the row structure
    expect(html).toContain('Banner')
  })

  it('read-only mode (non-owner): banner shown, no save button', async () => {
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit={false}
        savedPresetId={null}
        savedConfig={null}
        presets={PRESETS}
      />,
    )
    expect(html).toContain('read-only')
    expect(html).not.toContain('Save theme')
  })
})
