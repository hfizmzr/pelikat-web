import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Resolve paths relative to this test file, not process.cwd() — CI and
// watchers run vitest from different working directories.
const here = dirname(fileURLToPath(import.meta.url))
const read = (...parts: string[]) =>
  readFileSync(join(here, '..', '..', ...parts), 'utf-8')

const migration = read('supabase', 'migrations', '067_virtual_events.sql')
const runnerDetail = read('src', 'app', 'runner', 'events', '[id]', 'page.tsx')
const paymentPage = read('src', 'app', 'runner', 'events', '[id]', 'payment', 'page.tsx')
const checkoutStates = read('src', 'components', 'payments', 'checkout-states.tsx')

// Slice the confirm_dummy_payment BODY out of the migration (function
// start → its closing $$;), excluding the trailing ACLs + comment block.
const confirmFnStart = migration.indexOf('create or replace function public.confirm_dummy_payment')
const confirmFn = migration.slice(confirmFnStart, migration.indexOf('$$;', confirmFnStart) + 3)

describe('Reliability: Virtual Events Schema (067)', () => {
  it('events carry event_type (physical|virtual) and target_distance_km', () => {
    expect(migration).toContain(
      "check (event_type in ('physical','virtual'))"
    )
    expect(migration).toContain('add column if not exists target_distance_km numeric(6,2)')
  })

  it('allocate_bib is a no-op for virtual events (no physical bib)', () => {
    expect(migration).toContain("if v_event_type = 'virtual' then")
    expect(migration).toContain('return null;')
  })

  it('confirm_dummy_payment keeps NO inline auth.uid() ownership check', () => {
    // Ownership moved app-side (src/lib/actions/payments.ts) when main
    // switched to service-role-only execution; the merged body must not
    // reintroduce the pre-HitPay ownership filter.
    expect(confirmFn).not.toContain('auth.uid()')
    expect(confirmFn).not.toContain('runner_id = v_runner_id')
    expect(confirmFn).not.toContain('Runner profile not found')
  })

  it('confirm_dummy_payment stays service-role-only with the 060 contract', () => {
    expect(confirmFn).toContain('security definer')
    expect(confirmFn).toContain("set search_path = ''")
    expect(migration).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from authenticated')
    expect(migration).toContain('grant execute on function public.confirm_dummy_payment(uuid) to service_role')
  })

  it('virtual branch marks paid and audits payment_confirmed with no bib', () => {
    expect(confirmFn).toContain("if v_event_type = 'virtual' then")
    expect(confirmFn).toContain("'bib_number', null")
    // The virtual audit writes a NULL actor, matching main's
    // server-trust contract (service_role JWTs carry no sub).
    expect(confirmFn).toContain('values (\n      null,')
  })

  it('physical path is main\'s newest body: prefix-strip digit parse + 3-attempt retry', () => {
    expect(confirmFn).toContain(
      "nullif(regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\\D', '', 'g'), '')::int"
    )
    expect(confirmFn).toContain('for v_attempt in 1..3 loop')
    expect(confirmFn).toContain('payment_status = \'paid\'')
  })
})

describe('Reliability: Virtual runner UI', () => {
  it('event detail gates virtual-only UI behind isVirtual and hides physical BIB paths', () => {
    expect(runnerDetail).toContain("const isVirtual = (event.event_type as string | null) === 'virtual'")
    // BIB pass link and gallery hidden for virtual events.
    expect(runnerDetail).toContain('{!isVirtual && (')
    // Progress bar toward target distance.
    expect(runnerDetail).toContain('loggedKm')
    expect(runnerDetail).toContain('targetKm')
    // Certificate CTA appears when target is reached; Log a Run CTA for virtual.
    expect(runnerDetail).toContain('isVirtual && targetKm > 0 && loggedKm >= targetKm')
    expect(runnerDetail).toContain("href=\"/runner/run-log\"")
    expect(runnerDetail).toContain('VirtualCertificateButton')
  })

  it('payment success CTA: virtual → back to event, physical → digital BIB', () => {
    expect(checkoutStates).toContain('eventType')
    expect(checkoutStates).toContain("const isVirtual = eventType === 'virtual'")
    // Virtual branch: single primary CTA back to the event page.
    expect(checkoutStates).toContain('isVirtual ? (')
    // Physical branch keeps main's View Digital BIB + Back to Event pair.
    expect(checkoutStates).toContain('View Digital BIB')
  })

  it('payment page threads event_type into ConfirmedState for both checkout paths', () => {
    expect(paymentPage).toContain('eventType={registration.events?.event_type}')
    // The page fetches events stacked so event_type is present.
    expect(paymentPage).toContain("select('*, events(*), race_categories(*)')")
  })
})
