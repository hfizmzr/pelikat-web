import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import type { PhotoBatch } from '@/lib/photo-batches'

/**
 * Organizer photo review queue (FR-15/FR-20/FR-21):
 *  - PhotoUploader: bulk upload → storage paths → triggerPhotoProcessing batch
 *    (FR-15).
 *  - PhotoBatchList: per-batch status/stats display + live polling with
 *    refresh on completion (FR-20).
 *  - PhotoReviewActions / PhotoGalleryTagActions: confirm-with-BIB-correction
 *    and "Correct Tag" back-to-review actions (FR-21).
 */

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  uploadCalls: [] as { path: string }[],
  triggerPhotoProcessing: vi.fn(),
  photoBatchesResponse: null as { data: PhotoBatch[] | null; error: null } | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/components/events/actions', () => ({
  triggerPhotoProcessing: (...args: unknown[]) => h.triggerPhotoProcessing(...args),
  triggerPhotoProcessingForPrefix: vi.fn(),
  confirmReviewPhoto: vi.fn(),
  discardReviewPhoto: vi.fn(),
  movePhotoTagToReview: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'org-user' } } }) },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          h.uploadCalls.push({ path })
          return { error: null }
        },
      }),
    },
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        // deferred: the poll resolves with whatever the test installed
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve(h.photoBatchesResponse ?? { data: [], error: null }).then(resolve),
      }
      return b
    },
  }),
}))

import { PhotoUploader } from '@/components/events/photo-uploader'
import { PhotoBatchList } from '@/components/events/photo-batch-list'
import { PhotoReviewActions } from '@/components/events/photo-review-actions'
import { PhotoGalleryTagActions } from '@/components/events/photo-gallery-tag-actions'

const batch = (over: Partial<PhotoBatch> = {}): PhotoBatch => ({
  id: 'b1b2b3b4-1111-2222-3333-444444444444',
  event_id: 'evt-1',
  source: 'upload',
  status: 'completed',
  total: 20,
  processed: 20,
  auto_tagged: 16,
  flagged: 2,
  no_bib: 1,
  failed: 1,
  created_at: '2026-11-10T03:24:00Z',
  started_at: null,
  finished_at: null,
  ...over,
})

beforeEach(() => {
  cleanup()
  h.refresh.mockClear()
  h.uploadCalls.length = 0
  h.triggerPhotoProcessing.mockReset()
  h.photoBatchesResponse = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PhotoUploader: bulk upload → AI tagging batch (FR-15)', () => {
  function files(length: number) {
    return Array.from({ length }, (_, i) => new File([`photo-${i}`], `run-${i}.jpg`, { type: 'image/jpeg' }))
  }

  async function upload(count: number) {
    vi.stubGlobal('crypto', { randomUUID: () => 'batch-uuid-1' })
    render(<PhotoUploader eventId="evt-1" />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: files(count) } })
    })
  }

  it('uploads every file into a unique batch folder and queues one tagging batch', async () => {
    h.triggerPhotoProcessing.mockResolvedValue(batch({ total: 2, processed: 2 }))

    await upload(2)

    await waitFor(() => expect(h.triggerPhotoProcessing).toHaveBeenCalledTimes(1))
    expect(h.triggerPhotoProcessing).toHaveBeenCalledWith('evt-1', ['org-user/evt-1/batch-uuid-1/0-run-0.jpg', 'org-user/evt-1/batch-uuid-1/1-run-1.jpg'], 'batch-uuid-1')
    expect(h.uploadCalls.map((u) => u.path)).toEqual([
      'org-user/evt-1/batch-uuid-1/0-run-0.jpg',
      'org-user/evt-1/batch-uuid-1/1-run-1.jpg',
    ])
    expect(await screen.findByText('2 photos queued for AI tagging')).toBeInTheDocument()
  })

  it('refreshes the server render after the batch is queued', async () => {
    h.triggerPhotoProcessing.mockResolvedValue(batch({ total: 1, processed: 1 }))
    await upload(1)

    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    expect(await screen.findByText(/batch batch-u/i)).toBeInTheDocument()
  })

  it('sign-in requirement: storage errors surface a retryable failure state', async () => {
    h.triggerPhotoProcessing.mockRejectedValue(new Error('Django queue unreachable'))
    await upload(1)

    expect(await screen.findByText('Could not queue AI tagging')).toBeInTheDocument()
    expect(screen.getByText('Django queue unreachable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry queuing/i })).toBeInTheDocument()
  })
})

describe('PhotoBatchList: batch status + stats (FR-20)', () => {
  it('renders per-batch progress stats and the Completed badge', () => {
    render(<PhotoBatchList eventId="evt-1" initialBatches={[batch()]} />)

    expect(screen.getByText(/20 of 20 photos processed/i)).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Auto-tagged')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('Flagged')).toBeInTheDocument()
    expect(screen.getByText('No BIB found')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows queued/processing badge while the batch is still running', () => {
    render(<PhotoBatchList eventId="evt-1" initialBatches={[batch({ status: 'processing', processed: 5, total: 20 })]} />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
    expect(screen.getByText(/5 of 20 photos processed/i)).toBeInTheDocument()
  })

  it('empty history explains that tagging runs in the background', () => {
    render(<PhotoBatchList eventId="evt-1" initialBatches={[]} />)
    expect(screen.getByText(/No processing batches yet/i)).toBeInTheDocument()
  })

  it('polls photo_batches while a batch is active and refreshes once it completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    h.photoBatchesResponse = { data: [batch({ status: 'completed' })], error: null }

    render(<PhotoBatchList eventId="evt-1" initialBatches={[batch({ status: 'queued' })]} />)
    expect(screen.getByText('Queued')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1))
    // completed batch renders from polled data — no further polling refreshes
    h.refresh.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(h.refresh).not.toHaveBeenCalled()
  })
})

describe('PhotoReviewActions + PhotoGalleryTagActions: tag correction (FR-21)', () => {
  it('confirm form carries the detected BIB for correction and both hidden ids', () => {
    render(<PhotoReviewActions eventId="evt-1" photoTagId="tag-1" storagePath="batch1/pexels-1.jpg" detectedBib="A001" />)

    const bibInput = screen.getByLabelText('Confirm or correct BIB')
    expect(bibInput).toHaveValue('A001')
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('gallery tag correction offers the Correct Tag action back to review', () => {
    render(<PhotoGalleryTagActions eventId="evt-1" photoTagId="tag-1" />)
    expect(screen.getByRole('button', { name: /correct tag/i })).toBeInTheDocument()
  })
})
