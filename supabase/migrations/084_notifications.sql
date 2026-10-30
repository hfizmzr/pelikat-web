-- ── NOTIFICATION & ENGAGEMENT (FR-29 … FR-32) ───────────────────
-- One outbox table (`notifications`) is both the runner's in-app inbox
-- and the delivery queue for email (Resend) and Web Push (VAPID).
-- Rows are only ever written by definer functions in this file:
--
--   FR-29  registration confirmed  → trigger on registrations, fires once
--          the registration is paid/waived AND has its BIB (virtual
--          events never get one, so they fire on payment alone). Every
--          confirm path (mock pay, HitPay webhook, complimentary) goes
--          through the same row, so no caller needs to remember to email.
--   FR-30  results published       → trigger on events.results_published
--          false → true, one row per confirmed registrant.
--   FR-31  push                    → push_subscriptions + push_status on
--          each row; the dispatcher fans out to every device of the user.
--   FR-32  organizer broadcast     → send_event_broadcast() RPC.
--
-- Delivery: the `dispatch-notifications` edge function claims pending
-- rows (claim_notification_jobs) and sends them. It is kicked right after
-- each insert statement and swept every minute by pg_cron, via pg_net.
-- Both read the function URL + shared secret from the vault and no-op
-- until they are set:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-notifications',
--                              'notify-dispatch-url', 'dispatch-notifications edge function URL');
--   select vault.create_secret('<same value as the NOTIFY_DISPATCH_SECRET function secret>',
--                              'notify-dispatch-secret', 'shared secret for dispatch-notifications');
--
-- "Confirmed registrant" everywhere below = payment_status in
-- ('paid','waived') — pending checkouts and refunds never get messages.

-- ── TABLES ───────────────────────────────────────────────────────

create table if not exists public.event_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  organizer_id    uuid not null references public.organizers(id) on delete cascade,
  sent_by         uuid references auth.users(id) on delete set null,
  subject         text not null check (char_length(btrim(subject)) between 1 and 120),
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  send_email      boolean not null default true,
  send_push       boolean not null default true,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists event_broadcasts_event_idx
  on public.event_broadcasts (event_id, created_at desc);

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  -- null for complimentary guests without an account: email only
  user_id         uuid references auth.users(id) on delete cascade,
  -- recipient address snapshotted at enqueue time; null = no email channel
  email           text,
  kind            text not null
    check (kind in ('registration_confirmed', 'results_published', 'broadcast', 'test')),
  event_id        uuid references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  broadcast_id    uuid references public.event_broadcasts(id) on delete cascade,
  title           text not null,
  body            text not null,
  -- app-relative path the notification opens
  url             text,
  -- template fields for the email (bib, category, event date, …)
  data            jsonb not null default '{}'::jsonb,
  email_status    text not null default 'skipped'
    check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  push_status     text not null default 'skipped'
    check (push_status in ('pending', 'sent', 'failed', 'skipped', 'no_device')),
  email_error     text,
  push_error      text,
  attempts        integer not null default 0,
  -- dispatcher lease: a claimed row is invisible to other claims for
  -- 5 minutes, which doubles as the retry backoff after a failure
  claimed_at      timestamptz,
  dedupe_key      text unique,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_pending_idx
  on public.notifications (created_at)
  where email_status = 'pending' or push_status = 'pending';
create index if not exists notifications_broadcast_idx
  on public.notifications (broadcast_id) where broadcast_id is not null;

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ── RLS / GRANTS ─────────────────────────────────────────────────
-- Writes go through the definer functions below. The only direct write
-- a user gets is stamping read_at on their own notifications.

alter table public.event_broadcasts enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.event_broadcasts, public.notifications, public.push_subscriptions
  from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.push_subscriptions to authenticated;
grant select on public.event_broadcasts to authenticated;

drop policy if exists "user reads own notifications" on public.notifications;
create policy "user reads own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "user marks own notifications read" on public.notifications;
create policy "user marks own notifications read" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user reads own push subscriptions" on public.push_subscriptions;
create policy "user reads own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "organizer reads own event broadcasts" on public.event_broadcasts;
create policy "organizer reads own event broadcasts" on public.event_broadcasts
  for select to authenticated
  using (organizer_id = public.get_my_organizer_id() or public.is_admin());

-- Live bell badge: runners subscribe to inserts on their own rows (RLS
-- applies to realtime postgres_changes).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ── RECIPIENTS ───────────────────────────────────────────────────
-- Confirmed registrants of an event with their account (if any) and the
-- address to email. Guests (complimentary, no runner profile) are
-- reachable by email only.

