-- ── HELPER FUNCTIONS ──────────────────────────────────────────

-- Read organizer ID from JWT app_metadata (set by Edge Function on login)
create or replace function get_my_organizer_id()
returns uuid language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'organizer_id')::uuid
$$;

-- Check if the caller is a platform admin
create or replace function is_admin()
returns boolean language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
$$;

-- Get the runner_profile id for the currently logged-in user
create or replace function my_runner_id()
returns uuid language sql stable as $$
  select id from runner_profiles where user_id = auth.uid()
$$;
