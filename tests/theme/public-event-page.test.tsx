/**
 * P3 Task 5: the public /events/[slug] route + the organizer Copy Public
 * Event Link button. Prerender (async server component) asserts:
 * - visibility matrix (082): published renders, closed renders, draft →
 *   notFound, missing row → notFound;
 * - hostile slug shapes (`..`, NUL byte, 300-char, unicode) never crash —
 *   the raw value goes into the parameterized `.eq('slug', …)` and dies at
 *   0 rows → notFound (plan review focus #2);
 * - service-role ORDER: fetchOrganizerName is awaited only AFTER the event
 *   row query passed the visibility gate (Task 4 pattern — shared sequence
 *   log h.q; draft/missing → zero service calls);
 * - CTAs: results_published → leaderboard link; reg window open → register
 *   link; window closed/none → no register link;
 * - organizer page: the Copy Public Event Link button renders only when the
 *   event carries a slug (EventDetail type gains the column).
 *
 * Mock surface = the minimal supabase tables the pages can touch; heavy
 * client children are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prerender } from 'react-dom/static'
import PublicEventPage from '@/app/events/[slug]/page'
import OrganizerEventDetailPage from '@/app/organizer/events/[id]/page'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  q: [] as string[],
  // last recorded filter of the query builder — pins the parameterized slug eq
  lastEq: null as null | { col: string; val: unknown },
}))

const fetchOrganizerName = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      h.q.push(table)
      const respond = () => Promise.resolve({ data: h.tables[table] ?? null, error: null })
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          h.lastEq = { col, val }
          return builder
        },
        or: () => builder,
        order: () => builder,
        single: () => respond(),
        maybeSingle: () => respond(),
      }
      return builder
    },
  })),
}))

vi.mock('@/lib/supabase/safe-name', () => ({
  fetchOrganizerName,
  safeOrganizerName: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

// Heavy organizer children — stubs keep the page graph light; the copy-link
// button under test lives in the header, outside EventPageTabs.
vi.mock('@/components/events/event-settings-panel', () => ({
  EventSettingsPanel: () => <div>SETTINGS-COMPONENT</div>,
}))
vi.mock('@/components/events/event-tabs', () => ({
  EventPageTabs: () => <div>TABS-COMPONENT</div>,
}))
vi.mock('@/components/theme/theme-editor', () => ({
  ThemeEditor: () => <div>EDITOR-COMPONENT</div>,
}))
vi.mock('@/lib/runner-profiles-safe', () => ({
  getSafeRunnerProfiles: vi.fn(async () => new Map()),
}))

function publicEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    name: 'Batik Heritage Run',
    description: 'A themed run.',
    event_date: '2026-12-01T09:00:00Z',
    location: 'Dataran Bandaraya',
    status: 'published',
    event_type: null,
    target_distance_km: null,
    reg_open: null,
    reg_close: null,
    results_published: false,
    theme_preset_id: null,
    theme_config: null,
    slug: 'batik-heritage-run-a1b2c3d4',
    organizer_id: 'org-1',
    ...overrides,
  }
}

beforeEach(() => {
  h.tables = {}
  h.q.length = 0
  h.lastEq = null
  fetchOrganizerName.mockReset()
  // Same sequence log as the query builder — the order tests are then just
  // array assertions.
  fetchOrganizerName.mockImplementation(async () => {
    h.q.push('service:organizers')
    return 'Klub Batik Heritage'
  })
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

const renderPublicPage = () =>
  toHtml(<PublicEventPage params={Promise.resolve({ slug: 'batik-heritage-run-a1b2c3d4' })} />)

const ORGANIZER_EVENT = {
  ...publicEvent(),
  race_categories: [],
  registrations: [],
}

describe('PublicEventPage visibility matrix (P3 Task 5 / 082)', () => {
  it('published event → renders name, date, location, organizer (200 render)', async () => {
    h.tables.events = publicEvent()
    const html = await renderPublicPage()
    expect(html).toContain('Batik Heritage Run')
    expect(html).toContain('Dataran Bandaraya')
    expect(html).toContain('Klub Batik Heritage')
    // draft-denial chip never surfaces: only published/closed statuses render
    expect(html).toMatch(/published/)
  })

  it('closed event → renders too (§12.3 public closed reads)', async () => {
    h.tables.events = publicEvent({ status: 'closed' })
    const html = await renderPublicPage()
    expect(html).toContain('Batik Heritage Run')
    expect(html).toMatch(/closed/)
  })

  it('draft event → notFound EVEN with a resolvable row (public route denies drafts)', async () => {
    h.tables.events = publicEvent({ status: 'draft' })
    await expect(renderPublicPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('missing row (RLS-hidden / unknown slug) → notFound', async () => {
    h.tables.events = null
    await expect(renderPublicPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('PublicEventPage service-role ORDER guard (P3 Task 4 pattern)', () => {
  it('visible event → service name fetch runs only AFTER the events query', async () => {
    h.tables.events = publicEvent()
    await renderPublicPage()
    // EventThemeScope's scope pass may (or may not) add queries; the service
    // call must come after the event row and any pre-visibility query.
    expect(h.q[0]).toBe('events')
    expect(h.q.indexOf('service:organizers')).toBeGreaterThan(h.q.indexOf('events'))
  })

  it('draft event → notFound BEFORE any query beyond the event row, zero service calls', async () => {
    h.tables.events = publicEvent({ status: 'draft' })
    await expect(renderPublicPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.q).toEqual(['events'])
    expect(fetchOrganizerName).not.toHaveBeenCalled()
  })

  it('missing row → zero post-visibility queries, zero service calls', async () => {
    h.tables.events = null
    await expect(renderPublicPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.q).toEqual(['events'])
    expect(fetchOrganizerName).not.toHaveBeenCalled()
  })

  it('service fetch returns null → the organizer line is omitted (no unknown-copy fallback)', async () => {
    fetchOrganizerName.mockResolvedValue(null)
    h.tables.events = publicEvent()
    const html = await renderPublicPage()
    expect(html).not.toContain('Organized by')
    expect(html).not.toContain('Unknown Organizer')
  })
})

describe('PublicEventPage hostile slug handling (plan review focus #2)', () => {
  const HOSTILE = [
    '..',
    '..%2f..%2f',
    '%2e%2e',
    '%00',
    '\u0000',
    'a'.repeat(300),
    '러닝 유니코드slugé',
  ] as const

  it.each(HOSTILE)('slug %j → parameterized eq → notFound, no crash, no service call', async (bad) => {
    h.tables.events = null
    await expect(
      toHtml(<PublicEventPage params={Promise.resolve({ slug: bad })} />)
    ).rejects.toThrow('NEXT_NOT_FOUND')
    // the raw segment landed verbatim in the parameterized filter — no string
    // surgery, no crash
    expect(h.lastEq?.col).toBe('slug')
    expect(h.lastEq?.val).toBe(bad)
    expect(h.q).toEqual(['events'])
    expect(fetchOrganizerName).not.toHaveBeenCalled()
  })

  it('empty/missing slug → notFound BEFORE any query', async () => {
    await expect(
      toHtml(<PublicEventPage params={Promise.resolve({ slug: '' })} />)
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.q).toEqual([])
    await expect(
      toHtml(<PublicEventPage params={Promise.resolve({} as { slug: string })} />)
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.q).toEqual([])
  })
})

describe('PublicEventPage CTAs (P3 Task 5)', () => {
  it('results_published → View Leaderboard links to /runner/leaderboard?event_id=', async () => {
    h.tables.events = publicEvent({ results_published: true, status: 'closed' })
    const html = await renderPublicPage()
    expect(html).toContain('View Leaderboard')
    expect(html).toContain('/runner/leaderboard?event_id=evt-1')
  })

  it('open reg window → Register CTA links to /runner/events/{id}', async () => {
    h.tables.events = publicEvent({
      reg_open: '2026-01-01T00:00:00Z',
      reg_close: null,
    })
    const html = await renderPublicPage()
    expect(html).toContain('Register for this Event')
    expect(html).toContain('/runner/events/evt-1')
  })

  it('closed event → no Register CTA even inside an otherwise-open window', async () => {
    h.tables.events = publicEvent({ status: 'closed', results_published: false })
    const html = await renderPublicPage()
    expect(html).not.toContain('Register for this Event')
    expect(html).not.toContain('View Leaderboard')
  })

  it('published event outside the reg window → no Register CTA', async () => {
    h.tables.events = publicEvent({ reg_close: '2026-01-01T00:00:00Z' })
    const html = await renderPublicPage()
    expect(html).not.toContain('Register for this Event')
  })

  it('virtual event → distance chip renders the target km', async () => {
    h.tables.events = publicEvent({ event_type: 'virtual', target_distance_km: 42 })
    const html = await renderPublicPage()
    expect(html).toContain('Virtual Run')
    expect(html).toMatch(/42(?:<!-- -->)? km/)
  })
})

describe('CopyPublicEventLink on the organizer page (P3 Task 5)', () => {
  const renderOrganizerPage = () =>
    toHtml(<OrganizerEventDetailPage params={Promise.resolve({ id: 'evt-1' })} />)

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example')
  })

  it('event with slug → Copy Public Event Link button renders in the header', async () => {
    h.tables.events = ORGANIZER_EVENT
    const html = await renderOrganizerPage()
    expect(html).toContain('Copy Public Event Link')
    expect(html).toContain('SETTINGS-COMPONENT') // sanity: the header block rendered
  })

  it('event without slug (draft — slug stays NULL per 077) → no button, page still renders', async () => {
    h.tables.events = { ...ORGANIZER_EVENT, slug: null, status: 'draft' }
    const html = await renderOrganizerPage()
    expect(html).not.toContain('Copy Public Event Link')
    expect(html).toContain('SETTINGS-COMPONENT')
  })

  it('hidden event row → notFound', async () => {
    h.tables.events = null
    await expect(renderOrganizerPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
