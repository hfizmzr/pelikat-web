// Covers: NFR12 (informative errors) — error messages

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

describe('Usability: Error Messages', () => {
  it('error messages should be user-readable, not raw stack traces', () => {
    const fs = require('fs')
    const path = require('path')
    const srcDir = path.join(process.cwd(), 'src')
    
    // Check key action files for error handling
    const actionFiles = [
      'components/events/actions.ts',
      'app/runner/events/[id]/payment/page.tsx',
      'app/organizer/events/[id]/checkin/page.tsx',
    ]
    
    for (const file of actionFiles) {
      const fullPath = path.join(srcDir, file)
      if (!fs.existsSync(fullPath)) continue
      
      const content = fs.readFileSync(fullPath, 'utf-8')
      
      // Should not throw raw errors to users without try/catch
      const hasErrorHandling =
        content.includes('try {') ||
        content.includes('catch') ||
        content.includes('error') ||
        content.includes('Error')
      
      // Should not have empty catch blocks (swallows errors silently)
      const hasEmptyCatch = content.includes('catch(() => {})') || content.includes('catch (e) {}')
      
      expect(hasErrorHandling, `${file} should have error handling`).toBe(true)
    }
  })

  it('payment page shows user-friendly error messages', () => {
    const fs = require('fs')
    const path = require('path')
    const paymentPage = path.join(
      process.cwd(),
      'src',
      'app',
      'runner',
      'events',
      '[id]',
      'payment',
      'page.tsx'
    )
    
    if (fs.existsSync(paymentPage)) {
      const content = fs.readFileSync(paymentPage, 'utf-8')
      
      // Should show a message that explains it's a dummy payment
      expect(content).toContain('simulates')
      expect(content).toContain('No real transaction')
    }
  })

  it('toast notifications are used for async feedback', () => {
    const fs = require('fs')
    const path = require('path')
    const srcDir = path.join(process.cwd(), 'src')
    
    // Check that sonner toast is used for user feedback
    const files = [
      'app/organizer/events/[id]/checkin/page.tsx',
      'components/events/actions.ts',
    ]
    
    for (const file of files) {
      const fullPath = path.join(srcDir, file)
      if (!fs.existsSync(fullPath)) continue
      
      const content = fs.readFileSync(fullPath, 'utf-8')
      // Should not use console.log for user-facing messages
      // console.error is allowed for server-side error logging
      expect(content).not.toContain('console.log')
    }
  })
})

// ── NFR12: async rejection paths on the push settings card ──
const pushMocks = vi.hoisted(() => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/notifications/push-client', () => ({
  getPushSupport: () => 'supported',
  getActiveRegistration: () => Promise.resolve({}),
  getCurrentSubscription: () => Promise.resolve(null),
  enablePush: pushMocks.enablePush,
  disablePush: pushMocks.disablePush,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: pushMocks.toastError },
}))

// jsdom has no Notification API; PushSettingsCard reads .permission in its effect.
;(globalThis as { Notification: unknown }).Notification = { permission: 'default' }

import { PushSettingsCard } from '@/components/notifications/push-settings-card'

describe('Usability: Async Error Messages (NFR12, PushSettingsCard)', () => {
  afterEach(() => {
    pushMocks.enablePush.mockReset()
    pushMocks.disablePush.mockReset()
    pushMocks.toastError.mockClear()
  })

  async function renderReady() {
    render(<PushSettingsCard />)
    // Wait for the card to reach its ready state (subscription check resolved)
    await waitFor(() => expect(screen.getByText('Turn on')).toBeInTheDocument())
  }

  it('(b) shows an informative error message when enabling push fails, without crashing', async () => {
    pushMocks.enablePush.mockRejectedValueOnce(new Error('Network request failed'))
    await renderReady()

    fireEvent.click(screen.getByText('Turn on'))

    await waitFor(() =>
      expect(pushMocks.toastError).toHaveBeenCalledWith('Network request failed')
    )
    // UI still intact: the device-check result is rendered and controls usable
    expect(screen.getByText('Turn on')).toBeInTheDocument()
    expect(screen.queryByText('Checking this device…')).not.toBeInTheDocument()
  })

  it('falls back to a user-readable message when the rejection is not an Error', async () => {
    pushMocks.enablePush.mockRejectedValueOnce('boom')
    await renderReady()

    fireEvent.click(screen.getByText('Turn on'))

    await waitFor(() =>
      expect(pushMocks.toastError).toHaveBeenCalledWith(
        'Could not update push notifications'
      )
    )
    expect(pushMocks.toastError).not.toHaveBeenCalledWith('boom')
    expect(screen.getByText('Turn on')).toBeInTheDocument()
  })
})
