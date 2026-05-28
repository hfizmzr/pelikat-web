-- Allow organizers to manually add confirmed tags for their own event photos.

drop policy if exists "organizer inserts own event photos" on public.photo_tags;

create policy "organizer inserts own event photos" on public.photo_tags
  for insert with check (
    event_id in (
      select id
      from public.events
      where organizer_id = public.get_my_organizer_id()
    )
  );
