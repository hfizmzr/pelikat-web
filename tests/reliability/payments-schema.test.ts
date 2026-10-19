import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Resolve paths relative to this test file, not process.cwd() — CI and
// watchers run vitest from different working directories.
const here = dirname(fileURLToPath(import.meta.url))
const read = (...parts: string[]) =>
  readFileSync(join(here, '..', '..', ...parts), 'utf-8')

const migration = read('supabase', 'migrations', '059_hitpay_payments.sql')

describe('Reliability: HitPay Payments Schema (Task 1)', () => {
  it('payments table has unique provider_request_id and exact CHECK constraints', () => {
    expect(migration).toContain('provider_request_id  text not null unique')
    expect(migration).toContain(
      "check (order_type in ('registration','merch','organizer_subscription'))"
    )
    expect(migration).toContain(
      "check (status in ('pending','completed','failed','expired','canceled','refunded','partially_refunded'))"
    )
  })

  it('webhook_events table has unique payload_hash (webhook dedupe anchor)', () => {
    expect(migration).toContain('payload_hash  text not null unique')
  })

  it('both FKs to registration/merch order use ON DELETE SET NULL', () => {
    expect(migration).toContain(
      'registration_id      uuid references registrations(id) on delete set null'
    )
    expect(migration).toContain(
      'merch_order_id       uuid references merch_orders(id) on delete set null'
    )
  })

  it('required indexes exist (registration lookup, pending scan, webhook time)', () => {
    expect(migration).toContain(
      'create index payments_registration_id_idx on payments (registration_id)'
    )
    expect(migration).toContain(
      'create index payments_pending_status_idx on payments (status) where status = \'pending\''
    )
    expect(migration).toContain(
      'create index webhook_events_received_at_idx on webhook_events (received_at)'
    )
  })

  it('confirm_payment RPC is locked down to service_role only', () => {
    expect(migration).toContain(
      'create or replace function public.confirm_payment(\n  p_provider_request_id text,\n  p_provider_payment_id text,\n  p_rail text\n) returns uuid'
    )
    expect(migration).toContain(
      'revoke execute on function public.confirm_payment(text, text, text) from public'
    )
    expect(migration).toContain(
      'revoke execute on function public.confirm_payment(text, text, text) from anon'
    )
    expect(migration).toContain(
      'revoke execute on function public.confirm_payment(text, text, text) from authenticated'
    )
    expect(migration).toContain(
      'grant execute on function public.confirm_payment(text, text, text) to service_role'
    )
  })

  it('confirm_payment is security definer with empty search_path', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
  })

  it('RLS is enabled AND forced on both new tables', () => {
    expect(migration).toContain('alter table payments enable row level security')
    expect(migration).toContain('alter table payments force row level security')
    expect(migration).toContain('alter table webhook_events enable row level security')
    expect(migration).toContain('alter table webhook_events force row level security')
  })

  it('read policies use the existing RLS helpers, no public write policies', () => {
    expect(migration).toContain('runner_id = my_runner_id()')
    expect(migration).toContain('organizer_id = get_my_organizer_id()')
    expect(migration).toContain('for all using (is_admin())')
    // Writes come from Django service-role only — no insert/delete policies.
    expect(migration).not.toMatch(/create policy.*for insert/i)
    expect(migration).not.toMatch(/create policy.*for delete/i)
  })

  it('registration confirmation reuses the 056/057 BIB logic (prefix strip + retry)', () => {
    expect(migration).toContain("regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\\D', '', 'g')")
    expect(migration).toContain('for v_attempt in 1..3 loop')
    expect(migration).toContain("payment_status = 'paid'")
    expect(migration).toContain("'payment_confirmed'")
  })

  it('organizer subscription extends sub_expires_at by one year', () => {
    expect(migration).toContain("sub_expires_at = greatest(coalesce(sub_expires_at, now()), now()) + interval '1 year'")
    expect(migration).toContain("'organizer_subscription_payment'")
  })
})

describe('Reliability: Payment Write Lockdown (Task: migration 060)', () => {
  const lockdown = read('supabase', 'migrations', '060_payment_write_lockdown.sql')

  it('confirm_dummy_payment (035 signature: uuid) is revoked from public/anon/authenticated', () => {
    expect(lockdown).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from public')
    expect(lockdown).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from anon')
    expect(lockdown).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from authenticated')
  })

  it('confirm_dummy_payment is granted to service_role only', () => {
    expect(lockdown).toContain('grant execute on function public.confirm_dummy_payment(uuid) to service_role')
    expect(lockdown).toMatch(/grant execute on function public\.confirm_dummy_payment\(uuid\) to service_role;$/m)
  })

  it('drops the 059 organizer-UPDATE policy on payments (financial rows are service-role write-only)', () => {
    expect(lockdown).toContain('drop policy if exists "organizer updates own payments" on public.payments')
  })

  it('documents the lockdown on the function (comment trail)', () => {
    expect(lockdown).toContain(
      "is 'mock-mode payment confirm; service_role only since 060'"
    )
  })
})

