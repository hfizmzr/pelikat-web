-- ── STORAGE BUCKETS ───────────────────────────────────────────
-- Run this in the Supabase SQL Editor after migrations are applied.
-- Storage buckets cannot be created via migrations, so this script
-- uses the storage API directly.

-- Create buckets
insert into storage.buckets (id, name, public)
values
  ('race-photos', 'race-photos', false),
  ('photo-gallery', 'photo-gallery', false),
  ('receipts', 'receipts', false),
  ('certificates', 'certificates', false),
  ('avatars', 'avatars', true),
  ('ic-documents', 'ic-documents', false)
on conflict (id) do nothing;

-- ── STORAGE RLS POLICIES ──────────────────────────────────────

-- race-photos: organizers can upload, service_role (Django) reads
create policy "organizer upload race photos" on storage.objects
  for insert with check (
    bucket_id = 'race-photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- photo-gallery: runners can read via presigned URLs only
-- (no direct public access; presigned URLs generated server-side)

-- receipts: runners can read their own receipts
create policy "runner reads own receipts" on storage.objects
  for select using (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- certificates: runners can read their own certificates
create policy "runner reads own certificates" on storage.objects
  for select using (
    bucket_id = 'certificates' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatars: public read, authenticated users can upload their own
create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "authenticated upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "authenticated update own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ic-documents: private bucket for IC/passport images
-- Runners can upload raw temp files; Django encrypts and replaces them
-- ⚠ Drop-guards: migration 041 already creates these three identically-named
-- policies, so a whole-file replay after `supabase db reset` would abort here
-- without them (069 precedent: drop-if-exists before every re-created policy).
drop policy if exists "runner uploads own ic document" on storage.objects;
create policy "runner uploads own ic document" on storage.objects
  for insert with check (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "runner reads own ic document" on storage.objects;
create policy "runner reads own ic document" on storage.objects
  for select using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "runner deletes own ic document" on storage.objects;
create policy "runner deletes own ic document" on storage.objects
  for delete using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── EVENT THEMES BUCKET (Event Themes P1 — spec §6) ──────────
-- Dedicated PUBLIC bucket: themed assets render on unauthenticated runner
-- pages. Public read is bucket-level (`public: true`); the bucket is NOT
-- publicly listable — there is deliberately no public SELECT policy, so
-- list/download via the Storage API stays organizer+admin-scoped below.
-- Rendered certificates with runner PII stay in the private `certificates`
-- bucket, unchanged.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-themes',
  'event-themes',
  true,
  10485760,  -- 10 MB hard cap (per-asset-type limits enforced editor-side)
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'font/woff',
    'font/woff2',
    'font/ttf'
  ]
)
on conflict (id) do nothing;

-- Tenancy validator: only paths shaped
--   organizers/{organizer_id}/events/{event_id}/{asset}.{ext}
-- pass, where both uuid segments must be canonical lowercase literals and
-- the event must actually belong to the caller — a forged event uuid fails
-- the exists-check. Admin bypass lives here so all four policies share it.
-- System preset assets (organizers/system/presets/…) are uploaded via
-- service_role, which bypasses RLS entirely — outside this validator.
-- ⚠ Param is `p_name`, NOT `name`: inside the `exists (… from events e …)`
-- subquery a parameter called `name` is shadowed by the `events.name`
-- column (column names outrank SQL-function parameter names), which made
-- the helper always-false for non-admins. Positional calls are unaffected.
create or replace function can_manage_theme_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_admin() or exists (
    select 1
    from events e
    where e.organizer_id = get_my_organizer_id()
      and (storage.foldername(p_name)) = array[
            'organizers',
            get_my_organizer_id()::text,
            'events',
            e.id::text
          ]
  )
$$;

-- organizer/admin can upload to their own event path (Storage upload)
create policy "organizer uploads own event theme assets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-themes' and
    can_manage_theme_path(name)
  );

-- organizer/admin list/download only (public serving is bucket-level and
-- never consults RLS; anon matches no policy → not publicly listable)
create policy "organizer reads own event theme assets" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-themes' and
    can_manage_theme_path(name)
  );

-- update covers Storage API upsert: true (insert-or-update replacement)
create policy "organizer updates own event theme assets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-themes' and
    can_manage_theme_path(name)
  )
  with check (
    bucket_id = 'event-themes' and
    can_manage_theme_path(name)
  );

-- delete via Storage API as owner/admin (hosted Supabase blocks direct SQL
-- deletes on storage.objects; the storage API applies these same policies)
create policy "organizer deletes own event theme assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-themes' and
    can_manage_theme_path(name)
  );

-- ══ down (addendum only) ═════════════════════════════════════════════
-- drop policy "organizer deletes own event theme assets" on storage.objects;
-- drop policy "organizer updates own event theme assets" on storage.objects;
-- drop policy "organizer reads own event theme assets" on storage.objects;
-- drop policy "organizer uploads own event theme assets" on storage.objects;
-- drop function can_manage_theme_path(text);
-- delete from storage.buckets where id = 'event-themes';
