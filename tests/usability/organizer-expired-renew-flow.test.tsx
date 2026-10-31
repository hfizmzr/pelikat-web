import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => window.__orgTestPathname,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        console.log('DBG role=', window.__orgTestRole, 'path=', window.__orgTestPathname)
        return {
          data: { user: { id: 'u-1', app_metadata: { role: window.__orgTestRole } } },
        }
      },
    },
    from: (table: string) => {
      console.log('DBG from', table, 'path=', window.__orgTestPathname)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: window.__orgTestOrg, error: null }),
          }),
        }),
      }
    },
  }),
}))

vi.mock('@/components/layout/organizer-sidebar', () => ({
  OrganizerSidebar: () => null,
  OrganizerMobileNav: () => null,
}))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }))

import OrganizerLayout from '@/app/organizer/layout'

declare global {
  // eslint-disable-next-line no-var
  var __orgTestPathname: string | undefined
  // eslint-disable-next-line no-var
  var __orgTestRole: string | undefined
  // eslint-disable-next-line no-var
  var __orgTestOrg: Record<string, unknown> | null | undefined
}

function renderLayout(
  pathname: string,
  role: string,
  org: Record<string, unknown> | null
) {
  window.__orgTestPathname = pathname
  window.__orgTestRole = role
  window.__orgTestOrg = org
  return render(<OrganizerLayout>child</OrganizerLayout>)
}

function settle() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
}

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }
})

// The layout's PWA effect runs on mount; jsdom lacks matchMedia.

describe('organizer layout routing guards', () => {
  beforeEach(() => {
    push.mockClear()
  })
  afterEach(() => cleanup())

  it('expired organizer may stay on /organizer/payment (Renew path)', async () => {
    renderLayout('/organizer/payment', 'expired', {
      sub_expires_at: '2026-10-26T00:00:00Z',
    })
    await waitFor(() => expect(push).toBeDefined())
    await settle()
    expect(push).not.toHaveBeenCalledWith('/organizer/subscription-expired')
    expect(push).not.toHaveBeenCalledWith('/organizer/payment')
  })

  it('expired organizer elsewhere still bounces to subscription-expired', async () => {
    renderLayout('/organizer/events', 'expired', {
      sub_expires_at: '2026-10-26T00:00:00Z',
    })
    await waitFor(() => expect(push).toBeDefined())
    await settle()
    expect(push).toHaveBeenCalledWith('/organizer/subscription-expired')
  })

  it('first-sub organizer (sub NULL) on non-payment hub gets pushed to payment', async () => {
    renderLayout('/organizer', 'organizer', { sub_expires_at: null })
    await settle()
    expect(push).toHaveBeenCalledWith('/organizer/payment')
  })
})
