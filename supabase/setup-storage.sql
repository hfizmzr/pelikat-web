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
create policy "runner uploads own ic document" on storage.objects
  for insert with check (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "runner reads own ic document" on storage.objects
  for select using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "runner deletes own ic document" on storage.objects
  for delete using (
    bucket_id = 'ic-documents' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
