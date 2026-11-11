import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'

/**
 * Consent-code status classification + proxy-collection UI actions
 * (FR-41/FR-52/FR-53) and the bib pass showing the latest check-in status
 * (FR-38/FR-51). getConsentStatus lives inline in the consent page, so the
 * classification is pinned through the rendered badge + button states.
 */

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  generateConsentCode: vi.fn(),
  writeText: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const respond = async () => ({ data: h.tables[table] ?? null, error: null })
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        single: respond,
        maybeSingle: respond,
      }
      return b
    },
  }),
}))

vi.mock('@/components/events/actions', () => ({
  generateConsentCode: (...args: unknown[]) => h.generateConsentCode(...args),
}))

import { Suspense } from 'react'
import BibConsentPage from '@/app/runner/events/[id]/bib/consent/page'

// The page unwraps params via React use(), which suspends the first render —
// mount inside act so the resolved params commit before findBy* queries.
const renderPage = () =>
  act(async () => {
    render(
      <Suspense fallback={null}>
        <BibConsentPage params={Promise.resolve({ id: 'evt-1' })} />
      </Suspense>
    )
  })

function stubClipboard() {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: h.writeText },
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'share', {
    value: h.share,
    configurable: true,
  })
}

const activeCode = {
  id: 'c-1',
  code: 'ABC123',
  is_used: false,
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
}

function useConsentTable(code: Record<string, unknown> | null) {
  h.tables = {
    runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
    registrations: {
      id: 'reg-1',
      bib_number: 'A001',
      events: { name: 'KL Run' },
      race_categories: { name: '10K Open' },
    },
    repc_consent_codes: code,
  }
}

beforeEach(() => {
  cleanup()
  h.generateConsentCode.mockReset()
  h.writeText.mockReset()
  h.share.mockReset()
  stubClipboard()
  useConsentTable(activeCode)
})

describe('BibConsentPage: getConsentStatus classification (FR-41)', () => {
  it('active code → Active badge, Copy/Share enabled', async () => {
    await renderPage()
    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled()
  })

  it('used code → Used badge, Copy/Share disabled', async () => {
    useConsentTable({ ...activeCode, is_used: true })
    await renderPage()
    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('expired code → Expired badge, Copy/Share disabled', async () => {
    useConsentTable({ ...activeCode, expires_at: '2000-01-01T00:00:00Z' })
    await renderPage()
    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('no code yet → generation screen (status none)', async () => {
    useConsentTable(null)
    await renderPage()
    expect(await screen.findByRole('button', { name: 'Generate Code' })).toBeInTheDocument()
    expect(screen.getByText('BIB')).toBeInTheDocument()
  })
})

describe('BibConsentPage: copy / share / generate actions (FR-52/FR-53)', () => {
  it('Copy writes the raw code to the clipboard and shows confirmation', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(h.writeText).toHaveBeenCalledWith('ABC123'))
    expect(screen.getByText('Copied')).toBeInTheDocument()
  })

  it('Share posts the proxy-collection message with code, BIB and expiry', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))

    await waitFor(() => expect(h.share).toHaveBeenCalledTimes(1))
    const args = h.share.mock.calls[0][0] as { title: string; text: string }
    expect(args.title).toBe('Pelikat proxy collection code')
    expect(args.text).toContain('ABC123')
    expect(args.text).toContain('BIB A001')
    expect(args.text).toContain('KL Run')
  })

  it('Share falls back to the clipboard (with full text) when navigator.share is missing', async () => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))

    await waitFor(() => expect(h.writeText).toHaveBeenCalled())
    expect(h.writeText.mock.calls[0][0] as string).toContain('Proxy collection code ABC123 for BIB A001')
  })

  it('Generate New Code calls generateConsentCode with the registration id and shows the new code', async () => {
    h.generateConsentCode.mockResolvedValue({ code: 'NEW999', expires_at: '2099-01-02T00:00:00Z' })
    await renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Generate New Code' }))
    expect(h.generateConsentCode).toHaveBeenCalledWith('reg-1')
    expect(await screen.findByText('NEW999')).toBeInTheDocument()
  })

  it('surfaces the action error when generation fails', async () => {
    h.generateConsentCode.mockRejectedValue(new Error('Code quota reached'))
    await renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Generate New Code' }))
    expect(await screen.findByText('Code quota reached')).toBeInTheDocument()
  })
})

// ── FR-38/FR-51: the bib pass itself must show the latest check-in status ──
// Same prerender approach as tests/theme/bib-page.test.tsx.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      const respond = async () => ({ data: h.tables[table] ?? null, error: null })
      const b = { select: () => b, eq: () => b, single: respond, maybeSingle: respond }
      return b
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

import RunnerBibPage from '@/app/runner/events/[id]/bib/page'
import { prerender } from 'react-dom/static'

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

const bibEvent = {
  id: 'evt-1',
  name: 'KL Run',
  event_date: '2026-12-01T09:00:00Z',
  location: 'Dataran',
  theme_preset_id: null,
  theme_config: null,
}

describe('RunnerBibPage: latest check-in status (FR-38/FR-51)', () => {
  it('checked-in registration shows the scan timestamp', async () => {
    h.tables = {
      runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
      registrations: {
        bib_number: 'R-042',
        checked_in: true,
        checked_in_at: '2026-11-01T08:15:00Z',
        race_categories: { name: '10K Open' },
      },
      events: bibEvent,
    }
    const html = await toHtml(<RunnerBibPage params={Promise.resolve({ id: 'evt-1' })} />)
    expect(html).toContain('Scanned at')
  })

  it('not-yet-checked-in registration shows no scan timestamp', async () => {
    h.tables = {
      runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
      registrations: {
        bib_number: 'R-042',
        checked_in: false,
        checked_in_at: null,
        race_categories: { name: '10K Open' },
      },
      events: bibEvent,
    }
    const html = await toHtml(<RunnerBibPage params={Promise.resolve({ id: 'evt-1' })} />)
    expect(html).not.toContain('Scanned at')
  })
})
