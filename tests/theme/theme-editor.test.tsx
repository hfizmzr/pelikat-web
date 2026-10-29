import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { prerender } from 'react-dom/static'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
import { ThemeEditor, fontDefaultLabel } from '@/components/theme/theme-editor'
import { deriveTheme } from '@/lib/theme/resolve'
import type { ThemeTokens } from '@/lib/theme/types'

// Task 11 rider: consumers (AssetRow thumbnails + MiniThemePreview) expand
// bucket-path values via storageAssetUrl, which reads NEXT_PUBLIC_SUPABASE_URL
// per call — same env stub as tests/theme/utils.test.ts (per-file isolation).
const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
})
afterAll(() => {
  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
})

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
// createClient is only consumed by the (mocked) uploader — keep a real
// browser supabase out of the test graph.
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => ({})) }))
// In-flight stub: tests control when (if ever) the upload settles.
const { uploadThemeAsset } = vi.hoisted(() => ({ uploadThemeAsset: vi.fn() }))
vi.mock('@/lib/theme/assets', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/theme/assets')>()
  return { ...mod, uploadThemeAsset }
})

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

  it('Task 10: no assets → ThemedImage reserved boxes render the gradient fallback engine', async () => {
    const resolved = deriveTheme(BATIK, null, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    // Reserved boxes exist for BOTH asset kinds (banner 3/1 over the mock
    // card, 1/1 logo overlay) …
    expect(html).toContain('aspect-ratio:3/1')
    expect(html).toContain('aspect-ratio:1/1')
    // … but NO im element: seed presets carry no assets, so the fallback
    // gradient layer renders (the same collapsed-src engine as a dead URL).
    expect(html).not.toContain('<img')
    expect(html).toContain('bg-gradient-to-br')
  })

  it('Task 10: override draft assets flow through derive → real ThemedImage img srcs', async () => {
    // Storage-origin https URLs (P3 Task 7 asset host pin) — real img srcs.
    const banner = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/banner-v1721000000000.png`
    const resolved = deriveTheme(
      BATIK,
      {
        assets: {
          banner_url: banner,
          logo_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/logo.png`,
        },
      },
      PRESET_ID,
    )
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain(`<img src="${banner}"`)
    expect(html).toContain('banner-v1721000000000.png')
    expect(html).toContain(
      `<img src="${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/logo.png"`,
    )
  })

  it('Task 11 rider: bucket-path override asset → preview img src expanded via storageAssetUrl', async () => {
    const bannerPath = 'organizers/org-1/events/e-1/banner-v1721000000000.png'
    const resolved = deriveTheme(BATIK, { assets: { banner_url: bannerPath } }, PRESET_ID)
    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
    expect(html).toContain(
      `<img src="${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/${bannerPath}"`,
    )
    expect(html).not.toContain('<img src="organizers/')
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

  it('Task 11 rider: bucket-path asset draft → thumbnail src is the EXPANDED Storage URL (Save stays enabled)', async () => {
    // The uploader now drafts `result.path` (bucket-relative — 076-legal on
    // any origin). The row thumbnail must render its expansion, never the raw
    // path; and the value passes the save validator (no validation errors in
    // the render).
    const bannerPath = 'organizers/org-1/events/e-1/banner-v1720000000000.png'
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={null}
        savedConfig={{
          assets: { banner_url: bannerPath },
          typography: { heading_font_url: 'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2' },
        }}
        presets={PRESETS}
      />,
    )
    expect(html).toContain(
      `<img src="${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/${bannerPath}"`,
    )
    expect(html).not.toContain(`<img src="organizers/`)
    expect(html).toContain('banner-v1720000000000.png')
    // bucket path passes assetValueOk → the save bar renders no asset errors
    expect(html).not.toContain('must be a bucket path')
  })

  it('gallery excludes an inactive preset; actives remain (Task 8)', async () => {
    const RETIRED_ID = '22222222-2222-2222-2222-222222222222'
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={null}
        savedConfig={null}
        presets={[
          { id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK, is_active: true },
          { id: RETIRED_ID, name: 'Retired Preset', tokens: BATIK, is_active: false },
        ]}
      />,
    )
    expect(html).toContain('Batik Heritage')
    expect(html).not.toContain('Retired Preset')
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

  it('CodeRabbit (PRRT_kwDOSFI0as6xa2iK): the deactivated-but-REFERENCED preset stays visible as a disabled card', async () => {
    const RETIRED_ID = '33333333-3333-3333-3333-333333333333'
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={RETIRED_ID}
        savedConfig={null}
        presets={[
          { id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK, is_active: true },
          { id: RETIRED_ID, name: 'Retired Preset', tokens: BATIK, is_active: false },
        ]}
      />,
    )
    // The referenced card renders (editor keeps resolving its saved selection)…
    expect(html).toContain('Retired Preset')
    // …marked distinctly disabled: CSS class + (deactivated) marker + disabled
    expect(html).toContain('(deactivated)')
    expect(html).toContain('grayscale')
    expect(html).toContain('disabled=""')
  })

  it('CodeRabbit follow-up: the saved inactive preset card survives a draft switch to Custom', async () => {
    const RETIRED_ID = '55555555-5555-5555-5555-555555555555'
    render(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={RETIRED_ID}
        savedConfig={null}
        presets={[
          { id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK, is_active: true },
          { id: RETIRED_ID, name: 'Retired Preset', tokens: BATIK, is_active: false },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Custom/ }))
    expect(screen.getByText('Retired Preset')).toBeTruthy()
    // …but stays unmistakably unselectable while inactive
    const card = screen.getByRole('button', { name: /Retired Preset/i }) as HTMLButtonElement
    expect(card.disabled).toBe(true)
  })

  it('CodeRabbit (PRRT_kwDOSFI0as6xa2iW follow-up): still hides a deactivated preset the event does NOT reference (Task 8)', async () => {
    const RETIRED_ID = '44444444-4444-4444-4444-444444444444'
    const html = await toHtml(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={PRESET_ID}
        savedConfig={null}
        presets={[
          { id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK, is_active: true },
          { id: RETIRED_ID, name: 'Retired Preset', tokens: BATIK, is_active: false },
        ]}
      />,
    )
    expect(html).toContain('Batik Heritage')
    expect(html).not.toContain('Retired Preset')
  })
})

