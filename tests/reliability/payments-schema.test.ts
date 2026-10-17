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
