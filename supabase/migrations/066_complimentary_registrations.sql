-- ── COMPLIMENTARY REGISTRATIONS (PACERS / VIP GUESTS) ─────────
-- Organizers can add invited guests (VIP / official pacers) who bypass
-- payment entirely. Guests may not have accounts yet: the row stores
-- guest_* contact data with runner_id NULL, and a trigger backfills
-- runner_id on the first runner_profiles insert matching guest_email
-- (auto-claim), so the guest's dashboard picks up the event + E-Bib.

alter table registrations
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists registration_role text not null default 'runner'
    check (registration_role in ('runner','pacer','vip'));

alter table registrations
  drop constraint if exists registrations_payment_status_check;
alter table registrations
  add constraint registrations_payment_status_check
  check (payment_status in ('pending', 'paid', 'refunded', 'waived'));

-- One guest row per event per email (unclaimed rows only)
create unique index if not exists registrations_guest_email_unique
  on registrations (event_id, lower(guest_email))
  where runner_id is null;

-- ── AUTO-CLAIM: link unclaimed guest rows when profile is created ──
create or replace function public.claim_guest_registrations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_email text;
begin
  select email into v_user_email
  from auth.users
  where id = new.user_id;

  if v_user_email is null then
    return new;
  end if;

  update public.registrations
  set runner_id = new.id
  where runner_id is null
    and lower(coalesce(guest_email, '')) = lower(v_user_email)
    and event_id not in (
      select event_id from public.registrations
      where runner_id = new.id
    );

  return new;
end;
$$;

drop trigger if exists claim_guest_registrations on public.runner_profiles;
create trigger claim_guest_registrations
  after insert on public.runner_profiles
  for each row execute function public.claim_guest_registrations();

