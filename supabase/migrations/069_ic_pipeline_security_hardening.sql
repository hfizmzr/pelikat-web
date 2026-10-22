-- ══════════════════════════════════════════════════════════════════
-- 069 — IC / passport pipeline security hardening (Phase 1)
--
-- [1] CRITICAL — cross-bucket storage leak: dashboard-created policies
--     "Allow organizers to upload i66nlp_0/1" on storage.objects had NO
--     bucket_id filter (organizers could INSERT/SELECT on every bucket,
--     including `ic-documents`); avatar policies "Runners can upload
--     avatar 1oj01fe_0/1/2" only checked owner, no bucket filter.
-- [2] CRITICAL — organizer full-row read of runner_profiles via
--     "organizer reads event runner profiles" SELECT policy exposed
--     ic_encrypted, ic_document_*, phone, dob, emergency_contact_*.
--     Replaced by the safe view `runner_profiles_safe`; runners keep
--     their own-row table access (needed for IC upload/display).
-- [3] HIGH — leaderboard_virtual (definer view) exposed real
--     full_name to anon; now masked ("Ahmad K.") except the viewer's
--     own row. event_registration_counts switched to security_invoker.
-- [4] PDPA — audit.log_change() now redacts sensitive keys at trigger
--     time; anonymize_runner_profile() scrubs historical audit rows;
--     365-day retention rule for ic-documents objects via pg_cron.
--
-- All steps are idempotent (drop-if-exists / create-or-replace).
-- Original (unsafe) definitions are preserved in comments for rollback.
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. STORAGE — close the cross-bucket leak
-- ──────────────────────────────────────────────────────────────────

-- Rollback reference (the leaky originals):
--   create policy "Allow organizers to upload i66nlp_0" on storage.objects
--     for insert to authenticated
--     with check (( get_my_organizer_id() IS NOT NULL ));
--   create policy "Allow organizers to upload i66nlp_1" on storage.objects
--     for select to authenticated
--     using (( get_my_organizer_id() IS NOT NULL ));

drop policy if exists "Allow organizers to upload i66nlp_0" on storage.objects;
drop policy if exists "Allow organizers to upload i66nlp_1" on storage.objects;

-- Recreated strictly bucket- AND user-scoped. Organizer client code only
-- uploads / signs URLs under its own auth-id folder in `race-photos`
-- (merch-images already has dedicated bucket-scoped policies; Django
-- service-role handles certificates/avatars/photo-gallery/receipts).
drop policy if exists "organizer uploads race photos" on storage.objects;
create policy "organizer uploads race photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'race-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "organizer reads race photos" on storage.objects;
create policy "organizer reads race photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'race-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Rollback reference (avatar originals — bucket was unrestricted):
--   create policy "Runners can upload avatar 1oj01fe_0" on storage.objects
--     for select to authenticated using (( auth.uid() = owner ));
--   create policy "Runners can upload avatar 1oj01fe_1" on storage.objects
--     for insert to authenticated with check (( auth.uid() = owner ));
--   create policy "Runners can upload avatar 1oj01fe_2" on storage.objects
--     for update to authenticated using (( auth.uid() = owner ));

drop policy if exists "Runners can upload avatar 1oj01fe_0" on storage.objects;
drop policy if exists "Runners can upload avatar 1oj01fe_1" on storage.objects;
drop policy if exists "Runners can upload avatar 1oj01fe_2" on storage.objects;

