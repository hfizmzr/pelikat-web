create extension if not exists pg_cron;

select cron.schedule(
  'deactivate-expired-organizers',
  '0 0 * * *',
  $$
    update organizers
    set is_active = false
    where sub_expires_at is not null
      and sub_expires_at < now()
      and is_active = true
  $$
);