-- ── BIB ALLOCATION (shared helper) ────────────────────────────
-- Mirrors the confirm_dummy_payment allocation logic: sequential per
-- (event_id, category), silent 3-attempt retry on concurrent
-- (event_id, bib_number) collisions. Allocates when bib_number is
-- still NULL and the category has room.
create or replace function public.allocate_bib(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg record;
  v_cat record;
  v_last_number int;
  v_next_number int;
  v_width int;
  v_bib text;
  v_attempt int;
begin
  select * into v_reg
  from public.registrations
  where id = p_registration_id
    and bib_number is null
  for update;

  if not found then
    return null;
  end if;

  select bib_prefix, bib_start, max_slots
  into v_cat
  from public.race_categories
  where id = v_reg.category_id;

  v_cat.bib_start := coalesce(v_cat.bib_start, 1);
  v_cat.max_slots := coalesce(v_cat.max_slots, 9999);
  v_last_number := v_cat.bib_start + v_cat.max_slots - 1;
  v_width := length(v_last_number::text);

  for v_attempt in 1..3 loop
    select coalesce(max(
      nullif(regexp_replace(bib_number, '\D', '', 'g'), '')::int
    ), v_cat.bib_start - 1) + 1
    into v_next_number
    from public.registrations
    where event_id = v_reg.event_id
      and category_id = v_reg.category_id;

    if v_next_number > v_last_number then
      raise exception 'Category is full';
    end if;

    v_bib := coalesce(v_cat.bib_prefix, '') || lpad(v_next_number::text, v_width, '0');

    begin
      update public.registrations
      set bib_number = v_bib
      where id = p_registration_id;
      exit;
    exception
      when unique_violation then
        -- BIB collision: retry with the next available number
        if v_attempt = 3 then
          raise exception 'Could not assign BIB, please try again';
        end if;
    end;
  end loop;

  return v_bib;
end;
$$;

-- ── ORGANIZER COMPLIMENTARY REGISTRATION RPC ──────────────────
-- One call for single-add (frontend wraps rows as a 1-element array)
-- and CSV bulk import. p_guests: [{name, email, phone}, ...]
-- Returns {added: [...bib numbers], skipped: [{name, email, reason}]}
create or replace function public.organizer_add_complimentary_registrations(
  p_event_id uuid,
  p_category_id uuid,
  p_role text,
  p_guests jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizer_id uuid;
  v_cat record;
  v_reg_count int;
  v_max_slots int;
  v_profile_id uuid;
  v_so_far jsonb;
  v_skipped jsonb;
  v_author_email text;
  v_reg_id uuid;
  v_bib text;
  v_name text;
  v_email text;
  v_phone text;
  g record;
begin
  p_role := lower(btrim(coalesce(p_role, '')));
  if p_role not in ('runner', 'pacer', 'vip') then
    raise exception 'Role must be runner, pacer, or vip';
  end if;

  select get_my_organizer_id() into v_organizer_id;

  if not exists (
    select 1 from public.events
    where id = p_event_id and organizer_id = v_organizer_id
  ) then
    raise exception 'Event not found or not yours';
  end if;

  select id, max_slots
  into v_cat
  from public.race_categories
  where id = p_category_id
    and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Category not found for this event';
  end if;

  v_max_slots := coalesce(v_cat.max_slots, 9999);
  v_so_far := '[]'::jsonb;
  v_skipped := '[]'::jsonb;

  for g in
    select value
    from jsonb_array_elements(p_guests) as value
  loop
    v_name := btrim(coalesce(g.value->>'name', ''));
    v_email := btrim(coalesce(g.value->>'email', ''));
    v_phone := btrim(coalesce(g.value->>'phone', ''));

    if v_name = '' then
      v_skipped := v_skipped || jsonb_build_object(
        'name', v_name, 'email', v_email, 'reason', 'Name is required');
      continue;
    end if;

    select rp.id into v_profile_id
    from public.runner_profiles rp
    join auth.users u on u.id = rp.user_id
    where lower(u.email) = lower(v_email)
      and v_email <> ''
    limit 1;

    -- Duplicate guard: same guest / same runner already in the event
    if exists (
      select 1 from public.registrations r
      where r.event_id = p_event_id
        and (
          (v_email <> '' and lower(coalesce(r.guest_email, '')) = lower(v_email))
          or
          (v_email = '' and lower(r.guest_name) = lower(v_name))
          or
          (v_profile_id is not null and r.runner_id = v_profile_id)
        )
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'name', v_name, 'email', v_email,
        'reason', 'Already in this event');
      continue;
    end if;

    select count(*) into v_reg_count
    from public.registrations
    where event_id = p_event_id
      and category_id = p_category_id;

    if v_reg_count >= v_max_slots then
      v_skipped := v_skipped || jsonb_build_object(
        'name', v_name, 'email', v_email, 'reason', 'Category is full');
      continue;
    end if;

    insert into public.registrations (
      runner_id, event_id, category_id, organizer_id,
      bib_number, payment_status,
      guest_name, guest_email, guest_phone,
      registration_role
    ) values (
      v_profile_id, p_event_id, p_category_id, v_organizer_id,
      null, 'waived',
      case when v_profile_id is null then v_name else null end,
      case when v_profile_id is null then v_email else null end,
      case when v_profile_id is null then v_phone else null end,
      p_role
    )
    returning id into v_reg_id;

    v_bib := null;
    begin
      v_bib := public.allocate_bib(v_reg_id);
    exception
      when others then
        null;
    end;

    v_so_far := v_so_far || jsonb_build_object(
      'id', v_reg_id, 'bib_number', v_bib,
      'reason', null::text,
      'name', v_name, 'email', v_email);
  end loop;

  select coalesce(email, '') into v_author_email
  from auth.users
  where id = auth.uid();

  insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
  values (
    auth.uid(),
    'complimentary_registrations_added',
    p_event_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'category_id', p_category_id,
      'role', p_role,
      'guests', v_so_far
    ),
    v_author_email
  );

  return jsonb_build_object('added', v_so_far, 'skipped', v_skipped);
end;
$$;
