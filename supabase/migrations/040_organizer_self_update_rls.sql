-- Allow organizers to update their own row (e.g. subscription payment)
-- This is needed for the payment page to set sub_expires_at

create policy "organizer updates own profile" on organizers
  for update
  using (
    id = (auth.jwt() -> 'app_metadata' ->> 'organizer_id')::uuid
  )
  with check (
    id = (auth.jwt() -> 'app_metadata' ->> 'organizer_id')::uuid
  );
