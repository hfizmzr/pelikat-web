/**
 * P3 Task 4: BibActionButtons props contract — the themed bib label is
 * THREADED as a prop from the server bib page (no client-side theme fetch)
 * and drives BOTH string exits: the canvas download title ("BIB NUMBER")
 * and the Web-Share title/text ("BIB <num>"/"digital BIB <num>").
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BibActionButtons } from '@/components/events/bib-action-buttons'

/** Spy on createElement so the canvas/anchor BrowserResponse — jsdom has no
 * 2d context and no download anchor — is recorder-only. */
function spyCanvas() {
  const fillText = vi.fn()
  const shared: { anchorProps: Record<string, unknown> } = { anchorProps: {} }
  const original = document.createElement.bind(document)
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tag: string, opts?: ElementCreationOptions) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: '', font: '', textAlign: '', fillRect: vi.fn(), fillText }),
          toDataURL: () => 'data:image/png;base64,x',
        } as unknown as HTMLCanvasElement
      }
      if (tag === 'a') {
        const anchor = original(tag, opts)
        Object.defineProperty(anchor, 'href', {
          set(v) {
            shared.anchorProps.href = v
          },
        })
        Object.defineProperty(anchor, 'download', {
          set(v) {
            shared.anchorProps.download = v
          },
        })
        anchor.click = () => {}
        return anchor
      }
      return original(tag, opts)
    }) as typeof document.createElement)
  return { fillText, shared, spy }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BibActionButtons bibLabel prop contract (P3 Task 4)', () => {
  it('canvas draw uses bibLabel, uppercased', () => {
    const { fillText } = spyCanvas()
    render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" bibLabel="Nombor Larian" />)
    fireEvent.click(screen.getByRole('button', { name: /save image/i }))
    expect(fillText).toHaveBeenCalledTimes(3) // label line + bib number + event name
    expect(fillText.mock.calls[0][0]).toBe('NOMBOR LARIAN')
    expect(fillText.mock.calls[0][1]).toBe(200) // canvas.width / 2
  })

  it('no prop → platform copy preserved verbatim ("BIB NUMBER")', () => {
    const { fillText } = spyCanvas()
    render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" />)
    fireEvent.click(screen.getByRole('button', { name: /save image/i }))
    expect(fillText.mock.calls[0][0]).toBe('BIB NUMBER')
  })

  it('Web Share strings use bibLabel (canvas uses the uppercase form)', async () => {
    const share = vi.fn()
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      const { fillText } = spyCanvas()
      render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" bibLabel="Nombor" />)
      // canvas exit first (Save), then the Web-Share exit
      fireEvent.click(screen.getByRole('button', { name: /save image/i }))
      fireEvent.click(screen.getByRole('button', { name: /^share$/i }))
      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: 'Nombor R-042 - Batik Run',
          text: 'Check out my digital Nombor R-042 for Batik Run!',
          url: window.location.href,
        }),
      )
      // …while the canvas line is the same label uppercased
      expect(fillText.mock.calls[0][0]).toBe('NOMBOR')
    } finally {
      delete (navigator as { share?: unknown }).share
    }
  })
})

describe('BibActionButtons download filename (P4 smoke carry)', () => {
  it('resolved bib label is the slugified filename prefix', () => {
    const { shared } = spyCanvas()
    render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" bibLabel="Nombor Larian" />)
    fireEvent.click(screen.getByRole('button', { name: /save image/i }))
    expect(shared.anchorProps.download).toBe('nombor-larian-R-042-Batik-Run.png')
  })

  it('label with non-alnum runs collapses to single dashes and is trimmed', () => {
    const { shared } = spyCanvas()
    render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" bibLabel="  -- No., BIB! --" />)
    fireEvent.click(screen.getByRole('button', { name: /save image/i }))
    expect(shared.anchorProps.download).toBe('no-bib-R-042-Batik-Run.png')
  })

  it('empty/unset label → the platform BIB prefix (canvas copy untouched)', () => {
    const { fillText, shared } = spyCanvas()
    render(<BibActionButtons bibNumber="R-042" eventName="Batik Run" />)
    fireEvent.click(screen.getByRole('button', { name: /save image/i }))
    expect(shared.anchorProps.download).toBe('BIB-R-042-Batik-Run.png')
    // unchanged: the canvas line keeps the uppercase platform copy fallback
    expect(fillText.mock.calls[0][0]).toBe('BIB NUMBER')
  })
})
