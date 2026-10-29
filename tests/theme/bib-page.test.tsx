/**
 * P3 Task 4: the bib pass joins the themed surfaces. Prerender (async server
 * component) asserts: EventThemeScope vars wrap the page, labels driven by
 * getSurfaceTheme (fallback map via resolveLabels(null) when unthemed), and
 * the simple generateMetadata degrades to the static fallback title.
 *
 * Mock surface = the minimal supabase tables the page + EventThemeScope can
 * touch (runner_profiles / registrations / events; theme_presets is never
 * queried here because the fixture events carry NO theme_preset_id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prerender } from 'react-dom/static'
import RunnerBibPage, { generateMetadata } from '@/app/runner/events/[id]/bib/page'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      const respond = async () => ({ data: h.tables[table] ?? null, error: null })
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: respond,
        maybeSingle: respond,
      }
      return builder
    },
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/django', () => ({
  fetchDjangoApi: vi.fn(async () => ({ qr_payload: 'signed-payload' })),
}))

vi.mock('qrcode', () => ({
  default: { toString: vi.fn(async () => '<svg>qr</svg>') },
}))

function useTables(events: unknown) {
  h.tables = {
    runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
    registrations: {
      bib_number: 'R-042',
      checked_in: false,
      checked_in_at: null,
      race_categories: { name: '10K Open' },
    },
    events,
  }
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ugexrrslijmwtieevjbs.supabase.co')
})

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

const renderBibPage = () =>
  toHtml(<RunnerBibPage params={Promise.resolve({ id: 'evt-1' })} />)

describe('RunnerBibPage (P3 Task 4: bib pass theming)', () => {
  it('themed event → scope wraps the pass AND both markup labels are themed', async () => {
    useTables({
      id: 'evt-1',
      name: 'Batik Heritage Run',
      event_date: '2026-12-01T09:00:00Z',
      location: 'Dataran Bandaraya',
      theme_preset_id: null,
      theme_config: { vocabulary: { bib_label: 'Nombor Larian' } },
    })
    const html = await renderBibPage()
    // EventThemeScope active (CSS-var tier 1)
    expect(html).toContain('class="event-theme"')
    expect(html).toContain('--et-primary:oklch(')
    // header title + canvas-adjacent h2 use the themed label
    expect(html).toContain('Nombor Larian')
    expect(html).toContain('NOMBOR LARIAN')
    // zero hardcoded bib-copy residue
    expect(html).not.toContain('Digital BIB')
  })

  it('unthemed event → no scope DOM, labels fall back to the platform map', async () => {
    useTables({
      id: 'evt-1',
      name: 'Batik Heritage Run',
      event_date: '2026-12-01T09:00:00Z',
      location: 'Dataran Bandaraya',
      theme_preset_id: null,
      theme_config: null,
    })
    const html = await renderBibPage()
    expect(html).not.toContain('event-theme')
    expect(html).not.toContain('--et-primary')
    expect(html).toContain('Bib Number') // labels.bib_label fallback
    expect(html).toContain('BIB NUMBER') // fallback uppercased
  })

  it('credentials mismatch (hidden event) → notFound before any render', async () => {
    useTables(undefined) // no registrations, no events
    await expect(renderBibPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('RunnerBibPage.generateMetadata (P3 Task 4: simple inline)', () => {
  it('event row + themed labels → "{name} - {bib_label} - Pelikat"', async () => {
    useTables({
      id: 'evt-1',
      name: 'Batik Heritage Run',
      event_date: '2026-12-01T09:00:00Z',
      location: 'Dataran Bandaraya',
      theme_preset_id: null,
      theme_config: { vocabulary: { bib_label: 'Nombor Larian' } },
    })
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'evt-1' }) })
    expect(meta.title).toBe('Batik Heritage Run - Nombor Larian - Pelikat')
  })

  it('missing event row (hidden draft / bad id) → static fallback title', async () => {
    useTables(undefined)
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'evt-1' }) })
    expect(meta.title).toBe('Digital BIB - Pelikat')
  })

  it('unthemed event → platform fallback label in the title', async () => {
    useTables({ id: 'evt-1', name: 'Night Run', theme_preset_id: null, theme_config: null })
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'evt-1' }) })
    expect(meta.title).toBe('Night Run - Bib Number - Pelikat')
  })
})
