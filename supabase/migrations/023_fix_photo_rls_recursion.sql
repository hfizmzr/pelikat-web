-- Prevent recursive RLS checks when photo policies need runner profile lookups.

create or replace function public.my_runner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.runner_profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.organizer_can_read_runner_profile(runner_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.runner_id = runner_profile_id
      and e.organizer_id = public.get_my_organizer_id()
  )
$$;

drop policy if exists "organizer reads event runner profiles" on public.runner_profiles;

create policy "organizer reads event runner profiles" on public.runner_profiles
  for select using (public.organizer_can_read_runner_profile(id));
