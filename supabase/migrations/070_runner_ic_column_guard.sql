-- ══════════════════════════════════════════════════════════════════
-- 070 — runner_profiles IC column-level write guard + retention hardening
--
-- [1] CRITICAL — DB-layer fix for Critical #1: the RLS policy "runner
--     updates own profile" (auth.uid() = user_id) still lets a hostile
--     browser client (user's own JWT) forge `ic_encrypted` or clobber
--     `ic_document_*` on its own row, reintroducing the IC gate bypass.
--     BEFORE triggers now revert the IC columns on every non-privileged
--     UPDATE (silent revert, no error) and NULL them on non-privileged
--     INSERT. Privileged writers, and only those, pass through:
--       - service_role   → Django (pelikat-api) and the Next.js BFF
--                          (route.ts / account.ts write via supabaseAdmin)
--       - postgres       → SECURITY DEFINER code (anonymize_runner_profile)
--     Normal profile editing (name/phone/dob/... from the runner's own
--     client) is NOT affected: only the four IC columns are pinned.
--
-- [2] Retention fn hardening (CodeRabbit minors on 069):
--     - EXECUTE revoked from PUBLIC/anon/authenticated/service_role.
--       cron.job rows run as `postgres`, which keeps owner EXECUTE —
--       the scheduled job is unaffected.
--     - hardcoded project URL removed from the function body; the base
--       URL now comes from the vault secret 'pdpa-storage-base-url'
--       (bootstrapped below with the current project URL; it is the
--       public API URL, not a credential).
--
-- All steps idempotent. Rollback notes inline.
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. COLUMN-LEVEL WRITE GUARD on runner_profiles
-- ──────────────────────────────────────────────────────────────────

create or replace function public.guard_runner_ic_columns()
returns trigger
language plpgsql
security invoker                       -- current_user must reflect the caller
set search_path = ''
as $$
declare
  v_forge boolean := false;
begin
  -- Privileged paths only: PostgREST service-role requests (Django / BFF
  -- service key) and postgres (SECURITY DEFINER code such as
  -- anonymize_runner_profile, out-of-band maintenance).
  if current_user in ('postgres', 'service_role')
     or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return coalesce(new, old);
  end if;

  -- Everyone else (anon / authenticated): pin the IC columns.
  if TG_OP = 'UPDATE' then
    v_forge :=
         new.ic_encrypted            is distinct from old.ic_encrypted
      or new.ic_document_path       is distinct from old.ic_document_path
      or new.ic_document_mime       is distinct from old.ic_document_mime
      or new.ic_document_uploaded_at is distinct from old.ic_document_uploaded_at;

    new.ic_encrypted             := old.ic_encrypted;
    new.ic_document_path         := old.ic_document_path;
    new.ic_document_mime         := old.ic_document_mime;
    new.ic_document_uploaded_at  := old.ic_document_uploaded_at;

    if v_forge then
      -- Log the attempt; never let logging failures block the write.
      begin
        insert into public.audit_log (actor_id, action, target_id, metadata)
        values (
          auth.uid(),
          'IC_GUARD_REVERTED runner_profiles',
          new.id,
          jsonb_build_object(
            'table', 'runner_profiles',
            'operation', 'UPDATE',
            'db_role', current_user,
            'jwt_role', coalesce(current_setting('request.jwt.claim.role', true), 'anon')
          )
        );
      exception when others then
        null;
      end;
    end if;
    return new;

  elsif TG_OP = 'INSERT' then
    -- No previous row to revert to: silently NULL any forged IC payload.
    if new.ic_encrypted is not null
       or new.ic_document_path is not null
       or new.ic_document_mime is not null
       or new.ic_document_uploaded_at is not null then
      new.ic_encrypted            := null;
      new.ic_document_path        := null;
      new.ic_document_mime        := null;
      new.ic_document_uploaded_at := null;

      begin
        insert into public.audit_log (actor_id, action, target_id, metadata)
        values (
          auth.uid(),
          'IC_GUARD_NULLED runner_profiles',
          new.id,
          jsonb_build_object(
            'table', 'runner_profiles',
            'operation', 'INSERT',
            'db_role', current_user,
            'jwt_role', coalesce(current_setting('request.jwt.claim.role', true), 'anon')
          )
        );
      exception when others then
        null;
      end;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

-- Trigger functions are internal plumbing; nothing may call them directly.
revoke execute on function public.guard_runner_ic_columns()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_runner_ic_columns_update on public.runner_profiles;
create trigger guard_runner_ic_columns_update
  before update on public.runner_profiles
  for each row execute function public.guard_runner_ic_columns();

drop trigger if exists guard_runner_ic_columns_insert on public.runner_profiles;
create trigger guard_runner_ic_columns_insert
  before insert on public.runner_profiles
  for each row execute function public.guard_runner_ic_columns();

-- ──────────────────────────────────────────────────────────────────
-- 2. RETENTION CRON HARDENING (069 follow-up)
-- ──────────────────────────────────────────────────────────────────

-- EXECUTE was PUBLIC by default (069); only the cron role needs it.
-- cron.job 'pdpa-ic-retention-cleanup' runs as username = postgres.
-- Rollback reference (069 grants):
--   grant execute on function public.pdpa_delete_expired_ic_documents()
--     to anon, authenticated, service_role;   -- PUBLIC implicit by default
revoke execute on function public.pdpa_delete_expired_ic_documents()
  from public, anon, authenticated, service_role;

-- Base URL moved out of the function body into the vault, alongside the
-- service key. PER-ENVIRONMENT SETUP (run out-of-band, in each environment
-- that must run retention — NEVER bootstrap a shared migration with one
-- project's URL, other environments would send their key to that host):
--
--   select vault.create_secret('<storage-url>', 'pdpa-storage-base-url',
--          'Storage API base URL used by the PDPA ic-documents retention job');
--
-- Until the secret is set, the function no-ops with a NOTICE (safe skip).

-- Same behaviour as 069, with the URL resolved from the vault.
-- Rollback reference: 069's definition (hardcoded URL in the function body).
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
  'PDPA 365d retention: fire-and-forget Storage-API deletes for expired ic-documents objects; requires vault secrets pdpa-storage-service-key and pdpa-storage-base-url';

-- ──────────────────────────────────────────────────────────────────
-- 3. CONFIRMATION PASS: clear runner_profiles IC pointers only after the
--    Storage-API delete is confirmed (pg_net is async — the delete run
--    must never treat a queued request as success).
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.pdpa_ic_retention_queue (
  request_id  bigint primary key,          -- net.http_delete request id
  object_path text not null,               -- storage object name
  user_id     uuid not null,               -- first path segment (Django writes <user_id>/<ts>.enc)
  queued_at   timestamptz not null default now()
);

alter table public.pdpa_ic_retention_queue enable row level security;
revoke all on public.pdpa_ic_retention_queue from anon, authenticated;

-- Rollback reference (clear-on-confirm):
--   drop function public.pdpa_confirm_ic_retention();
--   drop table public.pdpa_ic_retention_queue;
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

revoke execute on function public.pdpa_confirm_ic_retention()
  from public, anon, authenticated, service_role;

comment on function public.pdpa_confirm_ic_retention() is
  'PDPA retention confirmation: clear runner_profiles IC columns for ic-documents objects whose Storage-API delete was confirmed (2xx/404); entries older than 7d are dropped and re-queued by the next delete run';

-- Confirmation cron: run well after the delete pass (03:23 UTC), same
-- ownership pattern. Idempotent.
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

-- Cron job already registered by 069 ('pdpa-ic-retention-cleanup',
-- 23 3 * * *, username postgres) and the command is unchanged — no reschedule.

-- NOTE (out of scope): stale runner_profiles rows of fully deleted
-- (is_deleted) users are NOT purged here — the rows are FK-referenced by
-- registrations/logs and the erasure flow (anonymize_runner_profile +
-- auth user delete) already removes PII from the row. Full row cleanup
-- would need a cascade strategy decision from @manager.
