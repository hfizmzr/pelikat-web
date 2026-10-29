/**
 * P3 Task 4: runner event-detail page consumes getSurfaceTheme labels.
 * Prerender (async server component) asserts:
 * - label swaps: bib label field, "View {bib_label}" CTA, virtual run-label;
 * - organizer name: joined name wins → NO service-role fetch; join hidden
 *   (runner RLS, 019) → fetchOrganizerName resolves the display name; null →
 *   'Unknown Organizer' fallback;
 * - service-access ORDER: an unfound/draft event 404s BEFORE the service-role
 *   name fetch is ever awaited (plan review focus #4 — pinned via the shared
 *   sequence log h.q, which both the query builder and the service mock append
 *   to).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prerender } from 'react-dom/static'
import RunnerEventDetailPage from '@/app/runner/events/[id]/page'

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  q: [] as string[],
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
        eq: () => builder,
        order: () => builder,
        single: () => respond(),
        maybeSingle: () => respond(),
        // run_logs is only awaited (no .single) — keep the builder thenable
        then: (
          onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => respond().then(onFulfilled, onRejected),
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

// Heavy registrational children — stubs keep the page graph light without
// changing the label/vocabulary assertions under test.
vi.mock('@/components/events/runner-registration-actions', () => ({
  RunnerRegistrationActions: () => <div>REGISTER-COMPONENT</div>,
}))
vi.mock('@/components/events/cancel-registration-button', () => ({
  CancelRegistrationButton: () => <div>cancel</div>,
}))
vi.mock('@/components/gamification/virtual-certificate-button', () => ({
  VirtualCertificateButton: () => <div>cert</div>,
}))

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    name: 'Batik Festival Event',
    status: 'published',
    organizer_id: 'org-1',
    organizers: null, // runner RLS hides organizers (019: no public select)
    race_categories: [{}],
    event_date: '2026-12-01T09:00:00Z',
    description: 'A themed run.',
    location: 'Dataran Bandaraya',
    event_type: null,
    target_distance_km: null,
    theme_preset_id: null,
    theme_config: { vocabulary: { bib_label: 'Nombor', run_label: 'Larian' } },
    ...overrides,
  }
}

const REGISTRATION = {
  id: 'reg-1',
  bib_number: 'R-042',
  payment_status: 'paid',
  checked_in: false,
  race_categories: { name: '10K Open' },
}

function useTables(event: unknown) {
  h.tables = {
    runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
    events: event,
    registrations: REGISTRATION,
    run_logs: [],
  }
}

beforeEach(() => {
  h.q.length = 0
  fetchOrganizerName.mockReset()
  // The mock logs its call into the SAME sequence log as the query builder —
  // the order test below is then just an array assertion.
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

const renderPage = () =>
  toHtml(<RunnerEventDetailPage params={Promise.resolve({ id: 'evt-1' })} />)

describe('RunnerEventDetailPage labels (P3 Task 4)', () => {
  it('themed + registered → bib label, CTA copy and organizer name all resolved', async () => {
    useTables(baseEvent())
    const html = await renderPage()
    expect(html).toContain('class="event-theme"')
    expect(html).toContain('Nombor') // :173 field label — no literal 'BIB Number'
    expect(html).toMatch(/View (?:<!-- -->)?Nombor/) // :213 CTA
    expect(html).not.toContain('View Digital BIB Pass')
    // organizer: join hidden for runners → service-role wrapper fills it
    expect(html).toContain('Klub Batik Heritage')
    expect(html).not.toContain('Unknown Organizer')
  })

  it('event visible → service name fetch runs only AFTER the event row query', async () => {
    useTables(baseEvent())
    await renderPage()
    // Exact sequence: profiles + event row (anon/RLS) → visibility passed →
    // ONLY THEN the service-role wrapper; registrations come last.
    expect(h.q.indexOf('service:organizers')).toBeGreaterThan(h.q.indexOf('events'))
    expect(h.q[0]).toBe('runner_profiles')
    expect(h.q[1]).toBe('events')
  })

  it('joined organizers name present → service-role fetch SKIPPED (cheap path)', async () => {
    useTables(baseEvent({ organizers: { name: 'Join Klub' } }))
    const html = await renderPage()
    expect(html).toContain('Join Klub')
    expect(fetchOrganizerName).not.toHaveBeenCalled()
  })

  it('service fetch returns null → "Unknown Organizer" fallback preserved', async () => {
    fetchOrganizerName.mockResolvedValue(null)
    useTables(baseEvent())
    const html = await renderPage()
    expect(html).toContain('Unknown Organizer')
  })

  it('virtual registered → themed run_label replaces "Log a Run"', async () => {
    useTables(baseEvent({ event_type: 'virtual', target_distance_km: 42 }))
    h.tables.run_logs = [{ distance_km: 5 }]
    const html = await renderPage()
    expect(html).toContain('Larian')
    expect(html).not.toContain('Log a Run')
  })

  it('no theme → resolveLabels(null) full fallback map (never throws, no scope DOM)', async () => {
    useTables(baseEvent({ theme_config: null }))
    const html = await renderPage()
    expect(html).not.toContain('event-theme')
    expect(html).toMatch(/View (?:<!-- -->)?Bib Number/) // platform fallback CTA copy
  })
})

describe('RunnerEventDetailPage service-role ORDER guard (P3 Task 4)', () => {
  it('unfound/draft event → notFound BEFORE the service-role name fetch', async () => {
    useTables(undefined) // RLS hides the draft → events single → null
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    // Exact sequence pins the guard: the flow aborted at the visibility check,
    // so no post-visibility query (and no service read) was ever issued.
    expect(h.q).toEqual(['runner_profiles', 'events'])
    expect(fetchOrganizerName).not.toHaveBeenCalled()
  })
})

describe('RunnerEventDetailPage registration CTA gating on event status (PR33 / 045)', () => {
  it('published + unregistered → Register CTA renders', async () => {
    useTables(baseEvent({ status: 'published' }))
    h.tables.registrations = null
    const html = await renderPage()
    expect(html).toContain('REGISTER-COMPONENT')
  })

  it('closed + unregistered → no Register CTA (045 rejects), neutral closed body instead', async () => {
    useTables(baseEvent({ status: 'closed' }))
    h.tables.registrations = null
    const html = await renderPage()
    expect(html).not.toContain('REGISTER-COMPONENT')
    expect(html).toContain('Registration is closed for this event.')
  })

  it('closed + registered → registered view unchanged (no closed body)', async () => {
    useTables(baseEvent({ status: 'closed' }))
    const html = await renderPage()
    expect(html).toContain('See you at the start line.')
    expect(html).not.toContain('Registration is closed for this event.')
    expect(html).not.toContain('REGISTER-COMPONENT')
  })
})