create or replace function public.notification_recipients(p_event_id uuid)
returns table (registration_id uuid, user_id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         rp.user_id,
         coalesce(u.email, r.guest_email)::text,
         coalesce(rp.full_name, r.guest_name)
  from public.registrations r
  left join public.runner_profiles rp
    on rp.id = r.runner_id and not coalesce(rp.is_deleted, false)
  left join auth.users u on u.id = rp.user_id
  where r.event_id = p_event_id
    and r.payment_status in ('paid', 'waived')
    and (rp.user_id is not null or (r.runner_id is null and r.guest_email is not null));
$$;

revoke execute on function public.notification_recipients(uuid) from public, anon, authenticated;

-- ── FR-29: REGISTRATION CONFIRMED ────────────────────────────────

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
end;
$$;

revoke execute on function public.notify_registration_confirmed() from public, anon, authenticated;

drop trigger if exists registrations_notify_confirmed on public.registrations;
create trigger registrations_notify_confirmed
  after insert or update of payment_status, bib_number on public.registrations
  for each row execute function public.notify_registration_confirmed();

-- ── FR-30: RESULTS PUBLISHED ─────────────────────────────────────
-- Fires once per event: toggling results off and on again does not
-- re-notify (dedupe key per registration).

create or replace function public.notify_results_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new.results_published, false) or coalesce(old.results_published, false) then
    return null;
  end if;

  insert into public.notifications (
    user_id, email, kind, event_id, registration_id, title, body, url, data,
    email_status, push_status, dedupe_key
  )
  select rcp.user_id,
         rcp.email,
         'results_published',
         new.id,
         rcp.registration_id,
         'Results are out: ' || new.name,
         case when lb.rank is not null
           then 'You placed #' || lb.rank || ' with ' || round(lb.total_km, 2) || ' km. See the full leaderboard.'
           else 'The official results and leaderboard are now live.'
         end,
         case when rcp.user_id is not null
           then '/runner/leaderboard?event_id=' || new.id
           else case when new.slug is not null then '/events/' || new.slug end
         end,
         jsonb_build_object(
           'runner_name', rcp.full_name,
           'event_name', new.name,
           'event_date', new.event_date,
           'event_type', new.event_type,
           'rank', lb.rank,
           'total_km', lb.total_km
         ),
         case when rcp.email is not null then 'pending' else 'skipped' end,
         case when rcp.user_id is not null then 'pending' else 'skipped' end,
         'results_published:' || rcp.registration_id
    from public.notification_recipients(new.id) rcp
    left join public.registrations r on r.id = rcp.registration_id
    left join public.leaderboard_virtual lb
      on lb.event_id = new.id and lb.runner_id = r.runner_id
  on conflict (dedupe_key) do nothing;

  return null;
end;
$$;

revoke execute on function public.notify_results_published() from public, anon, authenticated;

drop trigger if exists events_notify_results_published on public.events;
create trigger events_notify_results_published
  after update of results_published on public.events
  for each row execute function public.notify_results_published();

-- ── FR-32: ORGANIZER BROADCAST ───────────────────────────────────

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

  update public.event_broadcasts b set recipient_count = v_count where b.id = v_id;

  insert into public.audit_log (actor_id, action, target_id, metadata)
  values (auth.uid(), 'broadcast_sent', v_id,
          jsonb_build_object('event_id', p_event_id, 'recipients', v_count,
                             'email', coalesce(p_send_email, false), 'push', coalesce(p_send_push, false)));

  return query select v_id, v_count;
end;
$$;

revoke execute on function public.send_event_broadcast(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.send_event_broadcast(uuid, text, text, boolean, boolean) to authenticated;

-- History + delivery counts for the organizer's message log. Organizers
-- never read notification rows (they carry runner emails) — only counts.
create or replace function public.get_event_broadcasts(p_event_id uuid)
returns table (
  id uuid, subject text, body text, send_email boolean, send_push boolean,
  recipient_count integer, created_at timestamptz, sent_by_email text,
  email_sent bigint, email_failed bigint, email_pending bigint,
  push_sent bigint, push_no_device bigint, read_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.events e
     where e.id = p_event_id
       and (e.organizer_id = public.get_my_organizer_id() or public.is_admin())
  ) then
    raise exception 'Event not found or not yours';
  end if;

  return query
  select b.id, b.subject, b.body, b.send_email, b.send_push, b.recipient_count, b.created_at,
         u.email::text,
         count(*) filter (where n.email_status = 'sent'),
         count(*) filter (where n.email_status = 'failed'),
         count(*) filter (where n.email_status = 'pending'),
         count(*) filter (where n.push_status = 'sent'),
         count(*) filter (where n.push_status = 'no_device'),
         count(*) filter (where n.read_at is not null)
    from public.event_broadcasts b
    left join public.notifications n on n.broadcast_id = b.id
    left join auth.users u on u.id = b.sent_by
   where b.event_id = p_event_id
   group by b.id, u.email
   order by b.created_at desc
   limit 50;
end;
$$;

revoke execute on function public.get_event_broadcasts(uuid) from public, anon;
grant execute on function public.get_event_broadcasts(uuid) to authenticated;

-- ── FR-31: PUSH SUBSCRIPTIONS ────────────────────────────────────
-- A browser endpoint belongs to whoever is signed in on that device, so
-- saving re-points an existing endpoint to the caller. Endpoints are
-- restricted to the browser push services the dispatcher will POST to.

create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_endpoint is null
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
     or char_length(p_endpoint) > 1000 then
    raise exception 'Unsupported push endpoint';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,30}={0,2}$' then
    raise exception 'Invalid push subscription keys';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- "Send me a test" on the runner's notification settings: push + inbox
