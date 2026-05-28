-- Link AI photo tags to registrations/runners.

alter table public.photo_tags
add column if not exists registration_id uuid references public.registrations(id),
add column if not exists runner_id uuid references public.runner_profiles(id);

create index if not exists photo_tags_registration_id_idx
on public.photo_tags (registration_id);

create index if not exists photo_tags_runner_id_idx
on public.photo_tags (runner_id);

create index if not exists photo_tags_event_bib_idx
on public.photo_tags (event_id, bib_number);

create unique index if not exists photo_tags_unique_photo_bib
on public.photo_tags (event_id, storage_path, bib_number)
where bib_number is not null;

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
