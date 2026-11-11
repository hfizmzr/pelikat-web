import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FR-58 contract pin: the runner "report mis-tagged photo" server action must
 * call the migration-043 RPC runner_request_photo_review(p_event_id,
 * p_photo_tag_id) and revalidate both the runner gallery and the organizer
 * review queue. Server module — imported here (not from a client-component
 * graph) so the server-only deps load normally.
 */

vi.mock('server-only', () => ({}))

const rpcSpy = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({
    supabase: { rpc: rpcSpy },
    user: { id: 'user-1', email: 'runner@example.my' },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const { requestRunnerPhotoReview } = await import('@/components/events/actions')

const submit = (eventId = 'evt-1', photoTagId = 'tag-1') => {
  const fd = new FormData()
  if (eventId) fd.set('eventId', eventId)
  if (photoTagId) fd.set('photoTagId', photoTagId)
  return requestRunnerPhotoReview({ status: 'idle' }, fd)
}

beforeEach(() => {
  rpcSpy.mockReset()
  revalidatePath.mockClear()
})

describe('requestRunnerPhotoReview server action (FR-58 → migration 043)', () => {
  it('calls runner_request_photo_review(p_event_id, p_photo_tag_id) and revalidates both queues', async () => {
    rpcSpy.mockResolvedValue({
      data: [{ success: true, message: 'Photo sent back to organizer review.' }],
      error: null,
    })

    const result = await submit()

    expect(rpcSpy).toHaveBeenCalledWith('runner_request_photo_review', {
      p_event_id: 'evt-1',
      p_photo_tag_id: 'tag-1',
    })
    expect(result).toEqual({ status: 'success', message: 'Photo sent back to organizer review.' })
    expect(revalidatePath).toHaveBeenCalledWith('/runner/events/evt-1/gallery')
    expect(revalidatePath).toHaveBeenCalledWith('/organizer/events/evt-1/photos')
  })

  it('maps an RPC error to the error state without revalidating', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await submit()

    expect(result).toEqual({ status: 'error', message: 'boom' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('maps an RPC refusal (success=false) to its message', async () => {
    rpcSpy.mockResolvedValue({
      data: [{ success: false, message: 'This photo is no longer available in your gallery.' }],
      error: null,
    })

    const result = await submit()

    expect(result).toEqual({
      status: 'error',
      message: 'This photo is no longer available in your gallery.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('missing form fields → error state, no RPC call', async () => {
    const result = await submit('', '')

    expect(result.status).toBe('error')
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
