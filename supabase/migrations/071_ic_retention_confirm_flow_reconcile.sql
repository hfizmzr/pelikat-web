-- 071 — reconciliation fix-up for 069/070 post-apply edits (commit 76537e0).
--
-- Migrations 069/070 were already applied live BEFORE commit 76537e0 edited
-- their files in-repo (CodeRabbit fixes). Supabase migration records pin the
-- version name, not the file hash, so the edited 070 never re-ran. This
-- migration expresses ONLY the net-new delta from that commit, idempotently,
-- so it is safe both against the already-applied live DB and on fresh
-- environments that replay 070 (which already contains the final state).
--
-- Delta vs the applied 070:
--   a) 070 final: pdpa_delete_expired_ic_documents now ENQUEUES matched
--      objects into pdpa_ic_retention_queue (no clear of profile columns).
--   b) New: pdpa_ic_retention_queue table (RLS on, no client privileges).
--   c) New: pdpa_confirm_ic_retention() — clears runner_profiles IC columns
--      only after the Storage-API delete is confirmed (2xx/404); failures
--      are re-queued by the next daily run.
--   d) New cron 'pdpa-ic-retention-confirm' at 53 3 * * * (delete pass stays
--      at 23 3 * * * — 30 min gap for pg_net responses).
--
-- Vault: pdpa-storage-base-url / pdpa-storage-service-key are PER-ENVIRONMENT
-- out-of-band setup (see edited 070) — NOT bootstrapped here.

begin;

-- (a) Rotate the retention delete function body to the confirmed-queue flow
--     (identical to 070's final definition; mirrors 76537e0 exactly).
create or replace function public.pdpa_delete_expired_ic_documents()
returns integer
language plpgsql
security definer
set search_path = public, net, storage
as $$
declare
  v_authn  text;
  v_base   text;
  v_object record;
  v_id     bigint;
  v_count  int := 0;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets
   where name = 'pdpa-storage-base-url'
   limit 1;

  if v_base is null or btrim(v_base) = '' then
    raise notice 'pdpa-ic-retention: vault secret "pdpa-storage-base-url" not set; skipping run';
    return 0;
  end if;

  select decrypted_secret into v_authn
    from vault.decrypted_secrets
   where name = 'pdpa-storage-service-key'
   limit 1;

  if v_authn is null or v_authn = '' then
    raise notice 'pdpa-ic-retention: vault secret "pdpa-storage-service-key" not set; skipping run';
    return 0;
  end if;

  v_base := btrim(v_base);
  v_base := rtrim(v_base, '/');

  for v_object in
    select name
      from storage.objects
     where bucket_id = 'ic-documents'
       and created_at < now() - interval '365 days'
       and name ~ '^[A-Za-z0-9/_.-]+$'  -- URL-safe charset (Django always writes this shape)
     limit 100  -- per-run batch cap; daily job keeps up with growth
  loop
    v_id := net.http_delete(
      url => v_base || '/storage/v1/object/ic-documents/' || v_object.name,
      headers => jsonb_build_object(
        'Authorization', 'Bearer ' || v_authn,
        'apikey', v_authn
      )
    );
    v_count := v_count + 1;

    -- Track the async request so pdpa_confirm_ic_retention() can clear the
    -- profile's IC pointers once the deletion is CONFIRMED (200/404).
    -- Django's document_path shape is always '<user_id>/<ts>.enc' (pelikat-api
    -- apps/documents), so the first path segment is the profile's user_id.
    if v_object.name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' then
      insert into public.pdpa_ic_retention_queue (request_id, object_path, user_id)
      values (v_id, v_object.name, (split_part(v_object.name, '/', 1))::uuid);
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.pdpa_delete_expired_ic_documents() is
  'PDPA 365d retention: fire-and-forget Storage-API deletes for expired ic-documents objects, enqueued for confirmation; requires vault secrets pdpa-storage-service-key and pdpa-storage-base-url';

-- Stress the single-step grants again (both 069 snapshots may have been applied).
revoke execute on function public.pdpa_delete_expired_ic_documents()
  from public, anon, authenticated, service_role;

-- (b) Queue table (070 edited post-apply; created idempotently here).
create table if not exists public.pdpa_ic_retention_queue (
  request_id  bigint primary key,          -- net.http_delete request id
  object_path text not null,               -- storage object name
  user_id     uuid not null,               -- first path segment (Django writes <user_id>/<ts>.enc)
  queued_at   timestamptz not null default now()
);

alter table public.pdpa_ic_retention_queue enable row level security;
revoke all on public.pdpa_ic_retention_queue from anon, authenticated;

-- (c) Confirmation pass (070 edited post-apply).
revoke execute on function public.pdpa_confirm_ic_retention()
  from public, anon, authenticated, service_role;
create or replace function public.pdpa_confirm_ic_retention()
returns integer
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_q      record;
  v_count  int := 0;
begin
  -- Confirmed deletions (2xx, or 404 = already gone): clear the matching
  -- profile IC pointers so the gate (ic_document_path) closes for real.
  for v_q in
    select q.request_id, q.object_path
      from public.pdpa_ic_retention_queue q
      join net._http_response r on r.id = q.request_id
     where r.status_code between 200 and 299 or r.status_code = 404
  loop
    update public.runner_profiles
       set ic_document_path         = null,
           ic_document_mime         = null,
           ic_document_uploaded_at  = null
     where ic_document_path = v_q.object_path;
    v_count := v_count + 1;
  end loop;

  -- Drop processed entries (failures included — a failed object still exists,
  -- so the next daily run re-queues it and a fresh confirmation is required).
  delete from public.pdpa_ic_retention_queue q
   using net._http_response r
   where r.id = q.request_id;

  -- Stale entries with no recorded response after 7 days: drop them; the
  -- next run re-queues the delete (the object presumably still exists).
  delete from public.pdpa_ic_retention_queue
   where queued_at < now() - interval '7 days';

  return v_count;
end;
$$;

comment on function public.pdpa_confirm_ic_retention() is
  'PDPA retention confirmation: clear runner_profiles IC columns for ic-documents objects whose Storage-API delete was confirmed (2xx/404); entries older than 7d are dropped and re-queued by the next delete run';

-- (d) Confirmation cron at 03:53 UTC, idempotent (no double-schedule).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pdpa-ic-retention-confirm') then
    perform cron.unschedule('pdpa-ic-retention-confirm');
  end if;
  perform cron.schedule(
    'pdpa-ic-retention-confirm',
    '53 3 * * *',
    'select public.pdpa_confirm_ic_retention()'
  );
end;
$$;

-- Delete-pass cron ('pdpa-ic-retention-cleanup', 23 3 * * *, username postgres)
-- was registered by 069 and its command (the function) is unchanged — left as-is.

commit;
