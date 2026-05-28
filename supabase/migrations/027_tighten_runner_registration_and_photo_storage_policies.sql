-- Tighten runner-created registrations and keep tagged race photo reads idempotent.

drop policy if exists "runner inserts own registration" on public.registrations;
drop policy if exists "runner creates own registrations" on public.registrations;

create policy "runner creates own registrations" on public.registrations
  for insert to authenticated with check (
    runner_id = public.my_runner_id()
    and exists (
      select 1
      from public.events e
      where e.id = registrations.event_id
        and e.status = 'published'
    )
    and exists (
      select 1
      from public.race_categories c
      where c.id = registrations.category_id
        and c.event_id = registrations.event_id
    )
  );

drop policy if exists "runner reads tagged race photos" on storage.objects;

create policy "runner reads tagged race photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'race-photos'
    and exists (
      select 1
      from public.photo_tags pt
      where pt.storage_path = storage.objects.name
        and pt.status in ('auto', 'confirmed')
        and pt.runner_id = public.my_runner_id()
    )
  );
