-- ── IC DOCUMENT STORAGE + PDPA ERASURE ────────────────────────────

-- 1. Add IC document columns to runner_profiles
alter table runner_profiles
  add column if not exists ic_document_path text,
  add column if not exists ic_document_mime text,
  add column if not exists ic_document_uploaded_at timestamptz default now(),
  add column if not exists is_deleted boolean default false,
  add column if not exists deleted_at timestamptz;

-- 2. Change user_id FK from ON DELETE CASCADE to ON DELETE SET NULL
-- This preserves the runner profile row for event integrity when auth user is deleted
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.runner_profiles'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.runner_profiles drop constraint %I', constraint_name);
    execute format('alter table public.runner_profiles add constraint %I foreign key (user_id) references auth.users(id) on delete set null', constraint_name);
  end if;
end $$;

-- 3. Create ic-documents storage bucket
insert into storage.buckets (id, name, public)
values ('ic-documents', 'ic-documents', false)
on conflict (id) do nothing;

-- 4. RLS: runner uploads own IC document (raw temp upload)
create policy "runner uploads own ic document" on storage.objects
  for insert with check (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. RLS: runner reads own IC document (via signed URL)
create policy "runner reads own ic document" on storage.objects
  for select using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. RLS: runner deletes own IC document
create policy "runner deletes own ic document" on storage.objects
  for delete using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7. Anonymize runner profile RPC (PDPA erasure)
-- Called by server action after file deletion and auth user removal.
-- Keeps the profile row and all registrations/badges/run_logs intact
-- for event statistics integrity. Only PII fields are wiped.
create or replace function anonymize_runner_profile(p_runner_id uuid)
returns void language plpgsql security definer
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
    t_shirt_size = null,
    is_deleted = true,
    deleted_at = now(),
    pdpa_agreed = false
  where id = p_runner_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Profile not found or access denied';
  end if;
end;
$$;

-- 8. Update the auth-user-created trigger (005_k) to respond to set null
-- If user_id is set to null, the profile must not be discoverable via
-- the public registration view. Registration/leaderboard queries join
-- through runner_profiles.id (not user_id), so anonymity is preserved.
