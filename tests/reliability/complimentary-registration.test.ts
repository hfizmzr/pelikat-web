import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { isConfirmedStatus } from '@/lib/registration-status'

// Resolve paths relative to this test file, not process.cwd() — CI and
// watchers run vitest from different working directories.
const here = dirname(fileURLToPath(import.meta.url))
const read = (...parts: string[]) =>
  readFileSync(join(here, '..', '..', ...parts), 'utf-8')

const migration = read('supabase', 'migrations', '066_complimentary_registrations.sql')
const actions = read('src', 'components', 'events', 'actions.ts')
const registrationsClient = read('src', 'components', 'events', 'registrations-client.tsx')
const runnerDetail = read('src', 'app', 'runner', 'events', '[id]', 'page.tsx')
const adminPage = read('src', 'app', 'admin', 'registrations', 'page.tsx')
const registeredSection = read('src', 'components', 'events', 'registered-events-section.tsx')

describe('Reliability: Complimentary Registrations (066)', () => {
  it('payment_status check admits the waived status', () => {
    expect(migration).toContain(
      "check (payment_status in ('pending', 'paid', 'refunded', 'waived'))"
    )
  })

  it('stores guest contact data with auto-claim backfill', () => {
    expect(migration).toContain('guest_name text')
    expect(migration).toContain('guest_email text')
    expect(migration).toContain('guest_phone text')
    expect(migration).toContain('claim_guest_registrations')
  })

  it('registration_role is constrained to runner/pacer/vip', () => {
    expect(migration).toContain(
      "check (registration_role in ('runner','pacer','vip'))"
    )
  })

  it('organizer RPC writes a complimentary_registrations_added audit row', () => {
    expect(migration).toContain("'complimentary_registrations_added'")
  })

  it('email-less guests are inserted with NULL (not \'\') guest_email', () => {
    // '' would collide with other '' rows on the partial unique index
    // (event_id, lower(guest_email)) WHERE runner_id IS NULL and roll
    // back the whole CSV import — normalize on insert.
    expect(migration).toContain(
      "case when v_profile_id is null then nullif(v_email, '') else null end"
    )
  })

  it('allocate_bib strips bib_prefix before digit parse (CodeRabbit fix 2)', () => {
    // Patched in place; 067's copy of allocate_bib carries the same fix.
    expect(migration).toContain(
      "nullif(regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\\D', '', 'g'), '')::int"
    )
    expect(migration).not.toContain("regexp_replace(bib_number")
  })

  it('function ACLs: allocate_bib internal-only, organizer RPC authenticated-only', () => {
    expect(migration).toContain(
      'revoke execute on function public.allocate_bib(uuid) from public, anon, authenticated'
    )
    expect(migration).toContain('grant execute on function public.allocate_bib(uuid) to service_role')
    expect(migration).toContain(
      'revoke execute on function public.organizer_add_complimentary_registrations(uuid, uuid, text, jsonb) from anon, public'
    )
    expect(migration).toContain(
      'grant execute on function public.organizer_add_complimentary_registrations(uuid, uuid, text, jsonb) to authenticated'
    )
  })

  it('PL/pgSQL bodies use -- comments only (no // lines)', () => {
    expect(migration).not.toMatch(/^\s*\/\//m)
  })

  it('claim_guest_registrations only auto-claims CONFIRMED emails (CWE-287)', () => {
    expect(migration).toContain('email_confirmed_at is not null')
  })
})

describe('Reliability: confirmed predicate (paid OR waived)', () => {
  it('isConfirmedStatus counts paid and waived as confirmed only', () => {
    expect(isConfirmedStatus('paid')).toBe(true)
    expect(isConfirmedStatus('waived')).toBe(true)
    expect(isConfirmedStatus('pending')).toBe(false)
    expect(isConfirmedStatus('refunded')).toBe(false)
    expect(isConfirmedStatus(undefined)).toBe(false)
    expect(isConfirmedStatus(null)).toBe(false)
  })

  it('runner event-detail never shows "Complete Payment" for a waived registration', () => {
    // Gate must use the shared confirmed predicate, not a bare 'paid' check.
    expect(runnerDetail).toContain('!isConfirmedStatus(registration.payment_status)')
    expect(runnerDetail).not.toContain("registration.payment_status !== 'paid'")
  })

  it('createHitpayCheckout can never be entered for a waived registration', () => {
    // The re-entry guard treats waived as confirmed → alreadyPaid, so a
    // checkout is only ever created for pending registrations.
    expect(actions).toContain('if (isConfirmedStatus(registration.payment_status))')
    expect(actions).toContain('return { ok: true, alreadyPaid: true }')
  })

  it('registered-events section union admits waived and styles it as confirmed', () => {
    expect(registeredSection).toContain("'pending' | 'paid' | 'refunded' | 'waived'")
    expect(registeredSection).toContain('isConfirmedStatus(reg.payment_status)')
  })

  it('admin registrations page union admits waived and styles it as confirmed', () => {
    expect(adminPage).toContain("'paid' | 'pending' | 'refunded' | 'waived'")
    expect(adminPage).toContain("reg.payment_status === 'paid' || reg.payment_status === 'waived'")
  })
})

describe('Reliability: CSV export guest columns', () => {
  it('registrations CSV client util includes guest_name and registration_role', () => {
    expect(registrationsClient).toContain('guest_name: string | null')
    expect(registrationsClient).toContain('registration_role: string')
    expect(registrationsClient).toContain("['BIB', 'Name', 'Role', 'Category', 'Phone', 'Payment', 'Checked In']")
    expect(registrationsClient).toContain('reg.guest_name || reg.runner_profiles?.full_name')
    expect(registrationsClient).toContain('reg.registration_role,')
  })

  it('bib_number is nullable in the export signature (virtual/no-bib rows)', () => {
    expect(registrationsClient).toContain('bib_number: string | null')
  })
})

describe('Reliability: organizer status filter', () => {
  it("'Waived' filter option matches waived registrations (existing options/order kept)", () => {
    const client = read('src', 'components', 'events', 'registrations-client.tsx')
    // Option renders after Pending (existing order preserved).
    expect(client).toContain('<option value="pending">Pending</option>\n                <option value="waived">Waived</option>')
    // Filter union + matching branch.
    expect(client).toContain("'paid' | 'pending' | 'waived'")
    expect(client).toContain("(statusFilter === 'waived' && reg.payment_status === 'waived')")
  })

  it('waived renders as a success (confirmed) badge in organizer tables', () => {
    const runnersPage = read('src', 'app', 'organizer', 'runners', 'page.tsx')
    expect(runnersPage).toContain("waived: 'text-success bg-success/15'")
    const orgDashboard = read('src', 'app', 'organizer', 'page.tsx')
    expect(orgDashboard).toContain("reg.payment_status === 'paid' || reg.payment_status === 'waived'")
  })

  it('phone columns fall back to guest_phone before the profile phone', () => {
    const client = read('src', 'components', 'events', 'registrations-client.tsx')
    expect(client).toContain('reg.guest_phone || reg.runner_profiles?.phone ||')
  })

  it('partial import successes surface even when a batch RPC fails', () => {
    const guests = read('src', 'components', 'events', 'complimentary-guests-client.tsx')
    expect(guests).toContain('failedBatchGuests')
    // setResults runs unconditionally, before the lastError early return.
    expect(guests.indexOf('setResults(allResults)')).toBeLessThan(guests.indexOf('if (lastError)'))
    // Retry keeps only the failed batches' rows.
    expect(guests).toContain('setImportedRows(failedBatchGuests)')
  })
})
