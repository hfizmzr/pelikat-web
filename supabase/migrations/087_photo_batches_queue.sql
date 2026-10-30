-- ── AI PHOTO ENGINE: BACKGROUND QUEUE + BATCH STATS (FR-16, FR-20) ──
-- Photo processing used to run inside one HTTP request, which gunicorn
-- killed after 120s on big batches, and batch stats were pieced together
-- from photo_tags (failed photos left no row at all).
--
--   photo_batches      one row per upload / reprocess run: status and
--                      per-photo counters (auto-tagged, flagged, no bib,
--                      failed) — what the organizer sees for FR-20.
--   photo_batch_items  one row per photo; doubles as the job queue the
--                      Django worker (`manage.py run_photo_worker`) drains.
--
-- Only the service role writes: enqueue_photo_batch() is called by the
-- Django /ai/photos/process* endpoints (after the web app's owner check),
-- claim_/finish_photo_batch_item() by the worker. Organizers get read-only
-- access to their own events' rows.

-- ── TABLES ───────────────────────────────────────────────────────

create table if not exists public.photo_batches (
  -- client-generated, also stamped on photo_tags.batch_id
  id            uuid primary key,
  event_id      uuid not null references public.events(id) on delete cascade,
  organizer_id  uuid not null references public.organizers(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  source        text not null default 'upload' check (source in ('upload', 'reprocess')),
  -- storage folder for reprocess runs; null for direct uploads
  prefix        text,
  status        text not null default 'queued'
    check (status in ('queued', 'processing', 'completed')),
  total         integer not null check (total > 0),
  -- photos finished so far, failed ones included
  processed     integer not null default 0,
  auto_tagged   integer not null default 0,
  flagged       integer not null default 0,
  no_bib        integer not null default 0,
  failed        integer not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create index if not exists photo_batches_event_idx
  on public.photo_batches (event_id, created_at desc);

create table if not exists public.photo_batch_items (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.photo_batches(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  storage_path  text not null,
  status        text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  -- set when status = 'done'
  outcome       text check (outcome in ('auto_tagged', 'flagged', 'no_bib')),
  tag_count     integer not null default 0,
  error         text,
  attempts      integer not null default 0,
  locked_at     timestamptz,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  unique (batch_id, storage_path)
);

create index if not exists photo_batch_items_queue_idx
  on public.photo_batch_items (created_at)
  where status in ('queued', 'processing');

-- ── RLS / GRANTS ─────────────────────────────────────────────────

alter table public.photo_batches enable row level security;
alter table public.photo_batch_items enable row level security;

revoke all on public.photo_batches, public.photo_batch_items from anon, authenticated;
grant select on public.photo_batches, public.photo_batch_items to authenticated;

drop policy if exists "organizer reads own event photo batches" on public.photo_batches;
create policy "organizer reads own event photo batches" on public.photo_batches
  for select using (
    event_id in (
      select id from public.events where organizer_id = public.get_my_organizer_id()
    )
  );

drop policy if exists "organizer reads own event photo batch items" on public.photo_batch_items;
create policy "organizer reads own event photo batch items" on public.photo_batch_items
  for select using (
    event_id in (
      select id from public.events where organizer_id = public.get_my_organizer_id()
    )
  );

-- ── ENQUEUE ──────────────────────────────────────────────────────
-- Batch row + one item per distinct path, in one transaction. Re-posting
-- an existing batch id (a retried request) returns the existing row.

create or replace function public.enqueue_photo_batch(
  p_batch_id     uuid,
  p_event_id     uuid,
  p_organizer_id uuid,
  p_created_by   uuid,
  p_source       text,
  p_prefix       text,
  p_paths        text[]
)
returns setof public.photo_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if exists (select 1 from public.photo_batches where id = p_batch_id) then
    return query select * from public.photo_batches where id = p_batch_id;
    return;
  end if;

  select count(distinct p) into v_total
    from unnest(coalesce(p_paths, '{}')) as p
   where coalesce(btrim(p), '') <> '';

  if v_total = 0 then
    raise exception 'No photos to process.' using errcode = '22023';
  end if;

  insert into public.photo_batches (id, event_id, organizer_id, created_by, source, prefix, total)
  values (p_batch_id, p_event_id, p_organizer_id, p_created_by,
          coalesce(p_source, 'upload'), p_prefix, v_total);

  insert into public.photo_batch_items (batch_id, event_id, storage_path)
  select distinct p_batch_id, p_event_id, p
    from unnest(p_paths) as p
   where coalesce(btrim(p), '') <> '';

  return query select * from public.photo_batches where id = p_batch_id;
end;
$$;

revoke execute on function public.enqueue_photo_batch(uuid, uuid, uuid, uuid, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.enqueue_photo_batch(uuid, uuid, uuid, uuid, text, text, text[])
  to service_role;

-- ── FINISH ───────────────────────────────────────────────────────
-- p_outcome null = failed. Only an item still 'processing' is counted, so
-- a worker whose lease was taken over can't count the same photo twice.

create or replace function public.finish_photo_batch_item(
  p_item_id   uuid,
  p_outcome   text,
  p_error     text default null,
  p_tag_count integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_failed   boolean := p_outcome is null;
begin
  if p_outcome is not null and p_outcome not in ('auto_tagged', 'flagged', 'no_bib') then
    raise exception 'Unknown photo outcome: %', p_outcome using errcode = '22023';
  end if;

  update public.photo_batch_items
     set status      = case when v_failed then 'failed' else 'done' end,
         outcome     = p_outcome,
         error       = left(p_error, 500),
         tag_count   = coalesce(p_tag_count, 0),
         locked_at   = null,
         finished_at = now()
   where id = p_item_id
     and status = 'processing'
  returning batch_id into v_batch_id;

  if v_batch_id is null then
    return;
  end if;

  update public.photo_batches b
     set processed   = b.processed + 1,
         auto_tagged = b.auto_tagged + (p_outcome is not distinct from 'auto_tagged')::int,
         flagged     = b.flagged + (p_outcome is not distinct from 'flagged')::int,
         no_bib      = b.no_bib + (p_outcome is not distinct from 'no_bib')::int,
         failed      = b.failed + v_failed::int,
         status      = case when b.processed + 1 >= b.total then 'completed' else 'processing' end,
         finished_at = case when b.processed + 1 >= b.total then now() else null end
   where b.id = v_batch_id;
end;
$$;

revoke execute on function public.finish_photo_batch_item(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.finish_photo_batch_item(uuid, text, text, integer)
  to service_role;

-- ── CLAIM ────────────────────────────────────────────────────────
-- Oldest queued items first. An item whose worker died mid-photo is
-- re-claimed after 15 minutes, up to 3 attempts; after that it is failed
-- so its batch can still complete.

create or replace function public.claim_photo_batch_items(p_limit integer default 1)
returns table (
  id           uuid,
  batch_id     uuid,
  event_id     uuid,
  organizer_id uuid,
  storage_path text,
  attempts     integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_stale_id uuid;
begin
  for v_stale_id in
    select s.id
      from public.photo_batch_items s
     where s.status = 'processing'
       and s.attempts >= 3
       and s.locked_at < now() - interval '15 minutes'
     for update skip locked
  loop
    perform public.finish_photo_batch_item(v_stale_id, null, 'Processing timed out after 3 attempts.', 0);
  end loop;

  return query
  with picked as (
    select q.id
      from public.photo_batch_items q
     where q.status = 'queued'
        or (q.status = 'processing' and q.attempts < 3
            and q.locked_at < now() - interval '15 minutes')
     order by q.created_at, q.storage_path
     limit greatest(1, least(coalesce(p_limit, 1), 50))
     for update skip locked
  ),
  claimed as (
    update public.photo_batch_items i
       set status = 'processing',
           locked_at = now(),
           attempts = i.attempts + 1
      from picked
     where i.id = picked.id
    returning i.id, i.batch_id, i.event_id, i.storage_path, i.attempts
  ),
  started as (
    update public.photo_batches b
       set status = 'processing',
           started_at = coalesce(b.started_at, now())
     where b.id in (select c.batch_id from claimed c)
       and b.status = 'queued'
  )
  select c.id, c.batch_id, c.event_id, b.organizer_id, c.storage_path, c.attempts
    from claimed c
    join public.photo_batches b on b.id = c.batch_id;
end;
$$;

revoke execute on function public.claim_photo_batch_items(integer) from public, anon, authenticated;
grant execute on function public.claim_photo_batch_items(integer) to service_role;
