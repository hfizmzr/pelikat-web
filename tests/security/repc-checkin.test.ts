// Covers: FR-23–FR-27 (UC06 REPC check-in, UC07 proxy collection), NFR10 — REPC check-in RPC

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * REPC check-in contract tests (FR-23..FR-27):
 *  - POST /api/repc/check-in: staff QR scan → repc_check_in_with_merch RPC
 *    with the exact args (FR-23), duplicate check-in surfacing
 *    already_checked_in (FR-24), staff audit_log entry (FR-27).
 *  - POST /api/repc/proxy-check-in: consent code + collector QR validation
 *    (FR-26), proxy audit trail with collector + absent runner + timestamp
 *    (FR-27), consent-code/collection bookkeeping only on first check-in.
 *  - FR-25: shirt inventory decrement lives in SQL — pinned as migration text
 *    (same readFileSync pattern as tests/notifications, tests/security/*).
 */

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  djangoVerify: null as Record<string, unknown> | null,
  djangoThrows: false,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as { message: string } | null,
  rpcRows: [] as Record<string, unknown>[],
  collector: null as unknown,
  absent: null as unknown,
  absentFallback: null as unknown,
  consentRecord: null as unknown,
  queries: [] as { table: string; select?: string; eqs: unknown[][]; ilike?: unknown[] }[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; row: Record<string, unknown>; eqs: unknown[][] }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const resolveQuery = (q: { table: string; eqs: unknown[][]; ilike?: unknown[] }) => {
      if (q.table === 'registrations') {
        if (q.eqs.length >= 3) return h.collector // collector: event + runner + bib
        if (q.ilike) return h.absentFallback // case-insensitive bib fallback
        return h.absent // absent runner: event + bib
      }
      if (q.table === 'repc_consent_codes') return h.consentRecord
      return null
    }

    const makeBuilder = (table: string) => {
      const q = { table, select: undefined as string | undefined, eqs: [] as unknown[][], ilike: undefined as unknown[] | undefined }
      const b: Record<string, unknown> = {
        select: (cols: string) => { q.select = cols; return b },
        eq: (col: unknown, val: unknown) => { q.eqs.push([col, val]); return b },
        ilike: (col: unknown, val: unknown) => { q.ilike = [col, val]; return b },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => { h.queries.push(q); return { data: resolveQuery(q), error: null } },
        single: async () => { h.queries.push(q); return { data: resolveQuery(q), error: null } },
        insert: (row: Record<string, unknown>) => { h.inserts.push({ table, row }); return b },
        update: (row: Record<string, unknown>) => {
          const entry = { table, row, eqs: [] as unknown[][] }
          h.updates.push(entry)
          return {
            eq: (col: unknown, val: unknown) => { entry.eqs.push([col, val]); return b },
          }
        },
      }
      return b
    }

    return {
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      rpc: async (name: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ name, args })
        return { data: h.rpcError ? null : h.rpcRows, error: h.rpcError }
      },
      from: makeBuilder,
    }
  }),
}))

vi.mock('@/lib/django', () => ({
  fetchDjangoApi: vi.fn(async () => {
    if (h.djangoThrows) throw new Error('django down')
    return h.djangoVerify
  }),
}))

const { POST: CHECK_IN } = await import('@/app/api/repc/check-in/route')
const { POST: PROXY_CHECK_IN } = await import('@/app/api/repc/proxy-check-in/route')

const staffUser = {
  id: 'staff-1',
  email: 'staff@pelikat.my',
  app_metadata: { role: 'organizer' },
}

const verifiedQr = {
  valid: true,
  runner_id: 'runner-1',
  event_id: 'evt-1',
  bib_number: 'A001',
}

const rpcRow = (over: Record<string, unknown> = {}) => [
  {
    success: true,
    message: 'Check-in successful',
    registration_id: 'reg-1',
    bib_number: 'A001',
    runner_name: 'Abu Runner',
    shirt_size: 'M',
    remaining_qty: 41,
    already_checked_in: false,
    merch: null,
    ...over,
  },
]

