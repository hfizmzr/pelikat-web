-- ── FIX SEEDED AUTH USERS instance_id ──
-- Root cause: supabase/seed.sql previously inserted auth.users rows without
-- instance_id, so the 18 repo-seeded rows (id prefix d0e5e000-, emails
-- admin1-3/klcityrunners/jbultras/penangpacers/putrajayastriders/borneotrailcrew/
-- runner1-10 @pelikat.test) ended up with instance_id = NULL.
-- Hosted GoTrue filters on instance_id = '00000000-...' on every lookup:
--   - seed-user logins failed with invalid_credentials
--   - admin-API user lookup returned 404
--   - duplicate-email check 500'd ('unable to find user from email identity')
--     on any signup/invite with those emails.
-- Fix: stamp the multi-tenant default instance id on every NULL row.
-- Idempotent: only touches rows where instance_id is null (0 rows once fixed,
-- safe on fresh local DBs).
-- Down: update auth.users set instance_id = null where id like 'd0e5e000-%'
--   (restores the original seed signatur by id prefix; auth.users was only
--   ever NULL on those seed rows).

update auth.users
set instance_id = '00000000-0000-0000-0000-000000000000'::uuid
where instance_id is null;  -- up: 18 seed rows
