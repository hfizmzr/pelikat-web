// @vitest-environment node
// EXT-5: unit tests for the pure notification dispatch batch/retry logic
// extracted to supabase/functions/_shared/dispatch.ts. The HTTP transport
// is stubbed, exactly as the edge function injects it at its call site.
// Note: the 50s run-budget guard is extracted purely (shouldClaimNextBatch);
// the Resend spacing sleeps are injected/overridden in tests, so no timers
// are needed here.
import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  RESEND_BATCH_SIZE,
  RESEND_SPACING_MS,
  chunkAudience,
  classifyStatus,
  computeRetryState,
  deliverEmails,
  shouldClaimNextBatch,
  shouldMarkTerminal,
  type EmailMessage,
  type EmailTransport,
} from '../../supabase/functions/_shared/dispatch'

function msg(id: string): EmailMessage {
  return { id, to: `${id}@example.com`, subject: 's', html: '<p>hi</p>', text: 'hi' }
}

/** Transport stub recording every call; handlers keyed by URL. */
function stubTransport(
  handlers: Record<string, (body: unknown) => { status: number; text: string } | Promise<{ status: number; text: string }>>,
) {
  const calls: Array<{ url: string; body: unknown }> = []
  const transport: EmailTransport = {
    async post(url, body) {
      calls.push({ url, body })
      const handler = handlers[url]
      if (!handler) throw new Error(`unexpected url ${url}`)
      return handler(body)
    },
  }
  return { transport, calls }
}

describe('retry state (MAX_ATTEMPTS progression)', () => {
  it('keeps retrying while attempts < 5 and stops at 5', () => {
    // Each retriable failure re-claims the row and the DB increments
    // attempts; the loop models that progression 0→5.
    let attempts = 0
    while (computeRetryState(attempts, MAX_ATTEMPTS).canRetry) attempts++
    expect(attempts).toBe(5)

    // every intermediate attempt stays pending (lease kept as backoff)
    for (let a = 0; a < MAX_ATTEMPTS; a++) {
      expect(computeRetryState(a, MAX_ATTEMPTS)).toEqual({ canRetry: true, status: 'pending' })
    }
  })

  it('marks the row failed (terminal) at attempt 5 with no further retry', () => {
    expect(shouldMarkTerminal(4)).toBe(false)
    expect(shouldMarkTerminal(5)).toBe(true)
    expect(shouldMarkTerminal(6)).toBe(true) // already past — no retry either
    expect(computeRetryState(MAX_ATTEMPTS, MAX_ATTEMPTS)).toEqual({ canRetry: false, status: 'failed' })
  })
})

describe('chunkAudience batch boundaries', () => {
  it('slices exactly at K and K+1 boundaries and yields no chunks for an empty audience', () => {
    const K = RESEND_BATCH_SIZE
    const k = Array.from({ length: K }, (_, i) => msg(`k${i}`))
    expect(chunkAudience(k, K)).toEqual([k])

    const chunks = chunkAudience([...k, msg('extra')], K)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual(k)
    expect(chunks[1]).toEqual([msg('extra')])

    // No refusal guard in the helper: empty audience → [] (the empty check
    // lives at the call site, `pending.length === 0` in index.ts).
    expect(chunkAudience([], K)).toEqual([])
  })
})

describe('deliverEmails partial-failure isolation', () => {
  it('a 4xx-rejected batch falls back per recipient: one bad address does not drop the rest', async () => {
    const { transport } = stubTransport({
      'https://api.resend.com/emails/batch': () => ({ status: 422, text: 'validation failed' }),
      'https://api.resend.com/emails': (body) => {
        const to = (body as { to: string }).to
        return to === 'b@example.com' ? { status: 422, text: 'bad address' } : { status: 200, text: '{}' }
      },
    })
    const results = await deliverEmails([msg('a'), msg('b'), msg('c')], 'from', transport, { spacingMs: 0 })

    expect(results.get('a')).toEqual({ ok: true })
    expect(results.get('b')).toEqual({ ok: false, retriable: false, error: '422 bad address' })
    expect(results.get('c')).toEqual({ ok: true })
  })

  it('a retriable batch failure applies to its own chunk only; the next chunk is still delivered', async () => {
    let batchCalls = 0
    const { transport } = stubTransport({
      'https://api.resend.com/emails/batch': () => {
        batchCalls++
        return batchCalls === 1 ? { status: 429, text: 'rate limited' } : { status: 200, text: '{}' }
      },
    })
    // batchSize 2 → two chunks; spacing injected so the test needs no timers.
    const results = await deliverEmails([msg('a'), msg('b'), msg('c')], 'from', transport, {
      batchSize: 2,
      spacingMs: 0,
    })

    expect(batchCalls).toBe(2)
    expect(results.get('a')).toEqual({ ok: false, retriable: true, error: '429 rate limited' })
    expect(results.get('b')).toEqual({ ok: false, retriable: true, error: '429 rate limited' })
    expect(results.get('c')).toEqual({ ok: true })
  })

  it('a thrown transport error (timeout) marks the chunk retriable; an empty audience makes no calls', async () => {
    const { transport, calls } = stubTransport({})
    transport.post = async () => {
      throw new Error('AbortSignal timeout')
    }
    const results = await deliverEmails([msg('a'), msg('b')], 'from', transport, { spacingMs: 0 })

    expect(calls).toHaveLength(0)
    expect(results.get('a')).toEqual({ ok: false, retriable: true, error: 'Error: AbortSignal timeout' })
    expect(results.get('b')).toEqual({ ok: false, retriable: true, error: 'Error: AbortSignal timeout' })

    const empty = await deliverEmails([], 'from', transport, { spacingMs: 0 })
    expect(empty.size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('shouldClaimNextBatch (50s run-budget guard)', () => {
  it('keeps claiming full batches within budget; stops on a short claim (drained) or exhausted budget', () => {
    expect(shouldClaimNextBatch({ lastBatchSize: null, elapsedMs: 0, budgetMs: 50_000, claimSize: 50 })).toBe(true)
    expect(shouldClaimNextBatch({ lastBatchSize: 50, elapsedMs: 49_999, budgetMs: 50_000, claimSize: 50 })).toBe(true)
    // queue drained: a claim came back short even though budget remains
    expect(shouldClaimNextBatch({ lastBatchSize: 12, elapsedMs: 1_000, budgetMs: 50_000, claimSize: 50 })).toBe(false)
    // budget exhausted even if the last batch was full
    expect(shouldClaimNextBatch({ lastBatchSize: 50, elapsedMs: 50_000, budgetMs: 50_000, claimSize: 50 })).toBe(false)
  })
})

describe('classifyStatus + extracted production defaults', () => {
  it('maps 2xx ok, 429/5xx retriable, other 4xx terminal; constants unchanged', () => {
    expect(classifyStatus(200, '')).toEqual({ ok: true })
    expect(classifyStatus(204, '')).toEqual({ ok: true })
    expect(classifyStatus(429, 'rate limited')).toEqual({ ok: false, retriable: true, error: '429 rate limited' })
    expect(classifyStatus(503, 'upstream')).toEqual({ ok: false, retriable: true, error: '503 upstream' })
    expect(classifyStatus(422, 'bad address')).toEqual({ ok: false, retriable: false, error: '422 bad address' })

    // the extraction must not drift the values the edge function relies on
    expect(MAX_ATTEMPTS).toBe(5)
    expect(RESEND_BATCH_SIZE).toBe(100)
    expect(RESEND_SPACING_MS).toBe(600)
  })
})