const jsonRequest = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const collectorReg = {
  id: 'reg-collector',
  runner_id: 'runner-collector',
  bib_number: 'B002',
  runner_profiles_safe: [{ full_name: 'Abu Collector' }],
}

const absentReg = { runner_id: 'runner-absent', bib_number: 'A001' }

beforeEach(() => {
  h.user = staffUser
  h.djangoVerify = verifiedQr
  h.djangoThrows = false
  h.rpcCalls = []
  h.rpcError = null
  h.rpcRows = rpcRow()
  h.collector = collectorReg
  h.absent = absentReg
  h.absentFallback = null
  h.consentRecord = { id: 'consent-1' }
  h.queries = []
  h.inserts = []
  h.updates = []
})

describe('POST /api/repc/check-in (staff QR scan, FR-23/FR-24)', () => {
  const post = (body: Record<string, unknown>) =>
    CHECK_IN(jsonRequest('http://localhost/api/repc/check-in', body))

  it('verifies the QR via Django then calls the check-in+merch RPC with exact args (FR-23)', async () => {
    const res = await post({ qr_payload: 'signed-qr', event_id: 'evt-1' })
    const body = await res.json()

    expect(h.rpcCalls).toHaveLength(1)
    expect(h.rpcCalls[0].name).toBe('repc_check_in_with_merch')
    expect(h.rpcCalls[0].args).toEqual({
      p_event_id: 'evt-1',
      p_runner_id: 'runner-1',
      p_bib_number: 'A001',
      p_is_proxy: false,
      p_consent_code: null,
      p_collected_by: 'staff@pelikat.my',
    })
    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      valid: true,
      message: 'Check-in successful',
      registration_id: 'reg-1',
      already_checked_in: false,
      runner: { name: 'Abu Runner', bib: 'A001', shirt_size: 'M', remaining_qty: 41 },
      merch: null,
    })
  })

  it('surfaces the duplicate check-in idempotently: already_checked_in true, RPC still called (FR-24)', async () => {
    h.rpcRows = rpcRow({ message: 'Runner is already checked in', already_checked_in: true })

    const res = await post({ qr_payload: 'signed-qr', event_id: 'evt-1' })
    const body = await res.json()

    expect(h.rpcCalls).toHaveLength(1)
    expect(body.success).toBe(true)
    expect(body.already_checked_in).toBe(true)
    expect(body.message).toBe('Runner is already checked in')
  })

  it('surfaces an RPC rejection as an unsuccessful scan (FR-24 rejection path)', async () => {
    h.rpcError = { message: 'No shirts remaining for this size' }

    const res = await post({ qr_payload: 'signed-qr', event_id: 'evt-1' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: false, valid: false, message: 'No shirts remaining for this size' })
  })

  it('logs runner_check_in to audit_log on a successful scan (FR-27)', async () => {
    await post({ qr_payload: 'signed-qr', event_id: 'evt-1' })

    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].table).toBe('audit_log')
    expect(h.inserts[0].row).toEqual({
      actor_id: 'staff-1',
      actor_email: 'staff@pelikat.my',
      action: 'runner_check_in',
      target_id: 'runner-1',
      metadata: { event_id: 'evt-1', bib_number: 'A001', registration_id: 'reg-1' },
    })
  })

  it('rejects unauthenticated, non-organizer and malformed requests before any RPC', async () => {
    h.user = null
    expect((await post({ qr_payload: 'x', event_id: 'evt-1' })).status).toBe(401)
    expect(h.rpcCalls).toHaveLength(0)

    h.user = { id: 'u2', email: 'r@x', app_metadata: { role: 'runner' } }
    expect((await post({ qr_payload: 'x', event_id: 'evt-1' })).status).toBe(403)

    h.user = staffUser
    const missing = await post({ qr_payload: '', event_id: '' })
    expect(missing.status).toBe(400)
    expect(((await missing.json()) as { message: string }).message).toBe('Missing QR payload or event ID')
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('rejects QRs Django cannot verify, from another event, or missing runner details', async () => {
    h.djangoVerify = { valid: false, error: 'Signature expired' }
    let res = await post({ qr_payload: 'x', event_id: 'evt-1' })
    expect(((await res.json()) as { message: string }).message).toBe('Signature expired')

    h.djangoVerify = { valid: true, runner_id: 'r9', event_id: 'OTHER', bib_number: 'Z999' }
    res = await post({ qr_payload: 'x', event_id: 'evt-1' })
    expect(((await res.json()) as { message: string }).message).toBe('QR code belongs to a different event')

    h.djangoVerify = { valid: true, event_id: 'evt-1' }
    res = await post({ qr_payload: 'x', event_id: 'evt-1' })
    expect(((await res.json()) as { message: string }).message).toBe('QR code is missing runner details')

    expect(h.rpcCalls).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('answers 502 when the QR verification service is down', async () => {
    h.djangoThrows = true
    const res = await post({ qr_payload: 'x', event_id: 'evt-1' })
    expect(res.status).toBe(502)
    expect(h.rpcCalls).toHaveLength(0)
  })
})

describe('POST /api/repc/proxy-check-in (consent + collector QR, FR-26/FR-27)', () => {
  const post = (body: Record<string, unknown>) =>
    PROXY_CHECK_IN(jsonRequest('http://localhost/api/repc/proxy-check-in', body))

  const validBody = {
    event_id: 'evt-1',
    absent_bib_number: 'A001',
    consent_code: 'abc123',
    collector_qr_payload: 'collector-qr',
  }

  it('validates collector QR + registration and calls the RPC as proxy with uppercased consent code (FR-26)', async () => {
    const res = await post(validBody)
    const body = await res.json()

    expect(h.rpcCalls).toHaveLength(1)
    expect(h.rpcCalls[0].args).toEqual({
      p_event_id: 'evt-1',
      p_runner_id: 'runner-absent',
      p_bib_number: 'A001',
      p_is_proxy: true,
      p_consent_code: 'ABC123',
      p_collected_by: 'Abu Collector (BIB B002)',
    })
    expect(body.success).toBe(true)
    expect(body.collector).toEqual({
      runner_id: 'runner-collector',
      bib: 'B002',
      name: 'Abu Collector',
    })
  })

  it('marks the collection row proxy + consumes the consent code + audits collector/absent/timestamp (FR-27)', async () => {
    await post(validBody)

    const collectionUpdate = h.updates.find((u) => u.table === 'repc_collections')
    expect(collectionUpdate?.row).toEqual({
      collector_registration_id: 'reg-collector',
      collector_runner_id: 'runner-collector',
      collector_bib_number: 'B002',
      collector_name: 'Abu Collector',
      collection_method: 'proxy',
      qr_verified_at: expect.any(String),
      staff_email: 'staff@pelikat.my',
      notes: 'Proxy collection by Abu Collector (BIB B002)',
    })
    expect(collectionUpdate?.eqs).toEqual([['registration_id', 'reg-1']])

    const consentUpdate = h.updates.find((u) => u.table === 'repc_consent_codes')
    expect(consentUpdate?.row).toEqual({
      used_by_runner_id: 'runner-collector',
      used_by_registration_id: 'reg-collector',
      used_at: expect.any(String),
    })
    expect(consentUpdate?.eqs).toEqual([['id', 'consent-1']])

    const audit = h.inserts.find((i) => i.table === 'audit_log')
    expect(audit?.row).toEqual({
      actor_id: 'staff-1',
      actor_email: 'staff@pelikat.my',
      action: 'runner_proxy_check_in',
      target_id: 'runner-absent',
      metadata: {
        event_id: 'evt-1',
        bib_number: 'A001',
        registration_id: 'reg-1',
        collector_runner_id: 'runner-collector',
        collector_bib_number: 'B002',
        collector_name: 'Abu Collector',
      },
    })
  })

  it('skips consent consumption + audit when the runner was already checked in (FR-24 × proxy)', async () => {
    h.rpcRows = rpcRow({ message: 'Runner is already checked in', already_checked_in: true })

    const res = await post(validBody)
    const body = await res.json()

    expect(body.already_checked_in).toBe(true)
    expect(h.updates).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('rejects missing fields, unverified collector QR and cross-event collectors (FR-26)', async () => {
    expect((await post({ ...validBody, consent_code: '' })).status).toBe(400)

    h.djangoVerify = { valid: false, error: 'Bad collector QR' }
    let res = await post(validBody)
    expect(((await res.json()) as { message: string }).message).toBe('Bad collector QR')

    h.djangoVerify = { valid: true, event_id: 'other-event', runner_id: 'rc', bib_number: 'B002' }
    res = await post(validBody)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Collector must be registered in the same event'
    )
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('requires the collector to be a registered participant of the event', async () => {
    h.collector = null
    const res = await post(validBody)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Collector must be a registered participant in the same event'
    )
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('falls back to a case-insensitive BIB lookup for the absent runner', async () => {
    h.absent = null
    h.absentFallback = absentReg

    const res = await post({ ...validBody, absent_bib_number: 'a001' })
    const body = await res.json()

    expect(h.rpcCalls[0].args).toEqual(
      expect.objectContaining({ p_runner_id: 'runner-absent', p_bib_number: 'A001' })
    )
    expect(body.success).toBe(true)
  })

  it('rejects self-collection and unknown absent runners (FR-26)', async () => {
    h.absent = { runner_id: 'runner-collector', bib_number: 'B002' }
    let res = await post({ ...validBody, absent_bib_number: 'B002' })
    expect(((await res.json()) as { message: string }).message).toBe(
      'Use normal QR check-in when the runner is collecting their own race pack'
    )

    h.absent = null
    res = await post(validBody)
    expect(((await res.json()) as { message: string }).message).toBe('Absent runner registration not found')
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('requires an active consent code at the SQL layer — expired/used codes fail the RPC', async () => {
    // The RPC is the consent gate; an invalid code surfaces its message.
    h.rpcError = { message: 'Invalid or expired consent code' }

    const res = await post(validBody)
    const body = await res.json()
    expect(body).toEqual({ success: false, valid: false, message: 'Invalid or expired consent code' })
    expect(h.updates).toHaveLength(0)
  })
})

describe('FR-25: shirt inventory decrement (migration 028 SQL pins)', () => {
  const migration = readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '028_setup_repc_shirt_inventory_checkin.sql'),
    'utf-8'
  )

  it('decrements claimed_qty atomically inside repc_check_in_registration', () => {
    const fn = migration.slice(
      migration.indexOf('create or replace function public.repc_check_in_registration'),
      migration.indexOf('grant execute on function public.repc_check_in_registration')
    )
    expect(fn).toContain('update public.event_shirt_inventory')
    expect(fn).toContain('set claimed_qty = claimed_qty + 1')
    expect(fn).toContain('returning initial_qty - claimed_qty into v_remaining')
  })

  it('refuses collection when no shirts remain for the size', () => {
    expect(migration).toContain("return query select false, 'No shirts remaining for this size'")
    expect(migration).toContain('if v_remaining <= 0 then')
  })

  it('lock-free idempotent duplicate: re-computes remaining qty without decrementing', () => {
    const dupIdx = migration.indexOf('if v_reg.checked_in then')
    const dupBlock = migration.slice(dupIdx, migration.indexOf('end if;', dupIdx))
    expect(dupBlock).toContain('select initial_qty - claimed_qty')
    expect(dupBlock).not.toContain('claimed_qty + 1')
  })

  it('accepts only unused, unexpired consent codes for proxy collection', () => {
    expect(migration).toContain('is_used = false')
    expect(migration).toContain('expires_at > now()')
  })
})
