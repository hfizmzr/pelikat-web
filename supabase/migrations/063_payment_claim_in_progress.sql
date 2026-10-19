-- ── PAYMENT CLAIM: distinguish in-progress sentinels (063) ────
-- Fix from PR review (web#23, CodeRabbit) on 062's claim_payment_slot:
--
-- The reuse SELECT matched ANY pending row for the logical order —
-- including rows whose provider_request_id is the synthetic sentinel
-- 'pending:<uuid>' from a reservation still in flight or from a
-- crashed claim. A second concurrent claim was therefore handed a
-- FAKE request id: HitPay GET returns 404 → the caller silently
-- proceeds with no checkout_url, and the crashed sentinel stays
-- effectively dead. Age-only TTL reclaim is explicitly NOT used —
-- it cannot distinguish an in-flight reservation from a crash and
-- would race the real second HitPay create.
--
-- Fix: reuse real PR ids only; if a sentinel row exists for the
-- same order, return a tri-state row (in_progress=true) so the
-- caller retries shortly instead of re-creating. No insert, no
-- exception — just the signal.
--
-- PL/pgSQL semantics fix (also corrects 062): return query does
-- NOT exit a PL/pgSQL function — it only appends to the result
-- set. 062's reuse branch fell through into the fresh-insert
-- tail, so every claim on a reclaimable row produced a double
-- result AND a spurious duplicate sentinel row. All decisions are
-- now made into local variables and the function has exactly one
-- return query, at the bottom.
--
-- RECOVERY RUNBOOK (crashed reservation sentinel):
--   A sentinel 'pending:<uuid>' row is NEVER auto-reclaimed; age
--   alone cannot distinguish a crash from an in-flight reservation
--   (auto-reclaim would race a real second HitPay create). To
--   recover a crashed claim, the operator — AFTER confirming no
--   HitPay Payment Request was ever created (sentinel ids never
--   reached HitPay, so dashboard/API lookup of them is impossible,
--   which makes stale sentinels from a create-never-left crash
--   ALWAYS safe to delete once ops confirms) — deletes the
--   'pending:<uuid>' payments row via service-role:
--
--     delete from payments where provider_request_id = 'pending:<uuid>';
--
--   The next claim then inserts a fresh reservation.
--
-- Signature change: adds a third return column in_progress; the
-- existing columns keep their order (provider_request_id first).
-- ALTERING the OUT-parameter row type in place is not permitted by
-- Postgres, so the function is DROPped and CREATEd in the same
-- transaction — atomic, and service_role callers are unaffected.
-- No data is touched.
drop function if exists public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text);

create or replace function public.claim_payment_slot(
  p_order_type text,
  p_registration_id uuid,
  p_merch_order_id uuid,
  p_organizer_id uuid,
  p_runner_id uuid,
  p_amount numeric,
  p_currency text default 'MYR'
) returns table(provider_request_id text, is_reservation boolean, in_progress boolean)
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_existing public.payments;
  v_new      public.payments;
  v_req      text;
  v_isres    boolean;
  v_prog     boolean;
begin
  if p_order_type not in ('registration','merch','organizer_subscription') then
    raise exception 'Invalid order type: %', p_order_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  -- Serialize concurrent claims for the same logical order so the
  -- read-then-insert below can never interleave (A-3). Lock stays
  -- FIRST.
  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(
        concat_ws(':', p_order_type, p_registration_id::text, p_merch_order_id::text, p_organizer_id::text),
        'x'
      ),
      0
    )
  );

  -- Reusable row = a REAL HitPay PR id. The NOT LIKE guard keeps
  -- reservation sentinels ('pending:...') out of the reuse select:
  -- handing a sentinel to the caller as a request id 404s silently
  -- at HitPay (the web#23 CodeRabbit finding). Column is qualified
  -- because the RETURNS TABLE names shadow it inside PL/pgSQL.
  select *
  into v_existing
  from public.payments
  where order_type = p_order_type
    and status = 'pending'
    and payments.provider_request_id not like 'pending:%'
    and (
      (p_registration_id is not null and registration_id = p_registration_id)
      or (p_merch_order_id is not null and merch_order_id = p_merch_order_id)
      or (p_organizer_id is not null and organizer_id = p_organizer_id)
    )
  order by created_at
  limit 1;

  if found then
    -- Reuse: caller GETs the existing REAL PR and reuses its url.
    v_req := v_existing.provider_request_id; v_isres := false; v_prog := false;
  elsif exists (
    select 1
    from public.payments
    where order_type = p_order_type
      and status = 'pending'
      and payments.provider_request_id like 'pending:%'
      and (
        (p_registration_id is not null and registration_id = p_registration_id)
        or (p_merch_order_id is not null and merch_order_id = p_merch_order_id)
        or (p_organizer_id is not null and organizer_id = p_organizer_id)
      )
  ) then
    -- A reservation sentinel already holds this slot (in-flight
    -- claim or crashed claim): do NOT reuse the fake id, do NOT
    -- insert, do NOT raise — hand back the retry signal.
    v_req := null; v_isres := false; v_prog := true;
  else
    -- Fresh claim: synthetic sentinel row (the UNIQUE constraint
    -- keeps guarding real HitPay PR ids assigned by the caller
    -- afterwards).
    v_new.provider_request_id := 'pending:' || gen_random_uuid()::text;

    insert into public.payments (
      order_type, registration_id, merch_order_id, organizer_id, runner_id,
      provider, provider_request_id, amount, currency, status
    ) values (
      p_order_type, p_registration_id, p_merch_order_id, p_organizer_id, p_runner_id,
      'hitpay', v_new.provider_request_id, p_amount, p_currency, 'pending'
    );

    v_req := v_new.provider_request_id; v_isres := true; v_prog := false;
  end if;

  return query select v_req, v_isres, v_prog;
end;
$$;

revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from anon;
revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from authenticated;
grant execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) to service_role;

comment on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text)
  is 'serialized claim-or-reuse of the pending payments row (A-3, since 062). Tri-state since 063: is_reservation=true ⇒ fresh sentinel ''pending:<uuid>'' (caller links the real HitPay PR id on success, deletes the synthetic row on failure); in_progress=true ⇒ reservation already holds the sentinel (caller retries, no new row); both false ⇒ reuse an existing REAL provider_request_id. Sentinels are never TTL-reclaimed — see 063 header runbook. service_role only';
