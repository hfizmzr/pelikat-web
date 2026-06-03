-- Add rejected_at timestamp to organizers table for soft-rejecting applicants
alter table public.organizers add column if not exists rejected_at timestamp with time zone;
