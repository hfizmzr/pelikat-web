-- ── FIX SEEDED AUTH USERS token columns ──
-- Follow-up to 074_fix_seed_users_instance_id. The seed inserts also omitted
-- the token columns, leaving them NULL, which GoTrue cannot scan (its user
-- model expects GoTrue-created shape: empty string, never NULL):
--   'Database error finding user' /
--   'sql: Scan error on column index 3, name "confirmation_token":
--    converting NULL to string is unsupported'
-- on the duplicate-email check after instance_id was fixed.
-- Fix: empty-string those string-typed token columns on the seed rows.
-- Idempotent: `is null` guards only touch NULL rows; real GoTrue users
-- already have '' or live tokens and are untouched. Time columns (sent_at,
-- banned_until, last_sign_in_at, invited_at...) are nullable in GoTrue's
-- model and are left NULL — matches real users (verified against a hosted
-- GoTrue-created user).
-- Down: update auth.users set confirmation_token = null, recovery_token =
--   null, email_change_token_new = null, email_change = null,
--   email_change_token_current = null, phone_change_token = null,
--   phone_change = null, reauthentication_token = null
--   where id like 'd0e5e000-%';

update auth.users
set confirmation_token = ''
where id::text like 'd0e5e000%' and confirmation_token is null;  -- up: 18 seed rows

update auth.users
set recovery_token = ''
where id::text like 'd0e5e000%' and recovery_token is null;  -- up: 18

update auth.users
set email_change_token_new = ''
where id::text like 'd0e5e000%' and email_change_token_new is null;  -- up: 18

update auth.users
set email_change_token_current = ''
where id::text like 'd0e5e000%' and email_change_token_current is null;  -- up: 0 (already non-null)

update auth.users
set email_change = ''
where id::text like 'd0e5e000%' and email_change is null;  -- up: 18

update auth.users
set phone_change_token = ''
where id::text like 'd0e5e000%' and phone_change_token is null;  -- up: 0 (already non-null)

update auth.users
set phone_change = ''
where id::text like 'd0e5e000%' and phone_change is null;  -- up: 0 (already non-null)

update auth.users
set reauthentication_token = ''
where id::text like 'd0e5e000%' and reauthentication_token is null;  -- up: 0 (already non-null)