drop policy if exists "runner owns avatar objects" on storage.objects;
create policy "runner owns avatar objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "runner can insert avatar objects" on storage.objects;
create policy "runner can insert avatar objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "runner can update avatar objects" on storage.objects;
create policy "runner can update avatar objects" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ic-documents: runner policies below already exist (041). Keep them and
-- add the missing UPDATE enforcement (Storage upsert:true needs UPDATE).
--   Existing (unchanged):
--     policy "runner uploads own ic document" insert, TO public:
--       bucket_id = 'ic-documents' and (storage.foldername(name))[1] = auth.uid()::text
--     policy "runner reads own ic document"  select, TO public: (same predicate)
--     policy "runner deletes own ic document" delete, TO public: (same predicate)
drop policy if exists "runner updates own ic document" on storage.objects;
create policy "runner updates own ic document" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ic-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'ic-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ic-documents bucket hardening knobs.
-- NOTE: Django (pelikat-api apps/documents/services.py) uploads the
-- AES-encrypted blob with declared content-type application/octet-stream
-- (upsert: true); real file-type validation happens app-side before
-- encryption. Whitelist the declared mime + real image types.
-- Rollback reference:
--   update storage.buckets set file_size_limit = null,
--     allowed_mime_types = null where id = 'ic-documents';
update storage.buckets
  set public = false,
      file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = array[
        'image/jpeg','image/png','image/webp','application/octet-stream'
      ]
  where id = 'ic-documents';

-- ──────────────────────────────────────────────────────────────────
-- 2. RUNNER PII — organizer access via safe view only
-- ──────────────────────────────────────────────────────────────────

-- Rollback reference (the leaking policy):
--   create policy "organizer reads event runner profiles" on public.runner_profiles
--     for select to public
--     using ( organizer_can_read_runner_profile(id) );
drop policy if exists "organizer reads event runner profiles" on public.runner_profiles;

-- Safe view: definer-mode view (owner = postgres, bypasses per-caller RLS)
-- with the access predicate embedded in its WHERE clause. Organizers get
-- only non-sensitive columns of runners registered in their events;
-- runners additionally see their own row. anon matches neither branch.
--
-- Sensitive columns EXCLUDED by design:
--   ic_encrypted, ic_document_path, ic_document_mime,
--   ic_document_uploaded_at, phone, dob,
--   emergency_contact_name, emergency_contact_phone
-- `full_name`, `gender`, `t_shirt_size`, `pdpa_agreed` stay: roster,
-- check-in and e-cert flows need them and they are not in the
-- PDPA exclusion list.
create or replace view public.runner_profiles_safe with (security_invoker = false) as
  select
    id, user_id, full_name, gender, t_shirt_size,
    pdpa_agreed, created_at, is_deleted, deleted_at
  from public.runner_profiles
  where public.organizer_can_read_runner_profile(id)
     or user_id = (select auth.uid());

grant select on public.runner_profiles_safe to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.runner_profiles_safe from anon, authenticated;

-- Keep the underlying table's own-row policies intact:
--   "runner inserts own profile"  (insert, user_id = auth.uid())
--   "runner reads own profile"    (select, user_id = auth.uid())
--   "runner updates own profile"  (update, authenticated, own row)

-- ──────────────────────────────────────────────────────────────────
-- 3. VIEWS — PII masking + security calendar hygiene
-- ──────────────────────────────────────────────────────────────────

