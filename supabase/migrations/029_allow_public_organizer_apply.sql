create policy "public can submit organizer application" on organizers
  for insert
  with check (is_active = false);
