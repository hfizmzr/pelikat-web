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
  it('exportRegistrationsCsv includes guest_name and registration_role', () => {
    expect(actions).toContain('guest_name: string | null')
    expect(actions).toContain('registration_role: string')
    expect(actions).toContain("['BIB', 'Name', 'Role', 'Category', 'Phone', 'Payment', 'Checked In']")
    expect(actions).toContain('reg.guest_name || reg.runner_profiles?.full_name')
    expect(actions).toContain('reg.registration_role,')
  })

  it('bib_number is nullable in the export signature (virtual/no-bib rows)', () => {
    expect(actions).toContain('bib_number: string | null')
  })
})
