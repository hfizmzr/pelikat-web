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
