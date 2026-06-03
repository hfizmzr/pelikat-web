-- Add approved_at timestamp to organizers table to track when an organizer was first approved
alter table public.organizers add column if not exists approved_at timestamp with time zone;
