-- ============================================================================
-- 055 — Merch: allow undoing "collected"
--
-- Adds collected → ready to merch_update_order_status() so an organizer can fix
-- an order marked collected by mistake. Undoing clears collected_at and keeps
-- the original ready_at. Everything else is unchanged from 054.
-- ============================================================================

-- Organizer-driven transitions (payment confirmation is the payment gateway's job):
--   confirmed → ready       mark fulfilled / ready for collection
--   ready     → collected   picked up at REPC
--   ready     → confirmed   undo "ready"
--   collected → ready       undo "collected"
--   pending | confirmed | ready → cancelled   (confirmed/ready restock their variants)
-- Orders that are not in a valid source state are skipped. Returns the number updated.
create or replace function public.merch_update_order_status(
  p_order_ids uuid[],
  p_status text
)
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_organizer_id uuid := public.get_my_organizer_id();
  v_from text[];
  v_updated uuid[];
  v_restock uuid[];
begin
  if v_organizer_id is null then
    raise exception 'Only organizers can update merch orders';
  end if;

  v_from := case p_status
    when 'ready'     then array['confirmed', 'collected']
    when 'collected' then array['ready']
    when 'confirmed' then array['ready']
    when 'cancelled' then array['pending', 'confirmed', 'ready']
    else null
  end;

  if v_from is null then
    raise exception 'Unsupported status: %', p_status;
  end if;

  -- Lock the target orders so concurrent updates cannot double-restock
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(id) filter (where status in ('confirmed', 'ready')), '{}')
  into v_updated, v_restock
  from (
    select id, status
    from public.merch_orders
    where id = any(p_order_ids)
      and organizer_id = v_organizer_id
      and status = any(v_from)
    for update
  ) o;

  if cardinality(v_updated) = 0 then
    return 0;
  end if;

  -- In SET expressions "status" is the row's previous status
  update public.merch_orders
  set status       = p_status,
      ready_at     = case
                       when p_status = 'ready' and status = 'confirmed' then now()
                       when p_status = 'confirmed' then null
                       else ready_at
                     end,
      collected_at = case
                       when p_status = 'collected' then now()
                       when p_status = 'ready' then null
                       else collected_at
                     end,
      updated_at   = now()
  where id = any(v_updated);

  if p_status = 'cancelled' and cardinality(v_restock) > 0 then
    update public.merch_variants v
    set stock = v.stock + r.qty
    from (
      select variant_id, sum(quantity)::int as qty
      from public.merch_order_items
      where order_id = any(v_restock)
      group by variant_id
    ) r
    where v.id = r.variant_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, action, metadata)
  select auth.uid(), u.email, 'merch.order_status',
         jsonb_build_object('status', p_status, 'order_ids', to_jsonb(v_updated))
  from (select 1) s
  left join auth.users u on u.id = auth.uid();

  return cardinality(v_updated);
end;
$$;

revoke all on function public.merch_update_order_status(uuid[], text) from public, anon;
grant execute on function public.merch_update_order_status(uuid[], text) to authenticated;