-- leaderboard_virtual: mask full_name for EVERYONE EXCEPT the viewer's
-- own row ("Ahmad K." pattern; anonymized profiles → 'Deleted User').
--
-- ROLLBACK (original definition — unmasked full_name):
-- create or replace view public.leaderboard_virtual as
--   SELECT rp.full_name, rp.id AS runner_id, rp.gender, r.event_id,
--     sum(rl.distance_km) AS total_km,
--     rank() OVER (PARTITION BY r.event_id ORDER BY (sum(rl.distance_km)) DESC) AS rank,
--     r.category_id, rc.name AS category_name
--   FROM run_logs rl
--   JOIN runner_profiles rp ON rp.id = rl.runner_id
--   JOIN registrations r ON r.runner_id = rl.runner_id AND r.event_id = rl.event_id
--   LEFT JOIN race_categories rc ON rc.id = r.category_id
--   GROUP BY rp.full_name, rp.id, rp.gender, r.event_id, r.category_id, rc.name;
--
-- NOTE: this stays a definer view. security_invoker = true would apply the
-- caller's RLS on run_logs/registrations (runner sees only own logs →
-- every leaderboard becomes 1-person), breaking the feature.
create or replace view public.leaderboard_virtual as
  select
    case
      when lb.user_id = (select auth.uid()) then lb.name
      when lb.name is null or btrim(lb.name) = '' then 'Deleted User'
      when strpos(btrim(lb.name), ' ') = 0 then left(btrim(lb.name), 1) || '.'
      else split_part(btrim(lb.name), ' ', 1)
           || ' ' || left(split_part(btrim(lb.name), ' ', 2), 1) || '.'
    end as full_name,
    lb.runner_id, lb.gender, lb.event_id, lb.total_km,
    lb.rank, lb.category_id, lb.category_name
  from (
    select
      rp.full_name as name,
      rp.user_id as user_id,
      rp.id as runner_id,
      rp.gender,
      r.event_id,
      sum(rl.distance_km) as total_km,
      rank() over (partition by r.event_id order by sum(rl.distance_km) desc) as rank,
      r.category_id,
      rc.name as category_name
    from run_logs rl
    join runner_profiles rp on rp.id = rl.runner_id
    join registrations r on r.runner_id = rl.runner_id and r.event_id = rl.event_id
    left join race_categories rc on rc.id = r.category_id
    group by rp.full_name, rp.user_id, rp.id, rp.gender, r.event_id, r.category_id, rc.name
  ) lb;

-- event_registration_counts: aggregates only (no PII columns), but switch
-- to security_invoker so the Data-API caller's RLS on registrations applies.
-- Rollback reference:
--   create or replace view public.event_registration_counts as
--     SELECT event_id, count(*) AS total,
--       sum(CASE WHEN checked_in THEN 1 ELSE 0 END) AS checked_in_count
--     FROM registrations GROUP BY event_id;
create or replace view public.event_registration_counts
with (security_invoker = true) as
  select
    event_id,
    count(*) as total,
    sum(case when checked_in then 1 else 0 end) as checked_in_count
  from registrations
  group by event_id;

-- Views never need write grants; strip them from the Data-API roles.
revoke insert, update, delete, truncate, references, trigger
  on public.leaderboard_virtual, public.event_registration_counts
  from anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. PDPA — audit redaction, erasure scrub, retention
-- ──────────────────────────────────────────────────────────────────

create schema if not exists audit;

-- Redacts sensitive keys from a row snapshot.
-- full_name → 'REDACTED' (kept as a marker for readability); all other
-- sensitive keys are dropped.
create or replace function audit.redact_sensitive(p_json jsonb)
returns jsonb
language sql
stable
as $$
  select case
    when p_json is null then null
    when p_json ? 'full_name' then
      (p_json - array[
        'ic_encrypted','ic_document_path','ic_document_mime',
        'ic_document_uploaded_at','emergency_contact_name',
        'emergency_contact_phone','phone','dob'
      ]::text[]) || jsonb_build_object('full_name', 'REDACTED')
    else
      p_json - array[
        'ic_encrypted','ic_document_path','ic_document_mime',
        'ic_document_uploaded_at','emergency_contact_name',
        'emergency_contact_phone','phone','dob'
      ]::text[]
  end;
$$;

-- audit.log_change(): same behaviour as 032, with redaction applied at
-- trigger time so every NEW audit row is clean of sensitive keys.
-- Rollback reference:
--   (0012 lines) original to_jsonb(old)/to_jsonb(new) unredacted version;
--   drop function audit.redact_sensitive(jsonb);
create or replace function audit.log_change()
returns trigger
language plpgsql
security definer
set search_path = public, audit
as $$
begin
  insert into public.audit_log (
    actor_id,
    action,
    target_id,
    old_data,
    new_data,
    metadata
  )
  values (
    null, -- actor_id is set by app-level logging; triggers can't reliably know the user
    TG_OP || ' ' || TG_TABLE_NAME,
    coalesce(new.id, old.id),
    case when TG_OP in ('UPDATE', 'DELETE')
         then audit.redact_sensitive(to_jsonb(old)) else null end,
    case when TG_OP in ('INSERT', 'UPDATE')
         then audit.redact_sensitive(to_jsonb(new)) else null end,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'schema', TG_TABLE_SCHEMA
    )
  );

  return coalesce(new, old);