describe('CodeRabbit fixes (interactive): save-time data safety + label honesty', () => {
  afterEach(cleanup)

  it('Save is disabled while an upload is in flight (PRRT_kwDOSFI0as6xa2if)', async () => {
    uploadThemeAsset.mockImplementation(
      () => new Promise<never>(() => {}), // never settles — stays in flight
    )
    render(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={PRESET_ID}
        savedConfig={null}
        presets={PRESETS}
      />,
    )
    // Make the draft dirty WITHOUT the upload: switch to the Custom card so
    // selectedPresetId diverges from the saved one (Save would be enabled).
    fireEvent.click(screen.getByRole('button', { name: /Custom/ }))
    const saveBefore = screen.getByRole('button', { name: /Save theme/i })
    expect(saveBefore.disabled).toBe(false)

    // Start a banner upload (first image file input = banner row).
    const file = new File(['x'], 'banner.png', { type: 'image/png' })
    const inputs = document.querySelectorAll('input[type=file]')
    fireEvent.change(inputs[0], { target: { files: [file] } })

    expect(screen.getByRole('button', { name: /Save theme/i }).disabled).toBe(true)
    expect(screen.getByText('Upload in progress…')).toBeTruthy()
  })

  it('reciprocal gate: upload controls are disabled while a save is in flight', async () => {
    const { saveEventTheme } = await import('@/components/events/actions')
    vi.mocked(saveEventTheme).mockImplementation(() => new Promise(() => {})) // never settles
    render(
      <ThemeEditor
        eventId={EVENT_ID}
        organizerId="org-1"
        canEdit
        savedPresetId={PRESET_ID}
        savedConfig={null}
        presets={PRESETS}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Custom/ }))
    fireEvent.click(screen.getByRole('button', { name: /Save theme/i }))

    // Saving → post-save cleanup window: rows' pickers/inputs disable (the
    // handleUpload guard backs the gate up for any path).
    const inputs = document.querySelectorAll('input[type=file]')
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) expect((input as HTMLInputElement).disabled).toBe(true)
  })

  it("CodeRabbit (PRRT_kwDOSFI0as6xa2il): the font default option reads 'Preset default' when the preset defines the slot", async () => {
    // Display-only honesty fix: Radix keeps dropdown items client-only (SSR
    // renders the trigger collapsed), so assert the label helper directly —
    // the onValueChange behavior is unchanged either way.
    expect(fontDefaultLabel(undefined)).toBe('Platform default')
    expect(fontDefaultLabel('')).toBe('Platform default')
    expect(fontDefaultLabel('https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2')).toBe(
      'Preset default',
    )
  })
})
