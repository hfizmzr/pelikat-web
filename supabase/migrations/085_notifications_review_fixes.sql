-- ── NOTIFICATIONS: REVIEW FIXES (PR #39 CodeRabbit) ─────────────
-- 084 is already applied, so the fixes ship as CREATE OR REPLACE here.
-- Bodies are 084's with only the marked changes:
--
--   1. kick_notification_dispatch(): catch errors from the vault/pg_net
--      call. It runs from the notifications AFTER INSERT trigger, so an
--      error there used to abort the enclosing transaction — including a
--      payment confirmation that assigns a BIB. The minute sweep retries.
--   2. notify_registration_confirmed(): same containment for the
--      registrations trigger itself (payment/BIB updates must never fail
--      because a notification couldn't be queued).
--   3. send_event_broadcast(): per-event advisory lock before the
--      one-per-minute guard, so concurrent sends serialize instead of both
--      passing the check; and reject a send that reaches zero recipients.
--
-- ACLs survive CREATE OR REPLACE; they are re-asserted below anyway.

create or replace function public.kick_notification_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify-dispatch-url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify-dispatch-secret' limit 1;

  if coalesce(btrim(v_url), '') = '' or coalesce(v_secret, '') = '' then
    raise notice 'notifications: vault secrets notify-dispatch-url / notify-dispatch-secret not set; not dispatching';
    return;
  end if;

  perform net.http_post(
    url => btrim(v_url),
    body => '{}'::jsonb,
    headers => jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds => 5000
  );
exception when others then
  -- Called from the notifications insert trigger, i.e. inside payment and
  -- broadcast transactions: log and let the minute sweep retry instead of
  -- failing the caller.
  raise warning 'notifications: dispatch kick failed: %', sqlerrm;
end;
$$;

create or replace function public.notify_registration_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_cat_name text;
  v_user uuid;
  v_email text;
  v_name text;
  v_title text;
  v_body text;
begin
  if new.payment_status not in ('paid', 'waived') then
    return null;
  end if;

  select e.id, e.name, e.event_date, e.location, e.event_type, e.slug
    into v_event
    from public.events e where e.id = new.event_id;

  -- Physical events: wait for the BIB (payment-first BIB can land in a
  -- later UPDATE than the payment flag).
  if v_event.event_type <> 'virtual' and new.bib_number is null then
    return null;
  end if;

  if new.runner_id is not null then
    select rp.user_id, u.email, rp.full_name
      into v_user, v_email, v_name
      from public.runner_profiles rp
      left join auth.users u on u.id = rp.user_id
     where rp.id = new.runner_id and not coalesce(rp.is_deleted, false);
    if v_user is null then
      return null;
    end if;
  else
    v_email := new.guest_email;
    v_name := new.guest_name;
    if v_email is null then
      return null;
    end if;
  end if;

  select name into v_cat_name from public.race_categories where id = new.category_id;

  v_title := 'You''re in: ' || v_event.name;
  v_body := case
    when new.bib_number is not null then 'Your BIB number is ' || new.bib_number || coalesce(' · ' || v_cat_name, '')
    else 'Registration confirmed' || coalesce(' · ' || v_cat_name, '')
  end;

  insert into public.notifications (
    user_id, email, kind, event_id, registration_id, title, body, url, data,
    email_status, push_status, dedupe_key
  ) values (
    v_user, v_email, 'registration_confirmed', new.event_id, new.id, v_title, v_body,
    case
      when v_user is null then case when v_event.slug is not null then '/events/' || v_event.slug end
      when v_event.event_type = 'virtual' then '/runner/events/' || new.event_id
      else '/runner/events/' || new.event_id || '/bib'
    end,
    jsonb_build_object(
      'runner_name', v_name,
      'event_name', v_event.name,
      'event_date', v_event.event_date,
      'location', v_event.location,
      'event_type', v_event.event_type,
      'category_name', v_cat_name,
      'bib_number', new.bib_number,
      'registration_role', new.registration_role
    ),
    case when v_email is not null then 'pending' else 'skipped' end,
    case when v_user is not null then 'pending' else 'skipped' end,
    'registration_confirmed:' || new.id
  )
  on conflict (dedupe_key) do nothing;

  return null;
exception when others then
  -- Runs inside the payment/BIB transaction: a notification problem must
  -- never roll back the confirmation itself.
  raise warning 'notify_registration_confirmed(%): %', new.id, sqlerrm;
  return null;
end;
$$;

create or replace function public.send_event_broadcast(
  p_event_id   uuid,
  p_subject    text,
  p_body       text,
  p_send_email boolean default true,
  p_send_push  boolean default true
) returns table (broadcast_id uuid, recipient_count integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid := public.get_my_organizer_id();
  v_event record;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_count integer;
begin
  select e.id, e.name, e.organizer_id into v_event
    from public.events e where e.id = p_event_id;

  if not found or v_org is null or v_event.organizer_id <> v_org then
    raise exception 'Event not found or not yours';
  end if;
  if char_length(v_subject) not between 1 and 120 then
    raise exception 'Subject must be 1-120 characters';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Message must be 1-2000 characters';
  end if;

  -- Serialize per event so two near-simultaneous sends can't both pass
  -- the guard below (released at commit).
  perform pg_advisory_xact_lock(hashtextextended('event_broadcast:' || p_event_id::text, 0));

  -- Double-click / spam guard
  if exists (
    select 1 from public.event_broadcasts b
     where b.event_id = p_event_id and b.created_at > now() - interval '1 minute'
  ) then
    raise exception 'A broadcast was just sent for this event. Please wait a minute before sending another.';
  end if;

  insert into public.event_broadcasts (event_id, organizer_id, sent_by, subject, body, send_email, send_push)
  values (p_event_id, v_org, auth.uid(), v_subject, v_body, coalesce(p_send_email, false), coalesce(p_send_push, false))
  returning id into v_id;

  -- In-app inbox always; email/push per the organizer's choice.
  insert into public.notifications (
    user_id, email, kind, event_id, registration_id, broadcast_id, title, body, url, data,
    email_status, push_status, dedupe_key
  )
  select rcp.user_id,
         rcp.email,
         'broadcast',
         p_event_id,
         rcp.registration_id,
         v_id,
         v_subject,
         v_body,
         case when rcp.user_id is not null then '/runner/events/' || p_event_id end,
         jsonb_build_object('runner_name', rcp.full_name, 'event_name', v_event.name),
         case when coalesce(p_send_email, false) and rcp.email is not null then 'pending' else 'skipped' end,
         case when coalesce(p_send_push, false) and rcp.user_id is not null then 'pending' else 'skipped' end,
         'broadcast:' || v_id || ':' || rcp.registration_id
    from public.notification_recipients(p_event_id) rcp
   -- guests only have the email channel
   where rcp.user_id is not null or coalesce(p_send_email, false)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;

  -- e.g. Email off and every registrant is an email-only guest: fail (and
  -- roll back the broadcast row) instead of logging a send that reached nobody.
  if v_count = 0 then
    raise exception 'No runners can receive this message on the selected channels';
  end if;

  update public.event_broadcasts b set recipient_count = v_count where b.id = v_id;

  insert into public.audit_log (actor_id, action, target_id, metadata)
  values (auth.uid(), 'broadcast_sent', v_id,
          jsonb_build_object('event_id', p_event_id, 'recipients', v_count,
                             'email', coalesce(p_send_email, false), 'push', coalesce(p_send_push, false)));

  return query select v_id, v_count;
end;
$$;

revoke execute on function public.notify_registration_confirmed() from public, anon, authenticated;
revoke execute on function public.kick_notification_dispatch() from public, anon, authenticated;
revoke execute on function public.send_event_broadcast(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.send_event_broadcast(uuid, text, text, boolean, boolean) to authenticated;

-- ── ROLLBACK REFERENCE ───────────────────────────────────────────
-- Re-run the three function definitions from 084_notifications.sql.
