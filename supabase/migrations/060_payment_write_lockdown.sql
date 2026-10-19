-- ── PAYMENT WRITE LOCKDOWN ───────────────────────────────────
-- Security fix found in @reviewer's web audit of 059:
--
-- 1. migration 035's confirm_dummy_payment(uuid) check constraint-free
--    RPC kept its default PUBLIC EXECUTE grant — combined with an
--    unguarded server action, this was a free-payment path. Lock it to
--    service_role: the (refactored) server action calls the RPC with
--    the service-role client, and a strict provider guard decides
--    whether the dummy flow is even allowed.
--
-- 2. 059 shipped an "organizer updates own payments" UPDATE policy on
--    payments (its header comment even claims no UPDATE policies
--    exist). Organizers must never mutate financial rows — all writes
--    are Django service-role only, which bypasses RLS.

-- 1. confirm_dummy_payment: service_role only (signature from 035).
revoke execute on function public.confirm_dummy_payment(uuid) from public;
revoke execute on function public.confirm_dummy_payment(uuid) from anon;
revoke execute on function public.confirm_dummy_payment(uuid) from authenticated;
grant execute on function public.confirm_dummy_payment(uuid) to service_role;

comment on function public.confirm_dummy_payment(uuid)
  is 'mock-mode payment confirm; service_role only since 060';

-- 2. Drop the organizer UPDATE policy (exact name from 059).
drop policy if exists "organizer updates own payments" on public.payments;
