-- ============================================================================
-- Move one event (and everything tied to it) to another organizer.
-- Testing helper; run in the Supabase SQL editor or with execute_sql.
--
-- Default: "kl run" from Org A (friend's account) → Org Example
-- (abu@organizer.com, the shared test organizer), so both of us can test its
-- merch and REPC flow from one account.
--
-- TO MOVE IT BACK: swap v_from and v_to and run again.
--
-- Updates organizer_id on: events, race_categories, registrations,
-- event_shirt_inventory, merch_products, merch_orders, repc_collections,
-- photo_tags, and repc_consent_codes (via the event's registrations).
-- Only rows for this event are touched, and only if they currently belong
-- to v_from. Prints a row count per table.
--
-- Not moved: merch images already uploaded to storage stay in the old
-- organizer's folder ({organizer_id}/{event_id}/…). They still display, but
-- the new owner can't replace or delete them.
-- ============================================================================

do $$
declare
  v_event uuid := '29eab7c4-ee02-4ae2-97f1-445bbc4e3979'; -- "kl run"
  v_from  uuid := '50e7d6cd-9e04-4fec-803c-55968a23fbf7'; -- Org A
  v_to    uuid := '4994d419-5b4a-4149-b89b-c4191dd30583'; -- Org Example (abu@organizer.com)
  v_n int;
  v_log text := '';
begin
  if not exists (select 1 from public.events where id = v_event and organizer_id = v_from) then
    raise exception 'Event % does not belong to organizer % — nothing moved', v_event, v_from;
  end if;
  if not exists (select 1 from public.organizers where id = v_to) then
    raise exception 'Target organizer % not found', v_to;
  end if;

  update public.events set organizer_id = v_to where id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' events=%s', v_n);

  update public.race_categories set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' race_categories=%s', v_n);

  update public.registrations set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' registrations=%s', v_n);

  update public.event_shirt_inventory set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' event_shirt_inventory=%s', v_n);

  update public.merch_products set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' merch_products=%s', v_n);

  update public.merch_orders set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' merch_orders=%s', v_n);

  update public.repc_collections set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' repc_collections=%s', v_n);

  update public.photo_tags set organizer_id = v_to where event_id = v_event and organizer_id = v_from;
  get diagnostics v_n = row_count; v_log := v_log || format(' photo_tags=%s', v_n);

  update public.repc_consent_codes set organizer_id = v_to
  where organizer_id = v_from
    and registration_id in (select id from public.registrations where event_id = v_event);
  get diagnostics v_n = row_count; v_log := v_log || format(' repc_consent_codes=%s', v_n);

  raise notice 'Moved event % from % to %:%', v_event, v_from, v_to, v_log;
end $$;

-- Check: every row for the event should now show the new organizer only
select 'events' t, organizer_id, count(*) from public.events where id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979' group by 2
union all select 'registrations', organizer_id, count(*) from public.registrations where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979' group by 2
union all select 'merch_products', organizer_id, count(*) from public.merch_products where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979' group by 2
union all select 'merch_orders', organizer_id, count(*) from public.merch_orders where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979' group by 2;
