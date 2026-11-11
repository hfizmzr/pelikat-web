import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prerender } from 'react-dom/static'

/**
 * Runner gallery (FR-55/FR-56): photos are bib-matched — the photo_tags query
 * is scoped to the event AND the runner's registration, only auto/confirmed
 * tags render, and every photo is served through a 1-hour signed URL.
 */

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  queries: [] as { table: string; eqs: unknown[][]; ins: unknown[] | null }[],
  signedUrls: [] as string[],
  signedError: null as string | null,
}))

// The gallery page renders RunnerPhotoActions (client), whose 'use server'
// action module imports a server-only lib. Neutralize the guard for the test
// graph (same trick as tests/security/runner-photo-review-action.test.ts).
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const makeBuilder = (table: string) => {
      const q = { table, eqs: [] as unknown[][], ins: null as unknown[] | null }
      const b = {
        select: () => b,
        eq: (col: unknown, val: unknown) => { q.eqs.push([col, val]); return b },
        in: (col: unknown, vals: unknown[]) => { q.ins = [col, vals]; return b },
        order: () => b,
        // single-record lookups (runner_profiles / events / registrations)
        single: async () => { h.queries.push(q); return { data: h.tables[table] ?? null, error: null } },
        // list reads (photo_tags): the builder itself is awaited
        then: (resolve: (v: unknown) => void, reject: (v: unknown) => void) => {
          h.queries.push(q)
          return Promise.resolve({ data: h.tables[table] ?? [], error: null }).then(resolve, reject)
        },
      }
      return b
    }

    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => makeBuilder(table),
      storage: {
        from: () => ({
          createSignedUrl: async (storagePath: string, expiresIn: number) => {
            h.signedUrls.push(`${storagePath}:${expiresIn}`)
            if (h.signedError) return { data: null, error: { message: h.signedError } }
            return { data: { signedUrl: `https://signed/${storagePath}?exp=${expiresIn}` }, error: null }
          },
        }),
      },
    }
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))

import RunnerGalleryPage from '@/app/runner/events/[id]/gallery/page'

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

const photo = (over: Record<string, unknown> = {}) => ({
  id: 'tag-1',
  event_id: 'evt-1',
  runner_id: 'rp-1',
  bib_number: 'A001',
  status: 'confirmed',
  confidence: 0.97,
  storage_path: 'batch1/pexels-1.jpg',
  ...over,
})

beforeEach(() => {
  h.tables = {
    runner_profiles: { id: 'rp-1', full_name: 'Abu Runner' },
    events: { id: 'evt-1', name: 'KL Run' },
    registrations: { bib_number: 'A001' },
    photo_tags: [photo(), photo({ id: 'tag-2', storage_path: 'batch1/pexels-2.jpg', status: 'auto' })],
  }
  h.queries = []
  h.signedUrls = []
  h.signedError = null
})

const renderGallery = () => toHtml(<RunnerGalleryPage params={Promise.resolve({ id: 'evt-1' })} />)

describe('RunnerGalleryPage (FR-55/FR-56)', () => {
  it('lists bib-matched photos with signed URLs, confidence and BIB badge', async () => {
    const html = (await renderGallery()).replace(/<!-- -->/g, '')

    expect(html).toContain('2 photos')
    expect(html).toContain('BIB A001')
    expect(html).toContain('pexels-1.jpg') // fileName derived from storage path
    expect(html).toContain('97%') // AI confidence badge
    // 1-hour signed URLs were created for every tagged photo
    expect(h.signedUrls).toEqual(['batch1/pexels-1.jpg:3600', 'batch1/pexels-2.jpg:3600'])
    // next/image proxies the signed URL (encoded) as the img source
    expect(html).toContain(encodeURIComponent('https://signed/batch1/pexels-1.jpg?exp=3600'))
  })

  it('only queries this event + this runner, and only auto/confirmed tags (FR-56)', async () => {
    await renderGallery()

    const photoTagQuery = h.queries.find((q) => q.table === 'photo_tags')
    expect(photoTagQuery).toBeDefined()
    expect(photoTagQuery?.eqs).toEqual([['event_id', 'evt-1'], ['runner_id', 'rp-1']])
    expect(photoTagQuery?.ins).toEqual(['status', ['auto', 'confirmed']])

    const registrationQuery = h.queries.find((q) => q.table === 'registrations')
    expect(registrationQuery?.eqs).toEqual([['event_id', 'evt-1'], ['runner_id', 'rp-1']])
  })

  it('photos whose signed URL fails render the fallback card, not a broken image', async () => {
    h.signedError = 'storage offline'
    const html = await renderGallery()
    expect(html).not.toContain('https://signed/')
    expect(html).toContain('storage offline')
  })

  it('shows the empty state while AI processing has not matched any photos yet', async () => {
    h.tables.photo_tags = []
    const html = await renderGallery()
    expect(html).toContain('No photos found yet')
  })

  it('hidden event or no registration for this runner → notFound', async () => {
    h.tables.registrations = null
    await expect(renderGallery()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
