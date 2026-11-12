// Covers: FR-57–FR-58 (UC13 download/share + report) — runner photo actions

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'

/**
 * Runner gallery photo actions (FR-57/FR-58): download, share and the
 * "not me" report flow that moves a mis-tagged photo back to the organizer
 * review queue through the runner_request_photo_review RPC (migration 043).
 */

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  writeText: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:photo'),
  revokeObjectURL: vi.fn(),
}))

const { requestRunnerPhotoReview } = vi.hoisted(() => ({
  requestRunnerPhotoReview: vi.fn(),
}))

vi.mock('@/components/events/actions', () => ({
  requestRunnerPhotoReview: (...args: unknown[]) => requestRunnerPhotoReview(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn(), back: vi.fn() }),
}))

import { RunnerPhotoActions } from '@/components/events/runner-photo-actions'

function mount(props: Partial<Parameters<typeof RunnerPhotoActions>[0]> = {}) {
  return render(
    <RunnerPhotoActions
      imageUrl="https://signed/pexels/photo.jpg"
      fileName="bib-A001.jpg"
      eventId="evt-1"
      photoTagId="tag-1"
      {...props}
    />
  )
}

const okBlob = async () =>
  new Blob(['jpegbytes'], { type: 'image/jpeg' })

beforeEach(() => {
  cleanup()
  h.refresh.mockClear()
  h.writeText.mockReset()
  h.share.mockReset()
  h.canShare.mockReset()
  h.createObjectURL.mockClear()
  h.revokeObjectURL.mockClear()
  requestRunnerPhotoReview.mockReset()

  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: okBlob })))
  Object.defineProperty(URL, 'createObjectURL', { value: h.createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: h.revokeObjectURL, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: h.writeText },
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'share', { value: h.share, configurable: true })
  Object.defineProperty(window.navigator, 'canShare', { value: h.canShare, configurable: true })
})

describe('RunnerPhotoActions: download (FR-57)', () => {
  it('fetches the signed URL, triggers a download named after the file and cleans up', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mount()
    fireEvent.click(screen.getByTitle('Download photo'))

    await waitFor(() => expect(h.createObjectURL).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://signed/pexels/photo.jpg')
    // The hidden anchor carries the blob URL + the download filename
    expect(clickSpy).toHaveBeenCalledTimes(1)
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.download).toBe('bib-A001.jpg')
    expect(h.revokeObjectURL).toHaveBeenCalledWith('blob:photo')
    clickSpy.mockRestore()
  })

  it('shows no blob download when the photo cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: okBlob })))
    mount()
    fireEvent.click(screen.getByTitle('Download photo'))

    await waitFor(() => expect(h.createObjectURL).not.toHaveBeenCalled())
    expect(h.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('download and share are disabled when the photo has no signed URL', () => {
    mount({ imageUrl: null })
    expect(screen.getByTitle('Download photo')).toBeDisabled()
    expect(screen.getByTitle('Share photo')).toBeDisabled()
  })
})

describe('RunnerPhotoActions: share (FR-57)', () => {
  it('shares the photo file when the device supports file sharing', async () => {
    h.canShare.mockReturnValue(true)
    mount()
    fireEvent.click(screen.getByTitle('Share photo'))

    await waitFor(() => expect(h.share).toHaveBeenCalledTimes(1))
    const arg = h.share.mock.calls[0][0] as { title: string; files: File[] }
    expect(arg.title).toBe('bib-A001.jpg')
    expect(arg.files[0].name).toBe('bib-A001.jpg')
  })

  it('falls back to sharing the signed URL when file sharing is unsupported', async () => {
    h.canShare.mockReturnValue(false)
    mount()
    fireEvent.click(screen.getByTitle('Share photo'))

    await waitFor(() => expect(h.share).toHaveBeenCalledWith({ title: 'bib-A001.jpg', url: 'https://signed/pexels/photo.jpg' }))
  })

  it('without navigator.share at all, copies the URL to the clipboard', async () => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    mount()
    fireEvent.click(screen.getByTitle('Share photo'))

    await waitFor(() => expect(h.writeText).toHaveBeenCalledWith('https://signed/pexels/photo.jpg'))
  })
})

describe('RunnerPhotoActions: report mis-tagged photo (FR-58)', () => {
  it('opens the review modal and submits eventId/photoTagId through the server action', async () => {
    requestRunnerPhotoReview.mockResolvedValue({
      status: 'success',
      message: 'Photo sent back to organizer review.',
    })
    mount()

    fireEvent.click(screen.getByTitle('Not me? Send back to organizer review'))
    expect(await screen.findByText('Send this photo back to review?')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send to review/i }))
    })

    expect(requestRunnerPhotoReview).toHaveBeenCalledTimes(1)
    const [, formData] = requestRunnerPhotoReview.mock.calls[0] as [unknown, FormData]
    expect(formData.get('eventId')).toBe('evt-1')
    expect(formData.get('photoTagId')).toBe('tag-1')
  })

  it('closes the modal and refreshes the gallery after a successful report', async () => {
    requestRunnerPhotoReview.mockResolvedValue({
      status: 'success',
      message: 'Photo sent back to organizer review.',
    })
    mount()

    fireEvent.click(screen.getByTitle('Not me? Send back to organizer review'))
    await screen.findByText('Send this photo back to review?')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send to review/i }))
    })

    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByText('Send this photo back to review?')).not.toBeInTheDocument()
    )
  })

  it('shows the failure message in the modal and keeps it open', async () => {
    requestRunnerPhotoReview.mockResolvedValue({
      status: 'error',
      message: 'This photo is no longer available in your gallery.',
    })
    mount()

    fireEvent.click(screen.getByTitle('Not me? Send back to organizer review'))
    await screen.findByText('Send this photo back to review?')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send to review/i }))
    })

    expect(await screen.findByText('This photo is no longer available in your gallery.')).toBeInTheDocument()
    expect(screen.getByText('Send this photo back to review?')).toBeInTheDocument()
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('the flag button only appears with eventId + photoTagId', () => {
    mount({ eventId: undefined, photoTagId: undefined })
    expect(screen.queryByTitle('Not me? Send back to organizer review')).not.toBeInTheDocument()
  })
})
