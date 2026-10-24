-- Migration 072: full_name must be a non-empty, >= 2 char (trimmed) name for
-- every ACTIVE (non-deleted) runner profile. Remediates E2E (PR #26) finding:
-- a profile with empty full_name and pdpa_agreed=false could be saved and
-- used for IC uploads.
--
-- NOTE (observed live before writing): one existing active row had
-- full_name = '' (P3 user; created 2026-10-24, test-signup user_id prefix
-- 1e3cd17a). Real user data is NOT mutated here. Therefore the constraint is
-- added NOT VALID: existing rows keep their stored values, but every new
-- INSERT and every UPDATE (including that row's next save) is enforced —
-- repairing the name on save is how the legacy row comes back into
-- compliance. Once the backfill is confirmed, DBA may run:
--   ALTER TABLE runner_profiles VALIDATE CONSTRAINT runner_profiles_active_full_name_check;
-- Web/anon writes stay guarded by migration 070 (untouched here).
--
-- Rollback:
--   ALTER TABLE runner_profiles DROP CONSTRAINT runner_profiles_active_full_name_check;

ALTER TABLE runner_profiles
  ADD CONSTRAINT runner_profiles_active_full_name_check
  CHECK (
    is_deleted
    OR (full_name IS NOT NULL
        AND btrim(full_name) <> ''
        AND char_length(btrim(full_name)) >= 2)
  ) NOT VALID;