-- only, at most one per minute.
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (
    select 1 from public.notifications
     where user_id = auth.uid() and kind = 'test' and created_at > now() - interval '1 minute'
  ) then
    raise exception 'A test notification was just sent. Try again in a minute.';
  end if;

  insert into public.notifications (user_id, kind, title, body, url, push_status)
  values (auth.uid(), 'test', 'Notifications are on',
          'This device will get race updates from Pelikat.', '/runner/notifications', 'pending');
end;
$$;

revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;

-- ── DISPATCH ─────────────────────────────────────────────────────

-- Claim up to p_limit deliverable rows for the dispatcher. Rows stay
-- leased for 5 minutes; after 5 attempts the sweep stops picking them up.
create or replace function public.claim_notification_jobs(p_limit integer default 50)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set claimed_at = now(),
         attempts = n.attempts + 1
   where n.id in (
     select q.id
       from public.notifications q
      where (q.email_status = 'pending' or q.push_status = 'pending')
        and q.attempts < 5
        and (q.claimed_at is null or q.claimed_at < now() - interval '5 minutes')
      order by q.created_at
      limit greatest(1, least(coalesce(p_limit, 50), 200))
      for update skip locked
   )
  returning n.*;
$$;

revoke execute on function public.claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;

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
end;
$$;

revoke execute on function public.kick_notification_dispatch() from public, anon, authenticated;

-- Immediate kick: once per INSERT statement, so a 500-runner broadcast
-- is still a single HTTP call. pg_net sends it after commit.
create or replace function public.notifications_after_insert_kick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from new_rows where email_status = 'pending' or push_status = 'pending') then
    perform public.kick_notification_dispatch();
  end if;
  return null;
end;
$$;

revoke execute on function public.notifications_after_insert_kick() from public, anon, authenticated;

drop trigger if exists notifications_kick_dispatch on public.notifications;
create trigger notifications_kick_dispatch
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_after_insert_kick();

-- Minute sweep: retries after the lease expires and anything the kick
-- missed (edge function cold/down). Only calls out when there is work.
create or replace function public.sweep_pending_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notifications
     where (email_status = 'pending' or push_status = 'pending')
       and attempts < 5
       and (claimed_at is null or claimed_at < now() - interval '5 minutes')
  ) then
    perform public.kick_notification_dispatch();
  end if;
end;
$$;

revoke execute on function public.sweep_pending_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notifications-dispatch-sweep') then
    perform cron.unschedule('notifications-dispatch-sweep');
  end if;
  perform cron.schedule(
    'notifications-dispatch-sweep',
    '* * * * *',
    'select public.sweep_pending_notifications()'
  );
end;
$$;

-- ── ROLLBACK REFERENCE ───────────────────────────────────────────
-- select cron.unschedule('notifications-dispatch-sweep');
-- drop trigger if exists registrations_notify_confirmed on public.registrations;
-- drop trigger if exists events_notify_results_published on public.events;
-- drop table if exists public.notifications, public.push_subscriptions, public.event_broadcasts;
-- drop function if exists public.notify_registration_confirmed(), public.notify_results_published(),
--   public.notification_recipients(uuid), public.send_event_broadcast(uuid, text, text, boolean, boolean),
--   public.get_event_broadcasts(uuid), public.save_push_subscription(text, text, text, text),
--   public.delete_push_subscription(text), public.send_test_notification(),
--   public.claim_notification_jobs(integer), public.kick_notification_dispatch(),
--   public.notifications_after_insert_kick(), public.sweep_pending_notifications();