describe('Reliability: confirm_dummy_payment server-trust revision (migration 061)', () => {
  const migration061 = read('supabase', 'migrations', '061_confirm_dummy_payment_server_trust.sql')

  it('exists and replaces the 056 function body (create or replace, same 035 signature)', () => {
    expect(migration061).toContain('create or replace function public.confirm_dummy_payment(\n p_registration_id uuid'.replace(' p_registration_id', '  p_registration_id'))
    expect(migration061).toContain('returns boolean')
  })

  it('is security definer with empty search_path (byte-equivalent to 056 preamble)', () => {
    expect(migration061).toMatch(/security\s+definer/i)
    expect(migration061).toMatch(/set\s+search_path\s*=\s*''/)
  })

  it('does NOT check auth.uid() for ownership in the function body (app-side ownership)', () => {
    // Extract the function body only ($$ .. $$), so ACL/header prose may mention auth.uid().
    const body = migration061.split('$$')[1]
    expect(body).not.toMatch(/auth\.uid\(\)/)
    expect(body).not.toMatch(/runner_profiles/)
    expect(body).not.toMatch(/runner_id\s+=\s+v_runner_id/)
  })

  it('retains row-lock, prefix-strip parse and 3-attempt retry markers from 056', () => {
    expect(migration061).toContain('for update')
    expect(migration061).toContain("regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\\D', '', 'g')")
    expect(migration061).toContain('for v_attempt in 1..3 loop')
    expect(migration061).toContain("payment_status = 'paid'")
    expect(migration061).toContain("'payment_confirmed'")
    expect(migration061).toMatch(/jsonb_build_object\(\s*'event_id',\s*v_reg\.event_id,\s*'bib_number',\s*v_bib\s*\)/)
  })

  it('re-asserts the 060 ACL contract (revoke public/anon/authenticated, grant service_role)', () => {
    expect(migration061).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from public')
    expect(migration061).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from anon')
    expect(migration061).toContain('revoke execute on function public.confirm_dummy_payment(uuid) from authenticated')
    expect(migration061).toMatch(/grant execute on function public\.confirm_dummy_payment\(uuid\) to service_role/)
  })

  it('documents the trust change on the function comment', () => {
    expect(migration061).toContain(
      "is 'mock-mode confirm; ownership enforced app-side; no auth.uid() check since 061 (service_role callers only)'"
    )
  })

  it('header explains WHY ownership moved app-side (mock-only + caller-JWT pre-verify)', () => {
    expect(migration061).toMatch(/PAYMENT_PROVIDER\s*=\s*'mock'/)
    expect(migration061).toMatch(/server action/i)
  })
})

describe('Reliability: double-charge + refund hardening (migration 062)', () => {
  const migration062 = read('supabase', 'migrations', '062_payment_double_charge_and_refund_hardening.sql')

  it('adds the cumulative refunded_amount counter (A-4)', () => {
    expect(migration062).toContain(
      'add column if not exists refunded_amount numeric(10,2) not null default 0'
    )
  })

  it('amends confirm_payment (same 059 signature) with the duplicate-charge branch (W-3)', () => {
    expect(migration062).toContain(
      'create or replace function public.confirm_payment(\n  p_provider_request_id text,\n  p_provider_payment_id text,\n  p_rail text\n) returns uuid'
    )
    expect(migration062).toContain("'payment_duplicate_detected'")
  })

  it('duplicate branch audits full metadata to identify + refund the duplicate', () => {
    const body = migration062.split('$$')[1]?.split('$$')[0] ?? ''
    // body = first $$ block (confirm_payment)
    expect(body).toContain("jsonb_build_object(\n          'registration_id', v_reg.id")
    expect(body).toContain("'provider_request_id', v_payment.provider_request_id")
    expect(body).toContain("'provider_payment_id', coalesce(p_provider_payment_id, v_payment.provider_payment_id)")
    expect(body).toContain("'amount', v_payment.amount")
  })

  it('duplicate branch keeps truth (second charge completes) and does NOT touch registrations/BIB', () => {
    const body = migration062.split('$$')[1]?.split('$$')[0] ?? ''
    // The UPDATE to completed happens BEFORE the already-paid branch.
    expect(body.indexOf('set status = \'completed\'')).toBeLessThan(body.indexOf("payment_status = 'paid'"))
    // Only the first-charge (else) path allocates a BIB.
    expect(body).toContain('else')
    expect(body).toContain('for v_attempt in 1..3 loop')
    // confirm_dummy_payment (061) is NOT touched by 062.
    expect(migration062).not.toContain('create or replace function public.confirm_dummy_payment')
  })

  it('claim_payment_slot exists with the exact coordinated signature + service_role-only grants (A-3)', () => {
    expect(migration062).toContain(
      'create or replace function public.claim_payment_slot(\n  p_order_type text,\n  p_registration_id uuid,\n  p_merch_order_id uuid,\n  p_organizer_id uuid,\n  p_runner_id uuid,\n  p_amount numeric,\n  p_currency text default \'MYR\'\n) returns table(provider_request_id text, is_reservation boolean)'
    )
    expect(migration062).toContain(
      'revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from public'
    )
    expect(migration062).toContain(
      'revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from anon'
    )
    expect(migration062).toContain(
      'revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from authenticated'
    )
    expect(migration062).toContain(
      'grant execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) to service_role'
    )
  })

  it('claim is serialized by a transaction-scoped advisory lock and uses the documented sentinel', () => {
    expect(migration062).toContain('pg_advisory_xact_lock(')
    expect(migration062).toContain('hashtextextended(')
    expect(migration062).toContain("'pending:' || gen_random_uuid()::text")
  })

  it('documents the claim → hitpay create → link/delete usage sequence', () => {
    expect(migration062).toContain('is_reservation = false')
    expect(migration062).toContain('is_reservation = true')
    expect(migration062).toMatch(/GET the PR/i)
    expect(migration062).toMatch(/DELETE the synthetic row/i)
  })
})
