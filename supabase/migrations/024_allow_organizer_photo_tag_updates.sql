-- Allow organizers to resolve their own event photo review queue.

drop policy if exists "organizer updates own event photos" on public.photo_tags;

create policy "organizer updates own event photos" on public.photo_tags
  for update using (
    event_id in (
      select id
      from public.events
      where organizer_id = public.get_my_organizer_id()
    )
  )
  with check (
    event_id in (
      select id
      from public.events
      where organizer_id = public.get_my_organizer_id()
    )
  );