end;
$$;

-- anonymize_runner_profile (last full def: 041 + 047): same erasure plus
-- scrubbing of historical audit rows keyed to this profile
-- (audit_log.target_id = profile id, metadata->>'table' = 'runner_profiles').
-- Rollback reference: 047's definition (no audit scrub).
create or replace function public.anonymize_runner_profile(p_runner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.runner_profiles set
    full_name = 'Deleted User',
    phone = null,
    dob = null,
    gender = null,
    ic_encrypted = null,
    ic_document_path = null,
    ic_document_mime = null,
    ic_document_uploaded_at = null,
    emergency_contact_name = null,
    emergency_contact_phone = null,
    t_shirt_size = null,
    is_deleted = true,
    deleted_at = now(),
    pdpa_agreed = false
  where id = p_runner_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Profile not found or access denied';
  end if;

  -- Historical audit rows: scrub the same sensitive keys.
  update public.audit_log
     set old_data = audit.redact_sensitive(old_data),
         new_data = audit.redact_sensitive(new_data)
   where metadata->>'table' = 'runner_profiles'
     and target_id = p_runner_id;
end;
$$;

-- Retention: delete ic-documents objects older than 365 days (PDPA).
-- HOSTED-SUPABASE SAFE PATH: direct DELETE on storage.objects is blocked
-- by the platform trigger storage.protect_delete(); instead this function
-- issues Storage-API deletes via pg_net using the service_role JWT held
-- in vault under the secret name 'pdpa-storage-service-key'.
--
-- One-time setup (run out-of-band, NEVER commit a real JWT):
--   select vault.create_secret('<service_role JWT>', 'pdpa-storage-service-key',
--          'service key used by the PDPA ic-documents retention job');
-- When the secret is missing the job no-ops with a NOTICE (bucket keeps
-- growing — the app-side erasure path in Django still deletes objects).
--
-- pgnote: async fire-and-forget; the storage service removes the objects
-- and rows itself. Failures are retried on the next daily run (delete is
-- idempotent: already-deleted paths return 404 harmlessly).
create or replace function public.pdpa_delete_expired_ic_documents()
returns integer
language plpgsql
security definer
set search_path = public, net, storage
as $$
declare
  v_authn  text;
  v_object record;
  v_id     bigint;
  v_count  int := 0;
begin
  select decrypted_secret into v_authn
    from vault.decrypted_secrets
   where name = 'pdpa-storage-service-key'
   limit 1;

  if v_authn is null or v_authn = '' then
    raise notice 'pdpa-ic-retention: vault secret "pdpa-storage-service-key" not set; skipping run';
    return 0;
  end if;

  for v_object in
    select name
      from storage.objects
     where bucket_id = 'ic-documents'
       and created_at < now() - interval '365 days'
       and name ~ '^[A-Za-z0-9/_.-]+$'  -- URL-safe charset (Django always writes this shape)
     limit 100  -- per-run batch cap; daily job keeps up with growth
  loop
    v_id := net.http_delete(
      url => 'https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/ic-documents/'
             || v_object.name,
      headers => jsonb_build_object(
        'Authorization', 'Bearer ' || v_authn,
        'apikey', v_authn
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.pdpa_delete_expired_ic_documents() is
  'PDPA 365d retention: fire-and-forget Storage-API deletes for expired ic-documents objects; requires vault secret pdpa-storage-service-key';

-- Schedule daily via pg_cron (same pattern as 021/062). Idempotent: the
-- job name is reused, unscheduling an existing entry first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pdpa-ic-retention-cleanup') then
    perform cron.unschedule('pdpa-ic-retention-cleanup');
  end if;
  perform cron.schedule(
    'pdpa-ic-retention-cleanup',
    '23 3 * * *',
    'select public.pdpa_delete_expired_ic_documents()'
  );
end;
$$;
