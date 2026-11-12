/**
 * FR-65: e-certificate/badge social-share affordance on the badges page.
 * The generated cert URL is a 24h signed link (cert.ts), so the share
 * payload carries the durable page permalink (/runner/badges). Fallback
 * shape follows bib-action-buttons: navigator.share first, clipboard
 * fallback with user-visible feedback, silent no-crash when neither API
 * exists (e.g. jsdom).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BadgeCertificateButton } from '@/components/gamification/certificate-download'

// The component only renders the download button around this server action —
// mock the action module so the django/auth chain never loads.
vi.mock('@/lib/actions/cert', () => ({ generateBadgeCertificate: vi.fn() }))

const BADGE = {
  runnerId: 'runner-1',
  badgeKey: 'early_bird',
  eventId: null,
  badgeName: 'Early Bird',
}

/** jsdom lacks both share/clipboard — install configurable stubs per test. */
function stubNavigatorApis({ share, clipboard }: {
  share?: unknown
  clipboard?: unknown
}) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

const SHARE_URL = `${window.location.origin}/runner/badges`

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  stubNavigatorApis({ share: undefined, clipboard: undefined })
})

describe('BadgeCertificateButton share affordance (FR-65)', () => {
  it('navigator.share carries the badge permalink + badgeName copy; clipboard untouched', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigatorApis({ share, clipboard: { writeText } })
    render(<BadgeCertificateButton badge={BADGE} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'Early Bird - Pelikat',
        text: 'Check out my Early Bird badge from Pelikat!',
        url: SHARE_URL,
      }),
    )
    // share success → no clipboard double-handling
    expect(writeText).not.toHaveBeenCalled()
  })

  it('no navigator.share → clipboard fallback with "Link copied!" feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigatorApis({ share: undefined, clipboard: { writeText } })
    render(<BadgeCertificateButton badge={BADGE} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE_URL))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /link copied/i })).toBeTruthy(),
    )
  })

  it('share rejects → clipboard fallback + feedback still lands', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share denied'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigatorApis({ share, clipboard: { writeText } })
    render(<BadgeCertificateButton badge={BADGE} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE_URL))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /link copied/i })).toBeTruthy(),
    )
  })

  it('no share and no clipboard → click is a graceful no-op (no crash, no feedback)', async () => {
    stubNavigatorApis({ share: undefined, clipboard: undefined })
    render(<BadgeCertificateButton badge={BADGE} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    // Label unchanged — no feedback, no unhandled rejection (vitest fails
    // the file on unhandled rejections, so reaching here = graceful).
    expect(screen.getByRole('button', { name: /share/i })).toBeTruthy()
    // Download button still renders next to the share affordance.
    expect(screen.getByRole('button', { name: /download certificate/i })).toBeTruthy()
  })
})
