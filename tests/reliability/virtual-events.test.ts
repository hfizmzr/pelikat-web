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

  it('allocate_bib is internal-only (ACL hygiene)', () => {
    expect(migration).toContain(
      'revoke execute on function public.allocate_bib(uuid) from public, anon, authenticated'
    )
    expect(migration).toContain('grant execute on function public.allocate_bib(uuid) to service_role')
  })

  it('create wizard collects + persists target_distance_km for virtual events', () => {
    for (const page of ['src/app/organizer/events/new/page.tsx', 'src/app/organizer/mobile/events/new/page.tsx']) {
      const createPage = read(...page.split('/'))
      // Required numeric input, shown only for virtual.
      expect(createPage).toContain("formData.event_type === 'virtual' && (")
      expect(createPage).toContain('Target Distance (KM)')
      expect(createPage).toContain('min="0.1"')
      // Server-side validation + INSERT persistence.
      expect(createPage).toContain('Target distance is required for virtual runs')
      expect(createPage).toContain("target_distance_km: formData.event_type === 'virtual' ? Number(formData.target_km) : null")
    }
  })

  it('log_run grew an additive p_event_id param with a confirmed-registration guard (068)', () => {
    const logRun = read('supabase', 'migrations', '068_log_run_event_id.sql')
    // Hygiene: the stale 3-arg overload is dropped before the replace.
    expect(logRun).toContain('drop function if exists public.log_run(numeric, integer, jsonb);')
    // Backward-compatible: trailing DEFAULT NULL param, same returns.
    expect(logRun).toContain('p_event_id uuid default null')
    expect(logRun).toContain('returns public.run_logs')
    expect(logRun).toContain('set search_path = \'\'')
    // Event-linked runs require a confirmed registration (paid|waived).
    expect(logRun).toContain("r.payment_status in ('paid', 'waived')")
    expect(logRun).toContain("raise exception 'No confirmed registration for this event'")
    // Stores event_id only via the provided param.
    expect(logRun).toContain('p_event_id,')
  })

  it('run-log event param flow: CTA carries ?event=, page passes p_event_id, shows linked context', () => {
    const runLogPage = read('src', 'app', 'runner', 'run-log', 'page.tsx')
    expect(runLogPage).toContain("new URLSearchParams(window.location.search).get('event')")
    expect(runLogPage).toContain('p_event_id: linkedEventId')
    expect(runLogPage).toContain('linked event progress')
    // GPS flow propagates the event param too (tracker link + tracker's
    // redirect/exit funnel through the run-log page's ?event= read).
    expect(runLogPage).toContain('`/runner/run-log/track?event=${linkedEventId}`')
    const tracker = read('src', 'components', 'gamification', 'runner-tracker.tsx')
    expect(tracker).toContain("new URLSearchParams(window.location.search).get('event')")
    expect(tracker).toContain('window.location.href = runLogHref')
    expect(tracker).toContain('href={runLogHref}')
    const eventPage = read('src', 'app', 'runner', 'events', '[id]', 'page.tsx')
    expect(eventPage).toContain('href={`/runner/run-log?event=${event.id}`}')
  })

  it('PL/pgSQL bodies use -- comments only (no // lines)', () => {
    expect(migration).not.toMatch(/^\s*\/\//m)
  })

  it('both allocate_bib and confirm_dummy_payment strip bib_prefix before digit parse', () => {
    // Prefix "21K" + BIB "21K0001" must parse as 1, not 210001 (which
    // would false-trigger 'Category is full' and leave guests bib-less).
    expect(migration).toContain(
      "nullif(regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\\D', '', 'g'), '')::int"
    )
    expect(migration).not.toContain("regexp_replace(bib_number")
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
    // Guard covers BOTH branches: paid AND waived are confirmed and the
    // mock flow must never overwrite a waived registration to 'paid'.
    expect(confirmFn).toContain("if v_reg.payment_status in ('paid','waived') then")
    expect(confirmFn).not.toContain("if v_reg.payment_status = 'paid' then")
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
    // Log a Run CTA for virtual.
    expect(runnerDetail).toContain("href={`/runner/run-log?event=${event.id}`}")
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

describe('Reliability: Virtual certificate authorization', () => {
  // Slice the virtual cert function (last export in cert.ts).
  const certTs = read('src', 'lib', 'actions', 'cert.ts')
  const virtualFn = certTs.slice(certTs.indexOf('generateVirtualEventCertificate'))

  it('generateVirtualEventCertificate requires a CONFIRMED registration owned by the caller (CWE-862)', () => {
    // Pending-payment runners must not mint an e-cert by logging distance.
    expect(virtualFn).toContain('.eq(\'runner_id\', profile.id)')
    expect(virtualFn).toContain('isConfirmedStatus(reg.payment_status)')
    expect(virtualFn).toContain('You need a confirmed registration for this event')
    expect(certTs).toContain("from '@/lib/registration-status'")
  })

  it('physical badge path stays gated by owner-only runner_badges RLS (earned row required)', () => {
    const badgeFn = certTs.slice(certTs.indexOf('generateBadgeCertificate'), certTs.indexOf('generateVirtualEventCertificate'))
    // The badge itself is earned state; no run_logs-computed completion here.
    expect(badgeFn).toContain("from('runner_badges')")
    expect(badgeFn).toContain("it hasn't been earned yet")
  })
})
