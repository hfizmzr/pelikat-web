-- ── PHOTO TAGS: REVIEW PROVENANCE + ATOMIC AI REPLACE ────────────
-- Follow-up to pelikat-api PR #15 (CodeRabbit review). Reprocessing a
-- photo must replace the AI's tags but keep what an organizer decided.
--
--   1. photo_tags.reviewed_at: stamped by a trigger whenever a signed-in
--      user (organizer, or a runner sending a photo back to review)
--      inserts a tag or changes its status. The Django worker uses the
--      service role, where auth.uid() is null, so AI writes never stamp
--      it. "Organizer decision" no longer has to be guessed from
--      status + bib: older AI rows saved as discarded with a bib (possible
--      under non-default thresholds, and present in the seed data) stay
--      unstamped and are replaced like any other AI row.
--
--   2. replace_ai_photo_tags(): the delete of the AI-owned rows and the
--      insert of the new reads used to be two REST calls, so a failed
--      insert left the photo with no AI tags. Both now run in one
--      transaction, under a per-photo advisory lock.
--
-- Rows kept on reprocess ("organizer decisions"):
--   status = 'confirmed'
--   status = 'discarded' with a bib and reviewed_at set (a rejected read)

-- ── PROVENANCE ───────────────────────────────────────────────────

alter table public.photo_tags add column if not exists reviewed_at timestamptz;

create or replace function public.stamp_photo_tag_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if auth.uid() is not null then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_photo_tag_review() from public, anon, authenticated;

drop trigger if exists photo_tags_stamp_review on public.photo_tags;
create trigger photo_tags_stamp_review
  before insert or update of status on public.photo_tags
  for each row execute function public.stamp_photo_tag_review();

-- ── ATOMIC REPLACE ───────────────────────────────────────────────
-- p_rows: the worker's new reads, a JSON array of
--   {organizer_id, bib_number, registration_id, runner_id, confidence, status, batch_id}
-- (extra keys are ignored). A read is skipped when a kept row already
-- has its bib; the bib-less "nothing found" placeholder is skipped when
-- the photo still has any kept row.
-- Returns every row the photo ends up with; inserted = written by this call.

create or replace function public.replace_ai_photo_tags(
  p_event_id     uuid,
  p_storage_path text,
  p_rows         jsonb
)
returns table (status text, bib_number text, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Serialize replacements of the same photo (e.g. two reprocess batches).
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_storage_path, 0));

  delete from public.photo_tags t
   where t.event_id = p_event_id
     and t.storage_path = p_storage_path
     and not (
       t.status = 'confirmed'
       or (t.status = 'discarded' and t.bib_number is not null and t.reviewed_at is not null)
     );

  -- The final SELECT reads the snapshot taken before the CTE's insert, so
  -- it returns exactly the kept rows.
  return query
  with incoming as (
    select *
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
        organizer_id    uuid,
        bib_number      text,
        registration_id uuid,
        runner_id       uuid,
        confidence      numeric,
        status          text,
        batch_id        uuid
      )
  ),
  ins as (
    insert into public.photo_tags
      (event_id, organizer_id, storage_path, bib_number, registration_id, runner_id, confidence, status, batch_id)
    select p_event_id, i.organizer_id, p_storage_path, i.bib_number, i.registration_id, i.runner_id,
           i.confidence, i.status, i.batch_id
      from incoming i
     where case
             when i.bib_number is null then not exists (
               select 1 from public.photo_tags k
                where k.event_id = p_event_id and k.storage_path = p_storage_path)
             else not exists (
               select 1 from public.photo_tags k
                where k.event_id = p_event_id and k.storage_path = p_storage_path
                  and k.bib_number = i.bib_number)
           end
    returning photo_tags.status, photo_tags.bib_number
  )
  select ins.status, ins.bib_number, true from ins
  union all
  select k.status, k.bib_number, false
    from public.photo_tags k
   where k.event_id = p_event_id and k.storage_path = p_storage_path;
end;
$$;

revoke execute on function public.replace_ai_photo_tags(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_ai_photo_tags(uuid, text, jsonb) to service_role;
