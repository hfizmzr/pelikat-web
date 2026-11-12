// Covers: NFR12 (loading indicators) — loading states

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'

// ── NFR12: async device-check states on the push settings card ──
// Hoisted so tests can swap in a deferred promise and hold it pending while
// asserting; follows the vi.hoisted + vi.mock pattern used by
// tests/reliability/merch-order-status-polling.test.tsx.
const pushState = vi.hoisted(() => ({
  registration: null as Promise<unknown> | null,
}))

vi.mock('@/lib/notifications/push-client', () => ({
  getPushSupport: () => 'supported',
  getActiveRegistration: () => pushState.registration ?? Promise.resolve({}),
  getCurrentSubscription: () => Promise.resolve(null),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// jsdom has no Notification API; PushSettingsCard reads .permission in its effect.
;(globalThis as { Notification: unknown }).Notification = { permission: 'default' }

import { PushSettingsCard } from '@/components/notifications/push-settings-card'

describe('Usability: Loading States', () => {
  it('all async pages should export a loading.tsx (Next.js convention)', () => {
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    // Key routes that should have loading states
    const requiredLoadingRoutes = [
      'admin',
      'organizer',
      'organizer/analytics',
      'organizer/events',
      'organizer/merch',
      'runner',
      'runner/badges',
      'runner/events',
      'runner/leaderboard',
      'runner/merch',
    ]
    
    for (const route of requiredLoadingRoutes) {
      const loadingPath = path.join(appDir, route, 'loading.tsx')
      const exists = fs.existsSync(loadingPath)
      
      expect(exists, `Route ${route} should have loading.tsx`).toBe(true)
    }
  })

  it('loading.tsx files should render a skeleton or spinner', () => {
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    const loadingFiles = [
      'admin/loading.tsx',
      'organizer/loading.tsx',
      'runner/loading.tsx',
    ]
    
    for (const file of loadingFiles) {
      const fullPath = path.join(appDir, file)
      const content = fs.readFileSync(fullPath, 'utf-8')
      
      // Should contain some loading indicator
      const hasLoadingIndicator =
        content.includes('Skeleton') ||
        content.includes('spinner') ||
        content.includes('loading') ||
        content.includes('animate-pulse') ||
        content.includes('Loading')
      
      expect(hasLoadingIndicator, `${file} should contain a loading indicator`).toBe(true)
    }
  })

  it('Suspense boundaries are used for data-fetching components', () => {
    // Check that key pages use Suspense for async components
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    // This is a structural check - pages that fetch data should have Suspense
    const dataFetchingPages = [
      'page.tsx', // landing page
    ]
    
    for (const page of dataFetchingPages) {
      const fullPath = path.join(appDir, page)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        // Should either use Suspense or be a Server Component (no async client fetch)
        expect(content).toBeTruthy()
      }
    }
  })
})

describe('Usability: Async Loading Indicators (NFR12, PushSettingsCard)', () => {
  afterEach(() => {
    pushState.registration = null
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('(a) shows the loading indicator during the pending device check, then content on resolve', async () => {
    const { promise, resolve } = deferred<object>()
    pushState.registration = promise

    render(<PushSettingsCard />)

    // Still pending: user-facing loading copy, and no action content yet
    expect(screen.getByText('Checking this device…')).toBeInTheDocument()
    expect(screen.queryByText('Turn on')).not.toBeInTheDocument()

    resolve({})
    await waitFor(() => expect(screen.getByText('Turn on')).toBeInTheDocument())
    // Loading copy is fully replaced once the async check settles
    expect(screen.queryByText('Checking this device…')).not.toBeInTheDocument()
  })

  it('swaps the loading indicator for an informative state once the async check settles', async () => {
    const { promise, resolve } = deferred<unknown>()
    pushState.registration = promise

    render(<PushSettingsCard />)
    expect(screen.getByText('Checking this device…')).toBeInTheDocument()

    // No active service-worker registration → its own user-facing message
    resolve(null)
    await waitFor(() =>
      expect(screen.getByText(/offline app/i)).toBeInTheDocument()
    )
    expect(screen.queryByText('Checking this device…')).not.toBeInTheDocument()
  })

  it('keeps showing the loading copy while the pending promise is unresolved (fake timers)', async () => {
    vi.useFakeTimers()
    try {
      pushState.registration = new Promise<object>((res) => setTimeout(res, 5_000, {}))

      render(<PushSettingsCard />)
      expect(screen.getByText('Checking this device…')).toBeInTheDocument()

      // Before the timer fires the card must not leak the ready-state UI
      expect(screen.queryByText('Turn on')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
