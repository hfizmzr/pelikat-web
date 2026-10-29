-- ============================================================================
-- pelikat-web — COMPREHENSIVE IDEMPOTENT DATABASE SEEDER
-- ============================================================================
--
-- PURPOSE
--   Seeds a complete, realistic demo dataset for the Pelikat running-event
--   platform: 3 admins, 5 organizers (one per lifecycle state), 10 runners,
--   10 events (past / active / future × physical / virtual), 42 registrations,
--   payments, REPC kit-collection, merch store, run logs, badges, photo tags
--   and audit entries. All UUIDs are FIXED so re-runs are exact no-ops.
--
-- HOW TO RUN
--   Automatic:  `supabase db reset`  (runs migrations 001–068, then this file)
--   Manual:     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--                 -f supabase/seed.sql
--
-- ⚠ WARNINGS
--   • This file is ADDITIVE ONLY — it contains no DROP/TRUNCATE/DELETE and is
--     safe to re-run against an already-seeded database (every insert is
--     `on conflict do nothing` / targeted upsert). Data destruction happens
--     ONLY via `supabase db reset` itself, which wipes the database before
--     re-applying migrations + this seed. Run `db reset` on explicit go-ahead
--     only.
--   • Must run as the `postgres` superuser (bypasses RLS — `payments` and
--     `webhook_events` are FORCE RLS'd with service-role-only write paths).
--   • Seeded LOGIN password for EVERY account: `Pelikat!2026`
--   • The audit triggers (migration 032) fire on these inserts and auto-write
--     `INSERT <table>` rows into audit_log. This is harmless noise; a second
--     re-run does NOT duplicate them (conflicting inserts are skipped before
--     triggers fire) — except §9's inventory upsert, which re-writes rows and
--     adds one noise row per re-run. Harmless.
--   • pg_cron notes: `merch_release_expired_orders` (every minute) cancels
--     pending merch orders past `expires_at` and restocks — the seeded pending
--     orders use `expires_at = now() + 15 min` or NULL and survive.
--     `deactivate-expired-organizers` (daily) matches the seeded org5 state.
--
-- KNOWN GAPS (no schema exists — NOT faked here)
--   • Promo codes / vouchers: no table anywhere in migrations 001–068.
--   • Official PHYSICAL race results: only `events.results_published` (gate)
--     exists; no results table. Physical "results" are represented by
--     registrations + bibs + check-ins; virtual results come from the
--     run_logs-driven `leaderboard_virtual` view.
--
-- SEED ORDER (topological — every FK satisfied by insert order)
--   storage.buckets → auth.users → auth.identities → organizers → events →
--   race_categories → runner_profiles → registrations → event_shirt_inventory
--   → merch_products → merch_variants → merch_orders → merch_order_items →
--   payments + webhook_events → repc_consent_codes → repc_collections →
--   run_logs → runner_streaks fix-up → runner_badges → photo_tags →
--   audit_log → platform_settings
--
-- UUID CONVENTION: all rows use fixed UUIDs
--   'd0e5e000-0000-4000-8000-<12-hex>'  (12-hex ends with a 2-char per-row
--   suffix, unique within each table). audit_log uses '...1000000000NN'.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- §1 STORAGE BUCKETS
--    041 creates ic-documents, 054 creates merch-images. `race-photos` (used
--    by src photo pages) plus photo-gallery / receipts / certificates /
--    avatars only exist in supabase/setup-storage.sql (manual script), so the
--    seeder upserts all of them to make `db reset` + seed fully self-contained.
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values
  ('ic-documents',  'ic-documents',  false),
  ('race-photos',   'race-photos',   false),
  ('photo-gallery', 'photo-gallery', false),
  ('receipts',      'receipts',      false),
  ('certificates',  'certificates',  false),
  ('avatars',       'avatars',       true),
  ('merch-images',  'merch-images',  true)
on conflict (id) do nothing;

-- Event Themes P1: `event-themes` bucket with FULL config (size + mime
-- allowlist). setup-storage.sql is the config authority; this upsert only
-- makes a bare `db reset` + seed self-contained like the buckets above.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-themes', 'event-themes', true,
  10485760,
  array['image/png','image/jpeg','image/webp','font/woff','font/woff2','font/ttf']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ════════════════════════════════════════════════════════════════════════════
-- §2 AUTH USERS  (password for all: Pelikat!2026)
--    Role resolution is via raw_app_meta_data (read by get_my_organizer_id()
--    / is_admin()): admin {"role":"admin"},
--    organizer {"role":"organizer","organizer_id":"<organizers.id>"},
--    runner {"role":"runner"}.
--    email_confirmed_at is always set (guest auto-claim trigger requires it).
-- ★ instance_id: hosted GoTrue filters instance_id = '00000000-…' on every
--    lookup, so every seeded auth.users row MUST include it explicitly.
--    (Pre-074 seed omitted it → 18 NULL rows invisible to hosted GoTrue;
--    migration 074_fix_seed_users_instance_id stamps them.)
--    Trigger note: hosted dev has a Dashboard-created Auth webhook
--    (on_auth_user_created → edge function of the same name, repo-tracked
--    in supabase/functions/on-auth-user-created, deployed v8/v16). Local
--    environments differ (trigger not in repo migrations); the seeding below
--    is explicit precisely so it works in both. Seeding does not drop or
--    bypass the webhook — know that hosted runs will also fire profiles
--    upserts via the function, idempotent on conflict.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Admins ──────────────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   -- ★ GoTrue scan-shape cols: GoTrue-created real users keep token columns as
   -- '' (never NULL); seeding them NULL breaks GoTrue's duplicate-email scan
   -- ('converting NULL to string is unsupported'). See migrations 074 + 075.
   confirmation_token, recovery_token, email_change_token_new, email_change,
   email_change_token_current, phone_change_token, phone_change,
   reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'admin1@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"admin"}', '{"full_name":"Pelikat Admin Satu"}', now() - interval '300 days', now() - interval '300 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'admin2@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"admin"}', '{"full_name":"Pelikat Admin Dua"}', now() - interval '290 days', now() - interval '290 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated',
   'admin3@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"admin"}', '{"full_name":"Pelikat Admin Tiga"}', now() - interval '280 days', now() - interval '280 days', '', '', '', '', '', '', '', '')
on conflict do nothing;

-- ── Organizer identities (login email == organizers.contact_email) ─────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   -- ★ GoTrue scan-shape cols: GoTrue-created real users keep token columns as
   -- '' (never NULL); seeding them NULL breaks GoTrue's duplicate-email scan
   -- ('converting NULL to string is unsupported'). See migrations 074 + 075.
   confirmation_token, recovery_token, email_change_token_new, email_change,
   email_change_token_current, phone_change_token, phone_change,
   reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'klcityrunners@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"organizer","organizer_id":"d0e5e000-0000-4000-8000-000000000011"}',
   '{"full_name":"KL City Runners"}', now() - interval '270 days', now() - interval '270 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated',
   'penangpacers@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"organizer","organizer_id":"d0e5e000-0000-4000-8000-000000000012"}',
   '{"full_name":"Penang Pacers"}', now() - interval '200 days', now() - interval '200 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated',
   'jbultras@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"organizer","organizer_id":"d0e5e000-0000-4000-8000-000000000013"}',
   '{"full_name":"JB Ultras"}', now() - interval '30 days', now() - interval '30 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000b4', 'authenticated', 'authenticated',
   'borneotrailcrew@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"organizer","organizer_id":"d0e5e000-0000-4000-8000-000000000014"}',
   '{"full_name":"Borneo Trail Crew"}', now() - interval '40 days', now() - interval '40 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000b5', 'authenticated', 'authenticated',
   'putrajayastriders@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"organizer","organizer_id":"d0e5e000-0000-4000-8000-000000000015"}',
   '{"full_name":"Putrajaya Striders"}', now() - interval '420 days', now() - interval '420 days', '', '', '', '', '', '', '', '')
on conflict do nothing;

-- ── Runners ─────────────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   -- ★ GoTrue scan-shape cols: GoTrue-created real users keep token columns as
   -- '' (never NULL); seeding them NULL breaks GoTrue's duplicate-email scan
   -- ('converting NULL to string is unsupported'). See migrations 074 + 075.
   confirmation_token, recovery_token, email_change_token_new, email_change,
   email_change_token_current, phone_change_token, phone_change,
   reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated',
   'runner1@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Adam Faizal bin Harun"}', now() - interval '250 days', now() - interval '250 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated',
   'runner2@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Nurul Aisyah binti Zulkifli"}', now() - interval '240 days', now() - interval '240 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated',
   'runner3@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Tan Wei Ming"}', now() - interval '230 days', now() - interval '230 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c4', 'authenticated', 'authenticated',
   'runner4@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Priya Darshini"}', now() - interval '220 days', now() - interval '220 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c5', 'authenticated', 'authenticated',
   'runner5@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Muhammad Hafiz bin Roslan"}', now() - interval '210 days', now() - interval '210 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c6', 'authenticated', 'authenticated',
   'runner6@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Lim Siew Ling"}', now() - interval '200 days', now() - interval '200 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c7', 'authenticated', 'authenticated',
   'runner7@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Ahmad Zulkarnain bin Omar"}', now() - interval '190 days', now() - interval '190 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c8', 'authenticated', 'authenticated',
   'runner8@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Chloe Wong Mei Ling"}', now() - interval '180 days', now() - interval '180 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000c9', 'authenticated', 'authenticated',
   'runner9@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Gopal Krishnan"}', now() - interval '170 days', now() - interval '170 days', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'd0e5e000-0000-4000-8000-0000000000ca', 'authenticated', 'authenticated',
   'runner10@pelikat.test', crypt('Pelikat!2026', gen_salt('bf')), now(),
   '{"role":"runner"}', '{"full_name":"Farah Nadia binti Ahmad"}', now() - interval '160 days', now() - interval '160 days', '', '', '', '', '', '', '', '')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §3 AUTH IDENTITIES  (email provider; sub == user id; ★ (provider_id, sub))
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.identities
  (id, user_id, provider_id, provider, identity_data,
   last_sign_in_at, created_at, updated_at)
values
  ('d0e5e000-0000-4000-8000-0000000000a1', 'd0e5e000-0000-4000-8000-0000000000a1', 'd0e5e000-0000-4000-8000-0000000000a1', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000a1', 'email', 'admin1@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000a2', 'd0e5e000-0000-4000-8000-0000000000a2', 'd0e5e000-0000-4000-8000-0000000000a2', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000a2', 'email', 'admin2@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000a3', 'd0e5e000-0000-4000-8000-0000000000a3', 'd0e5e000-0000-4000-8000-0000000000a3', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000a3', 'email', 'admin3@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000b1', 'd0e5e000-0000-4000-8000-0000000000b1', 'd0e5e000-0000-4000-8000-0000000000b1', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000b1', 'email', 'klcityrunners@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000b2', 'd0e5e000-0000-4000-8000-0000000000b2', 'd0e5e000-0000-4000-8000-0000000000b2', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000b2', 'email', 'penangpacers@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000b3', 'd0e5e000-0000-4000-8000-0000000000b3', 'd0e5e000-0000-4000-8000-0000000000b3', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000b3', 'email', 'jbultras@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000b4', 'd0e5e000-0000-4000-8000-0000000000b4', 'd0e5e000-0000-4000-8000-0000000000b4', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000b4', 'email', 'borneotrailcrew@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000b5', 'd0e5e000-0000-4000-8000-0000000000b5', 'd0e5e000-0000-4000-8000-0000000000b5', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000b5', 'email', 'putrajayastriders@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c1', 'd0e5e000-0000-4000-8000-0000000000c1', 'd0e5e000-0000-4000-8000-0000000000c1', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c1', 'email', 'runner1@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c2', 'd0e5e000-0000-4000-8000-0000000000c2', 'd0e5e000-0000-4000-8000-0000000000c2', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c2', 'email', 'runner2@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c3', 'd0e5e000-0000-4000-8000-0000000000c3', 'd0e5e000-0000-4000-8000-0000000000c3', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c3', 'email', 'runner3@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c4', 'd0e5e000-0000-4000-8000-0000000000c4', 'd0e5e000-0000-4000-8000-0000000000c4', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c4', 'email', 'runner4@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c5', 'd0e5e000-0000-4000-8000-0000000000c5', 'd0e5e000-0000-4000-8000-0000000000c5', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c5', 'email', 'runner5@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c6', 'd0e5e000-0000-4000-8000-0000000000c6', 'd0e5e000-0000-4000-8000-0000000000c6', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c6', 'email', 'runner6@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c7', 'd0e5e000-0000-4000-8000-0000000000c7', 'd0e5e000-0000-4000-8000-0000000000c7', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c7', 'email', 'runner7@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c8', 'd0e5e000-0000-4000-8000-0000000000c8', 'd0e5e000-0000-4000-8000-0000000000c8', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c8', 'email', 'runner8@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000c9', 'd0e5e000-0000-4000-8000-0000000000c9', 'd0e5e000-0000-4000-8000-0000000000c9', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000c9', 'email', 'runner9@pelikat.test', 'email_verified', true),
   now(), now(), now()),
  ('d0e5e000-0000-4000-8000-0000000000ca', 'd0e5e000-0000-4000-8000-0000000000ca', 'd0e5e000-0000-4000-8000-0000000000ca', 'email',
   jsonb_build_object('sub', 'd0e5e000-0000-4000-8000-0000000000ca', 'email', 'runner10@pelikat.test', 'email_verified', true),
   now(), now(), now())
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §4 ORGANIZERS  (one per lifecycle state; ★ slug + contact_email unique)
--    11 KL City Runners     active + approved + paid subscription
--    12 Penang Pacers       active + approved, subscription expiring in 12d
--    13 JB Ultras           pending approval (approved_at NULL)
--    14 Borneo Trail Crew   rejected (rejected_at set, inactive)
--    15 Putrajaya Striders  lapsed subscription → inactive
-- ════════════════════════════════════════════════════════════════════════════
insert into public.organizers
  (id, name, slug, contact_email, is_active, approved_at, rejected_at, sub_expires_at, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000011', 'KL City Runners', 'kl-city-runners',
   'klcityrunners@pelikat.test', true, now() - interval '210 days', null, now() + interval '155 days', now() - interval '215 days'),
  ('d0e5e000-0000-4000-8000-000000000012', 'Penang Pacers', 'penang-pacers',
   'penangpacers@pelikat.test', true, now() - interval '115 days', null, now() + interval '12 days', now() - interval '120 days'),
  ('d0e5e000-0000-4000-8000-000000000013', 'JB Ultras', 'jb-ultras',
   'jbultras@pelikat.test', true, null, null, null, now() - interval '30 days'),
  ('d0e5e000-0000-4000-8000-000000000014', 'Borneo Trail Crew', 'borneo-trail-crew',
   'borneotrailcrew@pelikat.test', false, null, now() - interval '20 days', null, now() - interval '40 days'),
  ('d0e5e000-0000-4000-8000-000000000015', 'Putrajaya Striders', 'putrajaya-striders',
   'putrajayastriders@pelikat.test', false, now() - interval '400 days', null, now() - interval '65 days', now() - interval '410 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §5 EVENTS  (10 — no unique key exists, fixed UUIDs make re-runs idempotent)
--    PAST   : 21 physical (closed, results published), 22 virtual (closed)
--    ACTIVE : 23/24 physical (published, REPC + reg windows), 25/26 virtual
--    FUTURE : 27/28 physical (published, reg open), 29/2a virtual (published)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.events
  (id, organizer_id, name, description, event_date, location, status,
   event_type, target_distance_km, reg_open, reg_close, results_published, created_at)
values
  -- ── PAST ──
  ('d0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   'KL City Night Run 2026',
   'Flagship 10K night run around Dataran Merdeka. Completed, results published.',
   current_date - 45, 'Dataran Merdeka, Kuala Lumpur', 'closed',
   'physical', null, now() - interval '75 days', now() - interval '50 days', true, now() - interval '90 days'),
  ('d0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000012',
   'Merdeka Virtual Run Challenge',
   'Run 42 km anywhere in Malaysia within the challenge window. Completed.',
   current_date - 20, null, 'closed',
   'virtual', 42.00, now() - interval '70 days', now() - interval '25 days', true, now() - interval '85 days'),
  -- ── ACTIVE ──
  ('d0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011',
   'Putrajaya Heritage Half Marathon',
   'Half marathon + 10K through Putrajaya heritage quarters. Race is tomorrow — REPC kit collection in progress.',
   current_date + 1, 'Dataran Putrajaya, Presint 3', 'published',
   'physical', null, now() - interval '20 days', now() + interval '18 hours', false, now() - interval '60 days'),
  ('d0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000012',
   'Cyberjaya Green Run',
   'Eco-themed 10K and 3K kids run. Registration open.',
   current_date + 30, 'Cyberjaya Lake Gardens', 'published',
   'physical', null, now() - interval '5 days', current_date + 23, false, now() - interval '50 days'),
  ('d0e5e000-0000-4000-8000-000000000025', 'd0e5e000-0000-4000-8000-000000000011',
   'Virtual 60K Straits Challenge',
   'Log 60 km anywhere before the window closes. In progress.',
   current_date + 25, null, 'published',
   'virtual', 60.00, now() - interval '15 days', now() + interval '25 days', false, now() - interval '40 days'),
  ('d0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-000000000012',
   'Virtual 21K Speed Challenge',
   'Complete 21.1 km within two weeks. In progress.',
   current_date + 14, null, 'published',
   'virtual', 21.10, now() - interval '12 days', now() + interval '14 days', false, now() - interval '35 days'),
  -- ── FUTURE ──
  ('d0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-000000000011',
   'JB Ultra Marathon 2027',
   'Full + half marathon in Johor Bahru. Registration window open.',
   current_date + 120, 'Dataran Bandaraya Johor Bahru', 'published',
   'physical', null, now() - interval '2 days', current_date + 100, false, now() - interval '30 days'),
  ('d0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000012',
   'Borneo Highland Trail Festival',
   'Trail 30K and 15K in the Crocker Range. Registration window open.',
   current_date + 150, 'Penampang, Sabah', 'published',
   'physical', null, now() - interval '1 day', current_date + 135, false, now() - interval '25 days'),
  ('d0e5e000-0000-4000-8000-000000000029', 'd0e5e000-0000-4000-8000-000000000011',
   '100K New Year Virtual Challenge',
   'Log 100 km to welcome the new year. Milestone badges planned.',
   current_date + 75, null, 'published',
   'virtual', 100.00, now() - interval '1 day', current_date + 75, false, now() - interval '20 days'),
  ('d0e5e000-0000-4000-8000-00000000002a', 'd0e5e000-0000-4000-8000-000000000012',
   '30K Streak & Stride Virtual',
   'Log 30 km across at least 10 activities. Milestone badges planned.',
   current_date + 40, null, 'published',
   'virtual', 30.00, now() - interval '1 day', current_date + 40, false, now() - interval '18 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §6 RACE CATEGORIES
--    Bib format mimics allocate_bib(): bib_prefix || lpad(seq, width) where
--    width = digits of (bib_start + max_slots - 1). Every seeded bib below
--    matches that format. Bibs are unique per EVENT.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.race_categories
  (id, event_id, organizer_id, name, gender, min_age, max_age, bib_prefix, bib_start, max_slots, price)
values
  -- E1 KL City Night Run (past physical)
  ('d0e5e000-0000-4000-8000-000000000031', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   '10K Competitive', null, null, null, 'N10-', 1, 500, 55.00),   -- N10-001..N10-500
  ('d0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   '5K Fun Run', null, null, null, 'N05-', 1, 300, 35.00),        -- N05-001..N05-300
  -- E2 Merdeka Virtual (past virtual — no bibs)
  ('d0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000012',
   '42K Virtual Full', null, null, null, null, 1, 1000, 25.00),
  -- E3 Putrajaya Half (active physical)
  ('d0e5e000-0000-4000-8000-000000000034', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011',
   '21K Individual', null, 16, null, 'PH21-', 1, 800, 95.00),     -- PH21-001..PH21-800
  ('d0e5e000-0000-4000-8000-000000000035', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011',
   '10K Open', null, 13, null, 'PH10-', 1, 400, 65.00),           -- PH10-001..PH10-400
  ('d0e5e000-0000-4000-8000-000000000036', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011',
   'VIP Invitation', null, null, null, 'PHV-', 1, 50, 0.00),      -- PHV-01..PHV-50
  -- E4 Cyberjaya Green Run (active physical — early-bird vs standard tier, free kids)
  ('d0e5e000-0000-4000-8000-000000000037', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000012',
   '10K Early Bird', null, null, null, 'CG10-', 1, 200, 49.00),   -- CG10-001..CG10-200
  ('d0e5e000-0000-4000-8000-000000000038', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000012',
   '10K Standard', null, null, null, 'CG10-', 201, 400, 65.00),   -- CG10-201..CG10-600
  ('d0e5e000-0000-4000-8000-000000000039', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000012',
   '3K Kids (Free)', null, 5, 12, 'CGK-', 1, 100, 0.00),          -- CGK-001..CGK-100
  -- E5 / E6 (active virtual)
  ('d0e5e000-0000-4000-8000-00000000003a', 'd0e5e000-0000-4000-8000-000000000025', 'd0e5e000-0000-4000-8000-000000000011',
   '60K Challenge', null, null, null, null, 1, 500, 40.00),
  ('d0e5e000-0000-4000-8000-00000000003b', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-000000000012',
   '21.1K Challenge', null, null, null, null, 1, 500, 30.00),
  -- E7 JB Ultra (future physical — HitPay paid + pacer comp)
  ('d0e5e000-0000-4000-8000-00000000003c', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-000000000011',
   'Full Marathon', null, 18, null, 'JBM-', 1, 1000, 129.00),     -- JBM-0001..JBM-1000
  ('d0e5e000-0000-4000-8000-00000000003d', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-000000000011',
   'Half Marathon', null, 16, null, 'JBH-', 1, 800, 89.00),       -- JBH-001..JBH-800
  ('d0e5e000-0000-4000-8000-00000000003e', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-000000000011',
   'Official Pacer', null, null, null, 'JBP-', 1, 30, 0.00),      -- JBP-01..JBP-30
  -- E8 Borneo Trail (future physical)
  ('d0e5e000-0000-4000-8000-00000000003f', 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000012',
   'Trail 30K', null, 18, null, 'BT30-', 1, 300, 149.00),         -- BT30-001..BT30-300
  ('d0e5e000-0000-4000-8000-000000000041', 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000012',
   'Trail 15K', null, 16, null, 'BT15-', 1, 500, 99.00),          -- BT15-001..BT15-500
  ('d0e5e000-0000-4000-8000-000000000042', 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000012',
   'VIP Guest', null, null, null, 'BTV-', 1, 40, 0.00),           -- BTV-01..BTV-40
  -- E9 / E10 (future virtual)
  ('d0e5e000-0000-4000-8000-000000000043', 'd0e5e000-0000-4000-8000-000000000029', 'd0e5e000-0000-4000-8000-000000000011',
   '100K Virtual Challenge', null, null, null, null, 1, 300, 55.00),
  ('d0e5e000-0000-4000-8000-000000000044', 'd0e5e000-0000-4000-8000-00000000002a', 'd0e5e000-0000-4000-8000-000000000012',
   '30K Virtual Streak', null, null, null, null, 1, 300, 35.00)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §7 RUNNER PROFILES  (one per runner auth user; ★ user_id unique anchor)
--    Inserted BEFORE registrations so the claim_guest_registrations trigger
--    fires on an empty registrations table (no accidental auto-claims).
--    NOTE (migration 070): ic_encrypted / ic_document_* are deliberately NOT
--    seeded — no ic-documents objects are seeded either, so the ic-doc proxy
--    gate stays consistently closed. Do not add fake IC columns here: the
--    070 guard silently NULLs them on non-privileged INSERT, and a seeded
--    ic_document_path without a real .enc object would break the proxy flow.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.runner_profiles
  (id, user_id, full_name, phone, dob, gender, t_shirt_size, pdpa_agreed,
   emergency_contact_name, emergency_contact_phone, is_deleted, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-0000000000c1',
   'Adam Faizal bin Harun', '+6012-2013456', '1990-03-14', 'M', 'M', true,
   'Salmah binti Idris', '+6012-3014567', false, now() - interval '250 days'),
  ('d0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-0000000000c2',
   'Nurul Aisyah binti Zulkifli', '+6013-2024567', '1993-07-22', 'F', 'S', true,
   'Zulkifli bin Hassan', '+6013-3025678', false, now() - interval '240 days'),
  ('d0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-0000000000c3',
   'Tan Wei Ming', '+6016-2035678', '1985-11-02', 'M', 'L', true,
   'Tan Ah Kow', '+6016-3036789', false, now() - interval '230 days'),
  ('d0e5e000-0000-4000-8000-000000000054', 'd0e5e000-0000-4000-8000-0000000000c4',
   'Priya Darshini', '+6017-2046789', '1996-01-30', 'F', 'XS', true,
   'Rajesh Kumar', '+6017-3047890', false, now() - interval '220 days'),
  ('d0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-0000000000c5',
   'Muhammad Hafiz bin Roslan', '+6018-2057890', '2000-09-18', 'M', 'XL', true,
   'Roslan bin Mat Amin', '+6018-3058901', false, now() - interval '210 days'),
  ('d0e5e000-0000-4000-8000-000000000056', 'd0e5e000-0000-4000-8000-0000000000c6',
   'Lim Siew Ling', '+6019-2068901', '1988-05-09', 'F', 'XXL', true,
   'Lim Chong Wei', '+6019-3069012', false, now() - interval '200 days'),
  ('d0e5e000-0000-4000-8000-000000000057', 'd0e5e000-0000-4000-8000-0000000000c7',
   'Ahmad Zulkarnain bin Omar', '+6012-2079012', '1978-02-14', 'M', 'M', true,
   'Omar bin Sharif', '+6012-3070123', false, now() - interval '190 days'),
  ('d0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-0000000000c8',
   'Chloe Wong Mei Ling', '+6013-2080123', '2001-12-05', 'F', 'S', true,
   'Wong Kah Seng', '+6013-3081234', false, now() - interval '180 days'),
  ('d0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-0000000000c9',
   'Gopal Krishnan', '+6016-2091234', '1992-08-27', 'M', 'M', true,
   'Krishnan s/o Muthu', '+6016-3092345', false, now() - interval '170 days'),
  ('d0e5e000-0000-4000-8000-00000000005a', 'd0e5e000-0000-4000-8000-0000000000ca',
   'Farah Nadia binti Ahmad', '+6017-2102345', '1995-04-11', 'F', 'M', true,
   'Ahmad bin Zaid', '+6017-3103456', false, now() - interval '160 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §8 REGISTRATIONS  (42 rows)
--    Anchors: fixed ids; UNIQUE(event_id,bib_number), UNIQUE(event_id,runner_id),
--    partial UNIQUE(event_id,lower(guest_email)) WHERE runner_id IS NULL.
--    Payment-first flow mirrored: pending rows have bib_number NULL.
--    Virtual events: bib_number NULL (allocate_bib skips virtual).
--    Waived comps: claimed = runner_id set + guest_* NULL; unclaimed =
--    runner_id NULL + guest_name/guest_email (some email-less).
-- ════════════════════════════════════════════════════════════════════════════

-- ── E1 KL City Night Run (past, closed, results published) ─────────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000061', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000031', 'd0e5e000-0000-4000-8000-000000000011', 'N10-001', 'paid',     'runner', true,  (current_date - 45)::timestamptz + interval '20 hours', null, null, null, now() - interval '70 days'),
  ('d0e5e000-0000-4000-8000-000000000062', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000031', 'd0e5e000-0000-4000-8000-000000000011', 'N10-002', 'paid',     'runner', true,  (current_date - 45)::timestamptz + interval '20 hours', null, null, null, now() - interval '69 days'),
  ('d0e5e000-0000-4000-8000-000000000063', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000031', 'd0e5e000-0000-4000-8000-000000000011', 'N10-003', 'paid',     'runner', true,  (current_date - 45)::timestamptz + interval '21 hours', null, null, null, now() - interval '68 days'),
  ('d0e5e000-0000-4000-8000-000000000064', 'd0e5e000-0000-4000-8000-000000000054', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-001', 'paid',     'runner', true,  (current_date - 45)::timestamptz + interval '21 hours', null, null, null, now() - interval '67 days'),
  ('d0e5e000-0000-4000-8000-000000000065', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-002', 'paid',     'runner', true,  (current_date - 45)::timestamptz + interval '22 hours', null, null, null, now() - interval '66 days'),
  ('d0e5e000-0000-4000-8000-000000000066', 'd0e5e000-0000-4000-8000-000000000056', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-003', 'refunded', 'runner', false, null, null, null, null, now() - interval '65 days'),
  -- complimentary: unclaimed pacer (with email) / unclaimed email-less VIP / claimed VIP
  ('d0e5e000-0000-4000-8000-000000000067', null, 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-004', 'waived', 'pacer', false, null, 'Danial Haqim (Official Pacer)', 'pacer.danial@pelikat.test', '+6011-1110001', now() - interval '60 days'),
  ('d0e5e000-0000-4000-8000-000000000068', null, 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-005', 'waived', 'vip',   false, null, 'YB Tuan Lim (VIP)', null, null, now() - interval '60 days'),
  ('d0e5e000-0000-4000-8000-000000000069', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000032', 'd0e5e000-0000-4000-8000-000000000011', 'N05-006', 'waived', 'vip',   true,  (current_date - 45)::timestamptz + interval '22 hours', null, null, null, now() - interval '59 days')
on conflict do nothing;

-- ── E3 Putrajaya Heritage Half (active physical, REPC in progress) ─────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-00000000006a', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000034', 'd0e5e000-0000-4000-8000-000000000011', 'PH21-001', 'paid',   'runner', true,  now() - interval '2 hours', null, null, null, now() - interval '18 days'),
  ('d0e5e000-0000-4000-8000-00000000006b', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000034', 'd0e5e000-0000-4000-8000-000000000011', 'PH21-002', 'paid',   'runner', false, null, null, null, null, now() - interval '17 days'),
  ('d0e5e000-0000-4000-8000-00000000006c', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000034', 'd0e5e000-0000-4000-8000-000000000011', 'PH21-003', 'paid',   'runner', true,  now() - interval '5 hours', null, null, null, now() - interval '16 days'),
  ('d0e5e000-0000-4000-8000-00000000006d', 'd0e5e000-0000-4000-8000-000000000054', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000035', 'd0e5e000-0000-4000-8000-000000000011', 'PH10-001', 'paid',   'runner', false, null, null, null, null, now() - interval '15 days'),
  ('d0e5e000-0000-4000-8000-00000000006e', 'd0e5e000-0000-4000-8000-000000000057', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000036', 'd0e5e000-0000-4000-8000-000000000011', 'PHV-01',   'waived', 'vip',    false, null, null, null, null, now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-00000000006f', null, 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000035', 'd0e5e000-0000-4000-8000-000000000011', 'PH10-002', 'waived', 'pacer',  false, null, 'Wani Zainal (Pacer)', 'pacer.wani@pelikat.test', '+6012-3344556', now() - interval '12 days'),
  ('d0e5e000-0000-4000-8000-000000000070', null, 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000036', 'd0e5e000-0000-4000-8000-000000000011', 'PHV-02',   'waived', 'vip',    false, null, 'Hamba Allah (VIP Guest)', null, null, now() - interval '12 days')
on conflict do nothing;

-- ── E4 Cyberjaya Green Run (active physical — early-bird / standard / free) ─
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000071', 'd0e5e000-0000-4000-8000-000000000056', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000037', 'd0e5e000-0000-4000-8000-000000000012', 'CG10-001', 'paid',   'runner', false, null, null, null, null, now() - interval '4 days'),
  ('d0e5e000-0000-4000-8000-000000000072', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000037', 'd0e5e000-0000-4000-8000-000000000012', 'CG10-002', 'paid',   'runner', false, null, null, null, null, now() - interval '4 days'),
  -- pending payment → bib not yet allocated (payment-first flow)
  ('d0e5e000-0000-4000-8000-000000000073', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000038', 'd0e5e000-0000-4000-8000-000000000012', null,       'pending','runner', false, null, null, null, null, now() - interval '2 days'),
  -- free category → waived, no payment row
  ('d0e5e000-0000-4000-8000-000000000074', 'd0e5e000-0000-4000-8000-00000000005a', 'd0e5e000-0000-4000-8000-000000000024', 'd0e5e000-0000-4000-8000-000000000039', 'd0e5e000-0000-4000-8000-000000000012', 'CGK-001',  'waived', 'runner', false, null, null, null, null, now() - interval '3 days')
on conflict do nothing;

-- ── E7 JB Ultra (future physical — reg window open) ─────────────────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000075', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-00000000003c', 'd0e5e000-0000-4000-8000-000000000011', 'JBM-0001', 'paid',    'runner', false, null, null, null, null, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-000000000076', 'd0e5e000-0000-4000-8000-000000000054', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-00000000003d', 'd0e5e000-0000-4000-8000-000000000011', null,       'pending', 'runner', false, null, null, null, null, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-000000000077', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-00000000003e', 'd0e5e000-0000-4000-8000-000000000011', 'JBP-01',   'waived',  'pacer',  false, null, null, null, null, now() - interval '20 hours'),
  ('d0e5e000-0000-4000-8000-000000000078', null, 'd0e5e000-0000-4000-8000-000000000027', 'd0e5e000-0000-4000-8000-00000000003e', 'd0e5e000-0000-4000-8000-000000000011', 'JBP-02',   'waived',  'vip',    false, null, 'Tuan Syed (VIP)', 'vip.syed@pelikat.test', '+6019-4455667', now() - interval '18 hours')
on conflict do nothing;

-- ── E8 Borneo Highland Trail (future physical — reg window open) ────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000079', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-00000000003f', 'd0e5e000-0000-4000-8000-000000000012', 'BT30-001', 'paid',   'runner', false, null, null, null, null, now() - interval '20 hours'),
  ('d0e5e000-0000-4000-8000-00000000007a', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000041', 'd0e5e000-0000-4000-8000-000000000012', 'BT15-001', 'paid',   'runner', false, null, null, null, null, now() - interval '16 hours'),
  ('d0e5e000-0000-4000-8000-00000000007b', null, 'd0e5e000-0000-4000-8000-000000000028', 'd0e5e000-0000-4000-8000-000000000041', 'd0e5e000-0000-4000-8000-000000000012', 'BT15-002', 'waived', 'pacer',  false, null, 'Krew Sukarela Borneo', null, null, now() - interval '10 hours')
on conflict do nothing;

-- ── E5 / E6 active virtuals (progress ~25% / ~60% / ~100%) ──────────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-00000000007c', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000025', 'd0e5e000-0000-4000-8000-00000000003a', 'd0e5e000-0000-4000-8000-000000000011', null, 'paid', 'runner', false, null, null, null, null, now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-00000000007d', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000025', 'd0e5e000-0000-4000-8000-00000000003a', 'd0e5e000-0000-4000-8000-000000000011', null, 'paid', 'runner', false, null, null, null, null, now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-00000000007e', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000025', 'd0e5e000-0000-4000-8000-00000000003a', 'd0e5e000-0000-4000-8000-000000000011', null, 'paid', 'runner', false, null, null, null, null, now() - interval '13 days'),
  ('d0e5e000-0000-4000-8000-00000000007f', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-00000000003b', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '11 days'),
  ('d0e5e000-0000-4000-8000-000000000080', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-00000000003b', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '10 days'),
  ('d0e5e000-0000-4000-8000-000000000081', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-00000000003b', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '10 days')
on conflict do nothing;

-- ── E2 Merdeka Virtual (past, closed) ───────────────────────────────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000082', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '65 days'),
  ('d0e5e000-0000-4000-8000-000000000083', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '64 days'),
  ('d0e5e000-0000-4000-8000-000000000084', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '63 days'),
  ('d0e5e000-0000-4000-8000-000000000085', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '62 days'),
  ('d0e5e000-0000-4000-8000-000000000086', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022', 'd0e5e000-0000-4000-8000-000000000033', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '61 days')
on conflict do nothing;

-- ── E9 / E10 future virtuals (registered, 0% progress) ──────────────────────
insert into public.registrations
  (id, runner_id, event_id, category_id, organizer_id, bib_number, payment_status,
   registration_role, checked_in, checked_in_at, guest_name, guest_email, guest_phone, created_at)
values
  ('d0e5e000-0000-4000-8000-000000000087', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000029', 'd0e5e000-0000-4000-8000-000000000043', 'd0e5e000-0000-4000-8000-000000000011', null, 'paid', 'runner', false, null, null, null, null, now() - interval '20 hours'),
  ('d0e5e000-0000-4000-8000-000000000088', 'd0e5e000-0000-4000-8000-000000000056', 'd0e5e000-0000-4000-8000-000000000029', 'd0e5e000-0000-4000-8000-000000000043', 'd0e5e000-0000-4000-8000-000000000011', null, 'paid', 'runner', false, null, null, null, null, now() - interval '16 hours'),
  ('d0e5e000-0000-4000-8000-000000000089', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-00000000002a', 'd0e5e000-0000-4000-8000-000000000044', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '15 hours'),
  ('d0e5e000-0000-4000-8000-00000000008a', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-00000000002a', 'd0e5e000-0000-4000-8000-000000000044', 'd0e5e000-0000-4000-8000-000000000012', null, 'paid', 'runner', false, null, null, null, null, now() - interval '14 hours')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §9 EVENT SHIRT INVENTORY  (upsert on ★ (event_id,size))
--    Migration 028's auto-seed was a one-time backfill INSERT, NOT a trigger —
--    fresh events get NO inventory rows automatically, so the seeder creates
--    them. claimed_qty is left untouched by the upsert (set by kit collection).
--    claimed ≤ initial, consistent with §16 repc_collections:
--      E1 claimed: XS1 S2 M1 L1 XL1   E3 claimed: M1 L1
-- ════════════════════════════════════════════════════════════════════════════
insert into public.event_shirt_inventory (id, event_id, organizer_id, size, initial_qty, claimed_qty)
values
  ('d0e5e000-0000-4000-8000-000000000081', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'XS',  50,  1),
  ('d0e5e000-0000-4000-8000-000000000082', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'S',   100, 2),
  ('d0e5e000-0000-4000-8000-000000000083', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'M',   120, 1),
  ('d0e5e000-0000-4000-8000-000000000084', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'L',   100, 1),
  ('d0e5e000-0000-4000-8000-000000000085', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'XL',  60,  1),
  ('d0e5e000-0000-4000-8000-000000000086', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'XXL', 30,  0),
  ('d0e5e000-0000-4000-8000-000000000079', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'XS',  30,  0),
  ('d0e5e000-0000-4000-8000-00000000007a', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'S',   80,  0),
  ('d0e5e000-0000-4000-8000-00000000007b', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'M',   100, 1),
  ('d0e5e000-0000-4000-8000-00000000007c', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'L',   100, 1),
  ('d0e5e000-0000-4000-8000-00000000007d', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'XL',  50,  0),
  ('d0e5e000-0000-4000-8000-00000000007e', 'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000011', 'XXL', 20,  0)
on conflict (event_id, size) do update
  set initial_qty  = excluded.initial_qty,
      organizer_id = excluded.organizer_id;

-- ════════════════════════════════════════════════════════════════════════════
-- §10 MERCH PRODUCTS  (E1 physical + E6 virtual — merch on both event types)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.merch_products
  (id, event_id, organizer_id, name, description, price, is_active, image_path, low_stock_threshold, created_at)
values
  ('d0e5e000-0000-4000-8000-0000000000ad', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   'KL Night Run Finisher Tee', 'Cotton finisher tee with glow-print logo.', 45.00, true,
   'd0e5e000-0000-4000-8000-000000000011/d0e5e000-0000-4000-8000-000000000021/finisher-tee.png', 5, now() - interval '80 days'),
  ('d0e5e000-0000-4000-8000-0000000000ae', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   'Night Run Singlet', 'Lightweight race singlet.', 55.00, true,
   'd0e5e000-0000-4000-8000-000000000011/d0e5e000-0000-4000-8000-000000000021/singlet.png', 5, now() - interval '80 days'),
  ('d0e5e000-0000-4000-8000-0000000000af', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011',
   'Finisher Medal Engraving', 'Personalised laser engraving on your finisher medal (one SKU, no size/colour).', 15.00, true,
   'd0e5e000-0000-4000-8000-000000000011/d0e5e000-0000-4000-8000-000000000021/engraving.png', 10, now() - interval '80 days'),
  ('d0e5e000-0000-4000-8000-0000000000b0', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-000000000012',
   'Virtual 21K Finisher Tee', 'Heather-grey finisher tee for the virtual challenge.', 40.00, true,
   'd0e5e000-0000-4000-8000-000000000012/d0e5e000-0000-4000-8000-000000000026/virtual-tee.png', 5, now() - interval '33 days'),
  ('d0e5e000-0000-4000-8000-0000000000b1', 'd0e5e000-0000-4000-8000-000000000026', 'd0e5e000-0000-4000-8000-000000000012',
   'Run Cap', 'Breathable running cap (one size).', 25.00, true,
   'd0e5e000-0000-4000-8000-000000000012/d0e5e000-0000-4000-8000-000000000026/run-cap.png', 5, now() - interval '33 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §11 MERCH VARIANTS  (★ (product_id, coalesce(size,''), coalesce(color,'')))
--      stock states: healthy / LOW below threshold (S=3, L=2) / SOLD OUT (0)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.merch_variants (id, product_id, size, color, stock)
values
  ('d0e5e000-0000-4000-8000-0000000000b2', 'd0e5e000-0000-4000-8000-0000000000ad', 'M',   'Navy',  20),
  ('d0e5e000-0000-4000-8000-0000000000b3', 'd0e5e000-0000-4000-8000-0000000000ad', 'S',   'Navy',  3),    -- LOW (threshold 5)
  ('d0e5e000-0000-4000-8000-0000000000b4', 'd0e5e000-0000-4000-8000-0000000000ad', 'XL',  'Navy',  0),    -- SOLD OUT
  ('d0e5e000-0000-4000-8000-0000000000b5', 'd0e5e000-0000-4000-8000-0000000000ae', 'M',   'Black', 10),
  ('d0e5e000-0000-4000-8000-0000000000b6', 'd0e5e000-0000-4000-8000-0000000000ae', 'S',   'Pink',  8),
  ('d0e5e000-0000-4000-8000-0000000000b7', 'd0e5e000-0000-4000-8000-0000000000af', null,  null,    25),   -- one-SKU (size/color NULL)
  ('d0e5e000-0000-4000-8000-0000000000b8', 'd0e5e000-0000-4000-8000-0000000000b0', 'M',   'Grey',  15),
  ('d0e5e000-0000-4000-8000-0000000000b9', 'd0e5e000-0000-4000-8000-0000000000b0', 'L',   'Grey',  2),    -- LOW
  ('d0e5e000-0000-4000-8000-0000000000ba', 'd0e5e000-0000-4000-8000-0000000000b0', 'XXL', 'Grey',  7),
  ('d0e5e000-0000-4000-8000-0000000000bb', 'd0e5e000-0000-4000-8000-0000000000b1', null,  'Black', 12),   -- one-size (size NULL)
  ('d0e5e000-0000-4000-8000-0000000000c0', 'd0e5e000-0000-4000-8000-0000000000b1', null,  'Red',   0)     -- SOLD OUT
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §12 MERCH ORDERS  (★ order_number unique; explicit 'PM-SEEDxxx' values —
--      the 'PM-'||sequence default is left untouched. pending: one reserved
--      (expires_at = now()+15 min — the pg_cron releaser only cancels PAST
--      expires_at) and one unreserved (expires_at NULL). Unpaid orders carry
--      no payment_ref (partial unique index).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.merch_orders
  (id, runner_id, organizer_id, event_id, total_amount, status, order_number,
   payment_ref, payment_method, expires_at, paid_at, ready_at, collected_at,
   cancelled_at, cancel_reason, created_at, updated_at)
values
  -- E1 (org1)
  ('d0e5e000-0000-4000-8000-0000000000bc', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000021',
   60.00, 'collected', 'PM-SEED001', 'seed-merch-pay-001', 'fpx', null,
   now() - interval '42 days', now() - interval '41 days', now() - interval '39 days', null, null, now() - interval '42 days', now() - interval '39 days'),
  ('d0e5e000-0000-4000-8000-0000000000bd', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000021',
   55.00, 'ready', 'PM-SEED002', 'seed-merch-pay-002', 'card', null,
   now() - interval '40 days', now() - interval '40 days', now() - interval '10 days', null, null, now() - interval '40 days', now() - interval '10 days'),
  ('d0e5e000-0000-4000-8000-0000000000be', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000021',
   15.00, 'confirmed', 'PM-SEED003', 'seed-merch-pay-003', 'fpx', null,
   now() - interval '8 days', now() - interval '8 days', null, null, null, now() - interval '8 days', now() - interval '8 days'),
  ('d0e5e000-0000-4000-8000-0000000000bf', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000021',
   45.00, 'cancelled', 'PM-SEED004', null, null, null,
   null, null, null, now() - interval '7 days', 'cancelled_by_runner', now() - interval '8 days', now() - interval '7 days'),
  -- E6 (org2)
  ('d0e5e000-0000-4000-8000-0000000000c1', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000012', 'd0e5e000-0000-4000-8000-000000000026',
   25.00, 'pending', 'PM-SEED005', null, 'fpx', now() + interval '15 minutes',
   null, null, null, null, null, now() - interval '5 minutes', now() - interval '5 minutes'),
  ('d0e5e000-0000-4000-8000-0000000000c2', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000012', 'd0e5e000-0000-4000-8000-000000000026',
   40.00, 'pending', 'PM-SEED006', null, null, null,
   null, null, null, null, null, now() - interval '2 days', now() - interval '2 days'),
  ('d0e5e000-0000-4000-8000-0000000000c3', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000012', 'd0e5e000-0000-4000-8000-000000000026',
   80.00, 'cancelled', 'PM-SEED007', null, null, null,
   null, null, null, now() - interval '1 day', 'expired', now() - interval '2 days', now() - interval '1 day')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §13 MERCH ORDER ITEMS  (snapshot columns product_name / variant_label filled
--      exactly as merch_checkout() writes them)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.merch_order_items
  (id, order_id, variant_id, quantity, unit_price, product_name, variant_label)
values
  ('d0e5e000-0000-4000-8000-0000000000c4', 'd0e5e000-0000-4000-8000-0000000000bc', 'd0e5e000-0000-4000-8000-0000000000b2', 1, 45.00, 'KL Night Run Finisher Tee', 'M / Navy'),
  ('d0e5e000-0000-4000-8000-0000000000c5', 'd0e5e000-0000-4000-8000-0000000000bc', 'd0e5e000-0000-4000-8000-0000000000b7', 1, 15.00, 'Finisher Medal Engraving', 'One size'),
  ('d0e5e000-0000-4000-8000-0000000000c6', 'd0e5e000-0000-4000-8000-0000000000bd', 'd0e5e000-0000-4000-8000-0000000000b6', 1, 55.00, 'Night Run Singlet', 'S / Pink'),
  ('d0e5e000-0000-4000-8000-0000000000c7', 'd0e5e000-0000-4000-8000-0000000000be', 'd0e5e000-0000-4000-8000-0000000000b7', 1, 15.00, 'Finisher Medal Engraving', 'One size'),
  ('d0e5e000-0000-4000-8000-0000000000c8', 'd0e5e000-0000-4000-8000-0000000000bf', 'd0e5e000-0000-4000-8000-0000000000b7', 3, 15.00, 'Finisher Medal Engraving', 'One size'),
  ('d0e5e000-0000-4000-8000-0000000000c9', 'd0e5e000-0000-4000-8000-0000000000c1', 'd0e5e000-0000-4000-8000-0000000000bb', 1, 25.00, 'Run Cap', 'One size'),
  ('d0e5e000-0000-4000-8000-0000000000ca', 'd0e5e000-0000-4000-8000-0000000000c2', 'd0e5e000-0000-4000-8000-0000000000b8', 1, 40.00, 'Virtual 21K Finisher Tee', 'M / Grey'),
  ('d0e5e000-0000-4000-8000-0000000000cb', 'd0e5e000-0000-4000-8000-0000000000c3', 'd0e5e000-0000-4000-8000-0000000000b9', 2, 40.00, 'Virtual 21K Finisher Tee', 'L / Grey')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §14 PAYMENTS + WEBHOOK EVENTS
--    ★ provider_request_id unique — 'seed-*' values, NEVER the reserved
--    'pending:' sentinel prefix. order_type exclusivity: exactly one of
--    registration_id / merch_order_id / organizer_id is set per row.
--    completed ⇔ registration paid + bib issued; pending ⇔ registration
--    pending + bib NULL; refunded row mirrors registration 'refunded'.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.payments
  (id, order_type, registration_id, merch_order_id, organizer_id, runner_id,
   provider, provider_request_id, provider_payment_id, amount, currency, status,
   payment_rail, refunded_amount, created_at, updated_at)
values
  -- E1 completed
  ('d0e5e000-0000-4000-8000-000000000087', 'registration', 'd0e5e000-0000-4000-8000-000000000061', null, null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-reg-61', 'hp-pay-61001', 55.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '70 days', now() - interval '70 days'),
  ('d0e5e000-0000-4000-8000-000000000088', 'registration', 'd0e5e000-0000-4000-8000-000000000062', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-62', 'hp-pay-62001', 55.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '69 days', now() - interval '69 days'),
  ('d0e5e000-0000-4000-8000-000000000089', 'registration', 'd0e5e000-0000-4000-8000-000000000063', null, null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-reg-63', 'hp-pay-63001', 55.00, 'MYR', 'completed', 'card',  0,     now() - interval '68 days', now() - interval '68 days'),
  ('d0e5e000-0000-4000-8000-00000000008a', 'registration', 'd0e5e000-0000-4000-8000-000000000064', null, null, 'd0e5e000-0000-4000-8000-000000000054', 'hitpay', 'seed-reg-64', 'hp-pay-64001', 35.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '67 days', now() - interval '67 days'),
  ('d0e5e000-0000-4000-8000-00000000008b', 'registration', 'd0e5e000-0000-4000-8000-000000000065', null, null, 'd0e5e000-0000-4000-8000-000000000055', 'hitpay', 'seed-reg-65', 'hp-pay-65001', 35.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '66 days', now() - interval '66 days'),
  -- E1 refunded registration
  ('d0e5e000-0000-4000-8000-00000000008c', 'registration', 'd0e5e000-0000-4000-8000-000000000066', null, null, 'd0e5e000-0000-4000-8000-000000000056', 'hitpay', 'seed-reg-66', 'hp-pay-66001', 35.00, 'MYR', 'refunded',  'fpx',   35.00, now() - interval '65 days', now() - interval '55 days'),
  -- E3 completed
  ('d0e5e000-0000-4000-8000-00000000008d', 'registration', 'd0e5e000-0000-4000-8000-00000000006a', null, null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-reg-6a', 'hp-pay-6a001', 95.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '18 days', now() - interval '18 days'),
  ('d0e5e000-0000-4000-8000-00000000008e', 'registration', 'd0e5e000-0000-4000-8000-00000000006b', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-6b', 'hp-pay-6b001', 95.00, 'MYR', 'completed', 'card',  0,     now() - interval '17 days', now() - interval '17 days'),
  ('d0e5e000-0000-4000-8000-00000000008f', 'registration', 'd0e5e000-0000-4000-8000-00000000006c', null, null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-reg-6c', 'hp-pay-6c001', 95.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '16 days', now() - interval '16 days'),
  ('d0e5e000-0000-4000-8000-000000000090', 'registration', 'd0e5e000-0000-4000-8000-00000000006d', null, null, 'd0e5e000-0000-4000-8000-000000000054', 'hitpay', 'seed-reg-6d', 'hp-pay-6d001', 65.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '15 days', now() - interval '15 days'),
  -- E4 (2 completed, 1 pending, 1 free waived)
  ('d0e5e000-0000-4000-8000-000000000091', 'registration', 'd0e5e000-0000-4000-8000-000000000071', null, null, 'd0e5e000-0000-4000-8000-000000000056', 'hitpay', 'seed-reg-71', 'hp-pay-71001', 49.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '4 days', now() - interval '4 days'),
  ('d0e5e000-0000-4000-8000-000000000092', 'registration', 'd0e5e000-0000-4000-8000-000000000072', null, null, 'd0e5e000-0000-4000-8000-000000000058', 'hitpay', 'seed-reg-72', 'hp-pay-72001', 49.00, 'MYR', 'completed', 'card',  0,     now() - interval '4 days', now() - interval '4 days'),
  ('d0e5e000-0000-4000-8000-000000000093', 'registration', 'd0e5e000-0000-4000-8000-000000000073', null, null, 'd0e5e000-0000-4000-8000-000000000059', 'hitpay', 'seed-reg-73', null,           65.00, 'MYR', 'pending',   'fpx',   0,     now() - interval '2 days', now() - interval '2 days'),
  -- E7 (1 completed, 1 pending, comps waived)
  ('d0e5e000-0000-4000-8000-000000000094', 'registration', 'd0e5e000-0000-4000-8000-000000000075', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-75', 'hp-pay-75001', 129.00, 'MYR', 'completed', 'fpx',  0,     now() - interval '1 day', now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-000000000095', 'registration', 'd0e5e000-0000-4000-8000-000000000076', null, null, 'd0e5e000-0000-4000-8000-000000000054', 'hitpay', 'seed-reg-76', null,           89.00, 'MYR', 'pending',   'card',  0,     now() - interval '1 day', now() - interval '1 day'),
  -- E8 completed
  ('d0e5e000-0000-4000-8000-000000000096', 'registration', 'd0e5e000-0000-4000-8000-000000000079', null, null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-reg-79', 'hp-pay-79001', 149.00, 'MYR', 'completed', 'fpx',  0,     now() - interval '20 hours', now() - interval '20 hours'),
  ('d0e5e000-0000-4000-8000-000000000097', 'registration', 'd0e5e000-0000-4000-8000-00000000007a', null, null, 'd0e5e000-0000-4000-8000-000000000055', 'hitpay', 'seed-reg-7a', 'hp-pay-7a001', 99.00, 'MYR', 'completed', 'card',  0,     now() - interval '16 hours', now() - interval '16 hours'),
  -- E5 virtual completed (40.00)
  ('d0e5e000-0000-4000-8000-000000000098', 'registration', 'd0e5e000-0000-4000-8000-00000000007c', null, null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-reg-7c', 'hp-pay-7c001', 40.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '14 days', now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-000000000099', 'registration', 'd0e5e000-0000-4000-8000-00000000007d', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-7d', 'hp-pay-7d001', 40.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '14 days', now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-00000000009a', 'registration', 'd0e5e000-0000-4000-8000-00000000007e', null, null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-reg-7e', 'hp-pay-7e001', 40.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '13 days', now() - interval '13 days'),
  -- E6 virtual completed (30.00)
  ('d0e5e000-0000-4000-8000-00000000009b', 'registration', 'd0e5e000-0000-4000-8000-00000000007f', null, null, 'd0e5e000-0000-4000-8000-000000000055', 'hitpay', 'seed-reg-7f', 'hp-pay-7f001', 30.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '11 days', now() - interval '11 days'),
  ('d0e5e000-0000-4000-8000-00000000009c', 'registration', 'd0e5e000-0000-4000-8000-000000000080', null, null, 'd0e5e000-0000-4000-8000-000000000058', 'hitpay', 'seed-reg-80', 'hp-pay-80001', 30.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '10 days', now() - interval '10 days'),
  ('d0e5e000-0000-4000-8000-00000000009d', 'registration', 'd0e5e000-0000-4000-8000-000000000081', null, null, 'd0e5e000-0000-4000-8000-000000000059', 'hitpay', 'seed-reg-81', 'hp-pay-81001', 30.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '10 days', now() - interval '10 days'),
  -- E2 virtual completed (25.00)
  ('d0e5e000-0000-4000-8000-00000000009e', 'registration', 'd0e5e000-0000-4000-8000-000000000082', null, null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-reg-82', 'hp-pay-82001', 25.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '65 days', now() - interval '65 days'),
  ('d0e5e000-0000-4000-8000-00000000009f', 'registration', 'd0e5e000-0000-4000-8000-000000000083', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-83', 'hp-pay-83001', 25.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '64 days', now() - interval '64 days'),
  ('d0e5e000-0000-4000-8000-0000000000a0', 'registration', 'd0e5e000-0000-4000-8000-000000000084', null, null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-reg-84', 'hp-pay-84001', 25.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '63 days', now() - interval '63 days'),
  ('d0e5e000-0000-4000-8000-0000000000a1', 'registration', 'd0e5e000-0000-4000-8000-000000000085', null, null, 'd0e5e000-0000-4000-8000-000000000055', 'hitpay', 'seed-reg-85', 'hp-pay-85001', 25.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '62 days', now() - interval '62 days'),
  ('d0e5e000-0000-4000-8000-0000000000a2', 'registration', 'd0e5e000-0000-4000-8000-000000000086', null, null, 'd0e5e000-0000-4000-8000-000000000058', 'hitpay', 'seed-reg-86', 'hp-pay-86001', 25.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '61 days', now() - interval '61 days'),
  -- E9 / E10 virtual completed
  ('d0e5e000-0000-4000-8000-0000000000a3', 'registration', 'd0e5e000-0000-4000-8000-000000000087', null, null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-reg-87', 'hp-pay-87001', 55.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '20 hours', now() - interval '20 hours'),
  ('d0e5e000-0000-4000-8000-0000000000a4', 'registration', 'd0e5e000-0000-4000-8000-000000000088', null, null, 'd0e5e000-0000-4000-8000-000000000056', 'hitpay', 'seed-reg-88', 'hp-pay-88001', 55.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '16 hours', now() - interval '16 hours'),
  ('d0e5e000-0000-4000-8000-0000000000a5', 'registration', 'd0e5e000-0000-4000-8000-000000000089', null, null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-reg-89', 'hp-pay-89001', 35.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '15 hours', now() - interval '15 hours'),
  ('d0e5e000-0000-4000-8000-0000000000a6', 'registration', 'd0e5e000-0000-4000-8000-00000000008a', null, null, 'd0e5e000-0000-4000-8000-000000000059', 'hitpay', 'seed-reg-8a', 'hp-pay-8a001', 35.00, 'MYR', 'completed', 'fpx',   0,     now() - interval '14 hours', now() - interval '14 hours'),
  -- Merch payments (paid orders only: PM-SEED001/002/003)
  ('d0e5e000-0000-4000-8000-0000000000a7', 'merch', null, 'd0e5e000-0000-4000-8000-0000000000bc', null, 'd0e5e000-0000-4000-8000-000000000051', 'hitpay', 'seed-merch-pay-001', 'hp-pay-m0001', 60.00, 'MYR', 'completed', 'fpx',  0, now() - interval '42 days', now() - interval '42 days'),
  ('d0e5e000-0000-4000-8000-0000000000a8', 'merch', null, 'd0e5e000-0000-4000-8000-0000000000bd', null, 'd0e5e000-0000-4000-8000-000000000052', 'hitpay', 'seed-merch-pay-002', 'hp-pay-m0002', 55.00, 'MYR', 'completed', 'card', 0, now() - interval '40 days', now() - interval '40 days'),
  ('d0e5e000-0000-4000-8000-0000000000a9', 'merch', null, 'd0e5e000-0000-4000-8000-0000000000be', null, 'd0e5e000-0000-4000-8000-000000000053', 'hitpay', 'seed-merch-pay-003', 'hp-pay-m0003', 15.00, 'MYR', 'completed', 'fpx',  0, now() - interval '8 days', now() - interval '8 days'),
  -- Organizer subscription payment (org1, ~210 days ago)
  ('d0e5e000-0000-4000-8000-0000000000aa', 'organizer_subscription', null, null, 'd0e5e000-0000-4000-8000-000000000011', null, 'hitpay', 'seed-org-sub-101', 'hp-pay-os001', 499.00, 'MYR', 'completed', 'fpx', 0, now() - interval '210 days', now() - interval '210 days')
on conflict do nothing;

-- Webhook log (★ payload_hash unique)
insert into public.webhook_events (id, provider, event_type, object_id, payload, payload_hash, received_at)
values
  ('d0e5e000-0000-4000-8000-0000000000b0', 'hitpay', 'payment.succeeded', 'seed-reg-61',
   jsonb_build_object('provider', 'hitpay', 'event', 'payment.succeeded', 'payment_request_id', 'seed-reg-61', 'status', 'succeeded', 'amount', 55.00),
   repeat('a1b2c3d4', 8), now() - interval '70 days'),
  ('d0e5e000-0000-4000-8000-0000000000b1', 'hitpay', 'payment.succeeded', 'seed-reg-6a',
   jsonb_build_object('provider', 'hitpay', 'event', 'payment.succeeded', 'payment_request_id', 'seed-reg-6a', 'status', 'succeeded', 'amount', 95.00),
   repeat('b2c3d4e5', 8), now() - interval '18 days'),
  ('d0e5e000-0000-4000-8000-0000000000b2', 'hitpay', 'payment.refunded', 'seed-reg-66',
   jsonb_build_object('provider', 'hitpay', 'event', 'payment.refunded', 'payment_request_id', 'seed-reg-66', 'status', 'refunded', 'amount', 35.00),
   repeat('c3d4e5f6', 8), now() - interval '55 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §15 REPC CONSENT CODES  (★ code unique)
--    b3 used (proxy pick-up for reg62 on E1) · b4 expired-unused (E1)
--    b5 active-unused (E3 — usable for proxy check-in testing)
--    b6 used (proxy pick-up for reg6c on E3)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.repc_consent_codes
  (id, registration_id, organizer_id, code, is_used, expires_at, used_at,
   used_by_runner_id, used_by_registration_id, created_at)
values
  ('d0e5e000-0000-4000-8000-0000000000b3', 'd0e5e000-0000-4000-8000-000000000062', 'd0e5e000-0000-4000-8000-000000000011',
   'NIGHTRUN-PROXY-1', true, (current_date - 45)::timestamptz + interval '48 hours',
   (current_date - 45)::timestamptz + interval '20 hours',
   'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000061', now() - interval '50 days'),
  ('d0e5e000-0000-4000-8000-0000000000b4', 'd0e5e000-0000-4000-8000-000000000065', 'd0e5e000-0000-4000-8000-000000000011',
   'NIGHTRUN-SELF-5', false, (current_date - 45)::timestamptz + interval '48 hours',
   null, null, null, now() - interval '50 days'),
  ('d0e5e000-0000-4000-8000-0000000000b5', 'd0e5e000-0000-4000-8000-00000000006b', 'd0e5e000-0000-4000-8000-000000000011',
   'PUTRAJAYA-002', false, now() + interval '7 days',
   null, null, null, now() - interval '10 days'),
  ('d0e5e000-0000-4000-8000-0000000000b6', 'd0e5e000-0000-4000-8000-00000000006c', 'd0e5e000-0000-4000-8000-000000000011',
   'PUTRAJAYA-003', true, now() + interval '2 days',
   now() - interval '5 hours',
   'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-00000000006a', now() - interval '10 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §16 REPC COLLECTIONS  (★ UNIQUE(registration_id); denormalized cols filled
--      to match what repc_check_in_registration writes; claimed_qty on
--      §9 inventory rows stays consistent with these collections)
--    E1: 6 collections (5 self + 1 proxy) · E3: 2 collections (1 self + 1 proxy)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.repc_collections
  (id, registration_id, organizer_id, collected_by, collected_at, is_proxy, consent_code_id,
   shirt_size, shirt_inventory_id, collected_by_user_id,
   event_id, runner_id, bib_number, runner_name,
   collector_registration_id, collector_runner_id, collector_bib_number, collector_name,
   collection_method, qr_verified_at, remaining_qty_after, staff_email, notes)
values
  -- E1 race-day collections
  ('d0e5e000-0000-4000-8000-0000000000b7', 'd0e5e000-0000-4000-8000-000000000061', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '20 hours', false, null,
   'M', 'd0e5e000-0000-4000-8000-000000000083', 'd0e5e000-0000-4000-8000-0000000000c1',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000051', 'N10-001', 'Adam Faizal bin Harun',
   null, null, null, null, 'self', (current_date - 45)::timestamptz + interval '20 hours', 119, 'klcityrunners@pelikat.test', null),
  ('d0e5e000-0000-4000-8000-0000000000b8', 'd0e5e000-0000-4000-8000-000000000062', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '20 hours', true, 'd0e5e000-0000-4000-8000-0000000000b3',
   'S', 'd0e5e000-0000-4000-8000-000000000082', 'd0e5e000-0000-4000-8000-0000000000c1',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000052', 'N10-002', 'Nurul Aisyah binti Zulkifli',
   'd0e5e000-0000-4000-8000-000000000061', 'd0e5e000-0000-4000-8000-000000000051', 'N10-001', 'Adam Faizal bin Harun',
   'proxy', (current_date - 45)::timestamptz + interval '20 hours', 99, 'klcityrunners@pelikat.test', 'Proxy collection by Adam Faizal bin Harun'),
  ('d0e5e000-0000-4000-8000-0000000000b9', 'd0e5e000-0000-4000-8000-000000000063', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '21 hours', false, null,
   'L', 'd0e5e000-0000-4000-8000-000000000084', 'd0e5e000-0000-4000-8000-0000000000c3',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000053', 'N10-003', 'Tan Wei Ming',
   null, null, null, null, 'self', (current_date - 45)::timestamptz + interval '21 hours', 99, 'klcityrunners@pelikat.test', null),
  ('d0e5e000-0000-4000-8000-0000000000ba', 'd0e5e000-0000-4000-8000-000000000064', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '21 hours', false, null,
   'XS', 'd0e5e000-0000-4000-8000-000000000081', 'd0e5e000-0000-4000-8000-0000000000c4',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000054', 'N05-001', 'Priya Darshini',
   null, null, null, null, 'self', (current_date - 45)::timestamptz + interval '21 hours', 49, 'klcityrunners@pelikat.test', null),
  ('d0e5e000-0000-4000-8000-0000000000bb', 'd0e5e000-0000-4000-8000-000000000065', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '22 hours', false, null,
   'XL', 'd0e5e000-0000-4000-8000-000000000085', 'd0e5e000-0000-4000-8000-0000000000c5',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000055', 'N05-002', 'Muhammad Hafiz bin Roslan',
   null, null, null, null, 'self', (current_date - 45)::timestamptz + interval '22 hours', 59, 'klcityrunners@pelikat.test', null),
  ('d0e5e000-0000-4000-8000-0000000000bd', 'd0e5e000-0000-4000-8000-000000000069', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', (current_date - 45)::timestamptz + interval '22 hours', false, null,
   'S', 'd0e5e000-0000-4000-8000-000000000082', 'd0e5e000-0000-4000-8000-0000000000c8',
   'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000058', 'N05-006', 'Chloe Wong Mei Ling',
   null, null, null, null, 'self', (current_date - 45)::timestamptz + interval '22 hours', 98, 'klcityrunners@pelikat.test', null),
  -- E3 REPC in progress (day before race)
  ('d0e5e000-0000-4000-8000-0000000000be', 'd0e5e000-0000-4000-8000-00000000006a', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', now() - interval '2 hours', false, null,
   'M', 'd0e5e000-0000-4000-8000-00000000007b', 'd0e5e000-0000-4000-8000-0000000000c1',
   'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000051', 'PH21-001', 'Adam Faizal bin Harun',
   null, null, null, null, 'self', now() - interval '2 hours', 99, 'klcityrunners@pelikat.test', null),
  ('d0e5e000-0000-4000-8000-0000000000bf', 'd0e5e000-0000-4000-8000-00000000006c', 'd0e5e000-0000-4000-8000-000000000011',
   'd0e5e000-0000-4000-8000-0000000000b1', now() - interval '5 hours', true, 'd0e5e000-0000-4000-8000-0000000000b6',
   'L', 'd0e5e000-0000-4000-8000-00000000007c', 'd0e5e000-0000-4000-8000-0000000000c1',
   'd0e5e000-0000-4000-8000-000000000023', 'd0e5e000-0000-4000-8000-000000000053', 'PH21-003', 'Tan Wei Ming',
   'd0e5e000-0000-4000-8000-00000000006a', 'd0e5e000-0000-4000-8000-000000000051', 'PH21-001', 'Adam Faizal bin Harun',
   'proxy', now() - interval '5 hours', 99, 'klcityrunners@pelikat.test', 'Proxy collection by Adam Faizal bin Harun')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §17 RUN LOGS  (CHECK distance_km > 0 AND duration_sec > 0)
--    E2 (target 42 km, past):  r1 42.5 ✓ · r2 42.2 ✓ · r3 33.6 (80%) ·
--                              r5 42.1 ✓ · r8 42.1 ✓
--    E5 (target 60 km):        r1 15 (25%) · r2 36 (60%) · r3 60 (100%)
--    E6 (target 21.1 km):      r5 5.3 (25%) · r8 12.7 (60%) · r9 21.1 (100%)
--    generic (event NULL):     recent runs powering streaks
--    pace_min_km = duration_sec / 60 / distance_km (same as log_run()).
--    NOTE: the on_run_log_insert_streak trigger collapses historical runs —
--    §18 fixes runner_streaks afterwards.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.run_logs (id, runner_id, event_id, distance_km, duration_sec, pace_min_km, logged_at)
values
  -- E2 Merdeka Virtual (window ≈ 65d..25d ago)
  ('d0e5e000-0000-4000-8000-0000000000cc', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000022', 10.0, 3600, 6.00, now() - interval '43 days'),
  ('d0e5e000-0000-4000-8000-0000000000cd', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000022', 12.0, 4320, 6.00, now() - interval '36 days'),
  ('d0e5e000-0000-4000-8000-0000000000ce', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000022', 20.5, 7380, 6.00, now() - interval '28 days'),
  ('d0e5e000-0000-4000-8000-0000000000cf', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000022', 14.0, 5180, 6.17, now() - interval '42 days'),
  ('d0e5e000-0000-4000-8000-0000000000d0', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000022', 15.0, 5400, 6.00, now() - interval '33 days'),
  ('d0e5e000-0000-4000-8000-0000000000d1', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000022', 13.2, 4750, 5.99, now() - interval '25 days'),
  ('d0e5e000-0000-4000-8000-0000000000d2', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000022', 10.0, 3900, 6.50, now() - interval '40 days'),
  ('d0e5e000-0000-4000-8000-0000000000d3', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000022', 11.6, 4500, 6.47, now() - interval '31 days'),
  ('d0e5e000-0000-4000-8000-0000000000d4', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000022', 12.0, 4700, 6.53, now() - interval '24 days'),
  ('d0e5e000-0000-4000-8000-0000000000d5', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000022', 21.1, 7596, 6.00, now() - interval '38 days'),
  ('d0e5e000-0000-4000-8000-0000000000d6', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000022', 21.0, 7560, 6.00, now() - interval '26 days'),
  ('d0e5e000-0000-4000-8000-0000000000d7', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022',  5.0, 1800, 6.00, now() - interval '44 days'),
  ('d0e5e000-0000-4000-8000-0000000000d8', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022',  8.0, 2900, 6.04, now() - interval '37 days'),
  ('d0e5e000-0000-4000-8000-0000000000d9', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022', 10.0, 3550, 5.92, now() - interval '30 days'),
  ('d0e5e000-0000-4000-8000-0000000000da', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022',  7.0, 2500, 5.95, now() - interval '23 days'),
  ('d0e5e000-0000-4000-8000-0000000000db', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022', 12.1, 4300, 5.92, now() - interval '21 days'),
  -- E5 Virtual 60K (active)
  ('d0e5e000-0000-4000-8000-0000000000dc', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000025', 15.0, 5400, 6.00, now() - interval '10 days'),
  ('d0e5e000-0000-4000-8000-0000000000dd', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000025', 18.0, 6300, 5.83, now() - interval '12 days'),
  ('d0e5e000-0000-4000-8000-0000000000de', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000025', 18.0, 6100, 5.65, now() - interval '5 days'),
  ('d0e5e000-0000-4000-8000-0000000000df', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000025', 30.0, 10800, 6.00, now() - interval '14 days'),
  ('d0e5e000-0000-4000-8000-0000000000e0', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000025', 30.0, 10800, 6.00, now() - interval '6 days'),
  -- E6 Virtual 21.1K (active)
  ('d0e5e000-0000-4000-8000-0000000000e1', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000026',  5.3, 2000, 6.29, now() - interval '8 days'),
  ('d0e5e000-0000-4000-8000-0000000000e2', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000026', 12.7, 4600, 6.04, now() - interval '7 days'),
  ('d0e5e000-0000-4000-8000-0000000000e3', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000026', 10.6, 3700, 5.82, now() - interval '9 days'),
  ('d0e5e000-0000-4000-8000-0000000000e4', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000026', 10.5, 3600, 5.71, now() - interval '3 days'),
  -- generic runs (event_id NULL) — recent, streak-friendly
  ('d0e5e000-0000-4000-8000-0000000000e5', 'd0e5e000-0000-4000-8000-000000000051', null,  5.0, 1800, 6.00, now() - interval '4 days'),
  ('d0e5e000-0000-4000-8000-0000000000e6', 'd0e5e000-0000-4000-8000-000000000051', null,  6.0, 2100, 5.83, now() - interval '2 days'),
  ('d0e5e000-0000-4000-8000-0000000000e7', 'd0e5e000-0000-4000-8000-000000000051', null,  5.5, 1900, 5.76, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-0000000000e8', 'd0e5e000-0000-4000-8000-000000000051', null,  7.0, 2500, 5.95, now()),
  ('d0e5e000-0000-4000-8000-0000000000e9', 'd0e5e000-0000-4000-8000-000000000052', null,  4.0, 1500, 6.25, now() - interval '3 days'),
  ('d0e5e000-0000-4000-8000-0000000000ea', 'd0e5e000-0000-4000-8000-000000000052', null,  5.0, 1800, 6.00, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-0000000000eb', 'd0e5e000-0000-4000-8000-000000000059', null,  8.0, 2700, 5.63, now() - interval '5 days'),
  ('d0e5e000-0000-4000-8000-0000000000ec', 'd0e5e000-0000-4000-8000-000000000059', null,  6.0, 2000, 5.56, now() - interval '4 days'),
  ('d0e5e000-0000-4000-8000-0000000000ed', 'd0e5e000-0000-4000-8000-000000000059', null,  9.0, 3100, 5.72, now() - interval '2 days'),
  ('d0e5e000-0000-4000-8000-0000000000ee', 'd0e5e000-0000-4000-8000-000000000059', null, 10.0, 3400, 5.67, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-0000000000ef', 'd0e5e000-0000-4000-8000-000000000059', null,  8.0, 2800, 5.83, now()),
  ('d0e5e000-0000-4000-8000-0000000000f0', 'd0e5e000-0000-4000-8000-000000000055', null,  5.0, 1900, 6.33, now() - interval '2 days'),
  ('d0e5e000-0000-4000-8000-0000000000f1', 'd0e5e000-0000-4000-8000-000000000055', null,  5.0, 1800, 6.00, now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-0000000000f2', 'd0e5e000-0000-4000-8000-000000000055', null,  5.0, 1850, 6.17, now()),
  ('d0e5e000-0000-4000-8000-0000000000f3', 'd0e5e000-0000-4000-8000-000000000053', null,  4.0, 1700, 7.08, now() - interval '10 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §18 RUNNER STREAKS FIX-UP  (PK runner_id — targeted upsert)
--    The on_run_log_insert_streak trigger collapses historical logs to a
--    streak of 1 on current_date. Overwrite with values consistent with the
--    run_logs above (r4/r6/r7/r10 never logged → no row, as the trigger
--    would never have created one).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.runner_streaks (runner_id, current_streak, longest_streak, last_run_date, updated_at)
values
  ('d0e5e000-0000-4000-8000-000000000051', 3,  3,  current_date,      now()),           -- r1 longest = d0,d1,d2 (gap d3)
  ('d0e5e000-0000-4000-8000-000000000052', 1,  1,  current_date - 1,  now()),           -- r2 last run yesterday; no back-to-back runs
  ('d0e5e000-0000-4000-8000-000000000053', 0,  1,  current_date - 6,  now()),           -- r3 last run 6 days ago (E5); no back-to-back runs
  ('d0e5e000-0000-4000-8000-000000000055', 3,  3,  current_date,      now()),           -- r5 daily 3-day streak
  ('d0e5e000-0000-4000-8000-000000000058', 0,  1,  current_date - 7,  now()),           -- r8 no back-to-back runs
  ('d0e5e000-0000-4000-8000-000000000059', 6,  6,  current_date,      now())            -- r9 ran d0..d5 straight
on conflict (runner_id) do update set
  current_streak = excluded.current_streak,
  longest_streak = excluded.longest_streak,
  last_run_date  = excluded.last_run_date,
  updated_at     = now();

-- ════════════════════════════════════════════════════════════════════════════
-- §19 RUNNER BADGES  (★ (runner_id,badge_key,event_id))
--    A physical e-cert entitlement IS a badge row. Future events get none
--    (badges are awarded, never pre-seeded; milestone "planning" lives in
--    event descriptions + category tiers).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.runner_badges (id, runner_id, event_id, badge_key, awarded_at)
values
  -- E1 finishers (physical, results published) — e-cert entitlements
  ('d0e5e000-0000-4000-8000-0000000000e6', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000021', 'finisher_e_cert', (current_date - 45)::timestamptz + interval '26 hours'),
  ('d0e5e000-0000-4000-8000-0000000000e7', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000021', 'finisher_e_cert', (current_date - 45)::timestamptz + interval '26 hours'),
  ('d0e5e000-0000-4000-8000-0000000000e8', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000021', 'finisher_e_cert', (current_date - 45)::timestamptz + interval '27 hours'),
  ('d0e5e000-0000-4000-8000-0000000000e9', 'd0e5e000-0000-4000-8000-000000000054', 'd0e5e000-0000-4000-8000-000000000021', 'finisher_e_cert', (current_date - 45)::timestamptz + interval '27 hours'),
  ('d0e5e000-0000-4000-8000-0000000000ea', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000021', 'finisher_e_cert', (current_date - 45)::timestamptz + interval '28 hours'),
  ('d0e5e000-0000-4000-8000-0000000000eb', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000021', 'vip_participant', (current_date - 45)::timestamptz + interval '28 hours'),
  -- E2 virtual finishers (100% of 42 km) + halfway milestone for the 80% runner
  ('d0e5e000-0000-4000-8000-0000000000ec', 'd0e5e000-0000-4000-8000-000000000051', 'd0e5e000-0000-4000-8000-000000000022', 'finisher_e_cert', now() - interval '20 days'),
  ('d0e5e000-0000-4000-8000-0000000000ed', 'd0e5e000-0000-4000-8000-000000000052', 'd0e5e000-0000-4000-8000-000000000022', 'finisher_e_cert', now() - interval '25 days'),
  ('d0e5e000-0000-4000-8000-0000000000ee', 'd0e5e000-0000-4000-8000-000000000055', 'd0e5e000-0000-4000-8000-000000000022', 'finisher_e_cert', now() - interval '26 days'),
  ('d0e5e000-0000-4000-8000-0000000000f4', 'd0e5e000-0000-4000-8000-000000000058', 'd0e5e000-0000-4000-8000-000000000022', 'finisher_e_cert', now() - interval '21 days'),
  ('d0e5e000-0000-4000-8000-0000000000f5', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000022', 'milestone_halfway', now() - interval '28 days'),
  -- E5 / E6 completions (100%)
  ('d0e5e000-0000-4000-8000-0000000000f6', 'd0e5e000-0000-4000-8000-000000000053', 'd0e5e000-0000-4000-8000-000000000025', 'finisher_e_cert', now() - interval '6 days'),
  ('d0e5e000-0000-4000-8000-0000000000f7', 'd0e5e000-0000-4000-8000-000000000059', 'd0e5e000-0000-4000-8000-000000000026', 'finisher_e_cert', now() - interval '3 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §20 PHOTO TAGS  (★ (event_id,storage_path,bib_number) WHERE bib IS NOT NULL)
--    All 4 statuses (auto/review/discarded/confirmed) with confidences and
--    batch ids. Paths are placeholders under race-photos/ — no storage.objects
--    rows are created, so signed URLs will 404 until real photos are uploaded.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.photo_tags
  (id, event_id, organizer_id, registration_id, runner_id, storage_path, bib_number, confidence, status, batch_id, created_at)
values
  ('d0e5e000-0000-4000-8000-0000000000f8', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000061', 'd0e5e000-0000-4000-8000-000000000051', 'race-photos/kl-city-night-run/batch-a/photo-001.jpg', 'N10-001', 0.9876, 'confirmed', 'aaaaaaaa-0000-4000-8000-000000000001', now() - interval '44 days'),
  ('d0e5e000-0000-4000-8000-0000000000f9', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000062', 'd0e5e000-0000-4000-8000-000000000052', 'race-photos/kl-city-night-run/batch-a/photo-002.jpg', 'N10-002', 0.9543, 'confirmed', 'aaaaaaaa-0000-4000-8000-000000000001', now() - interval '44 days'),
  ('d0e5e000-0000-4000-8000-0000000000fa', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000063', 'd0e5e000-0000-4000-8000-000000000053', 'race-photos/kl-city-night-run/batch-a/photo-003.jpg', 'N10-003', 0.9120, 'confirmed', 'aaaaaaaa-0000-4000-8000-000000000001', now() - interval '44 days'),
  ('d0e5e000-0000-4000-8000-0000000000fb', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000064', 'd0e5e000-0000-4000-8000-000000000054', 'race-photos/kl-city-night-run/batch-b/photo-004.jpg', 'N05-001', 0.8765, 'auto',     'aaaaaaaa-0000-4000-8000-000000000002', now() - interval '43 days'),
  ('d0e5e000-0000-4000-8000-0000000000fc', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000065', 'd0e5e000-0000-4000-8000-000000000055', 'race-photos/kl-city-night-run/batch-b/photo-005.jpg', 'N05-002', 0.8432, 'auto',     'aaaaaaaa-0000-4000-8000-000000000002', now() - interval '43 days'),
  ('d0e5e000-0000-4000-8000-0000000000fd', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', null, null, 'race-photos/kl-city-night-run/batch-b/photo-006.jpg', 'N05-003', 0.5123, 'review',   'aaaaaaaa-0000-4000-8000-000000000002', now() - interval '43 days'),
  ('d0e5e000-0000-4000-8000-0000000000fe', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', 'd0e5e000-0000-4000-8000-000000000061', 'd0e5e000-0000-4000-8000-000000000051', 'race-photos/kl-city-night-run/batch-b/photo-007.jpg', 'N10-001', 0.6543, 'review',   'aaaaaaaa-0000-4000-8000-000000000002', now() - interval '43 days'),
  ('d0e5e000-0000-4000-8000-0000000000ff', 'd0e5e000-0000-4000-8000-000000000021', 'd0e5e000-0000-4000-8000-000000000011', null, null, 'race-photos/kl-city-night-run/batch-b/photo-008.jpg', 'N05-004', 0.3210, 'discarded','aaaaaaaa-0000-4000-8000-000000000002', now() - interval '43 days')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §21 AUDIT LOG  (explicit business events only — NEVER logins; uuid range
--      1000000000NN. The audit triggers from §4–§20 additionally auto-write
--      'INSERT <table>' noise rows — accepted, documented in SEED.md.)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.audit_log
  (id, actor_id, actor_email, actor_name, action, target_id, metadata, created_at)
values
  ('d0e5e000-0000-4000-8000-100000000001', 'd0e5e000-0000-4000-8000-0000000000a1', 'admin1@pelikat.test', 'Pelikat Admin Satu',
   'admin_approve_organizer', 'd0e5e000-0000-4000-8000-000000000011',
   jsonb_build_object('organizer', 'KL City Runners'), now() - interval '210 days'),
  ('d0e5e000-0000-4000-8000-100000000002', 'd0e5e000-0000-4000-8000-0000000000a1', 'admin1@pelikat.test', 'Pelikat Admin Satu',
   'admin_approve_organizer', 'd0e5e000-0000-4000-8000-000000000012',
   jsonb_build_object('organizer', 'Penang Pacers'), now() - interval '115 days'),
  ('d0e5e000-0000-4000-8000-100000000003', 'd0e5e000-0000-4000-8000-0000000000a2', 'admin2@pelikat.test', 'Pelikat Admin Dua',
   'admin_reject_organizer', 'd0e5e000-0000-4000-8000-000000000014',
   jsonb_build_object('organizer', 'Borneo Trail Crew', 'reason', 'Incomplete club credentials'), now() - interval '20 days'),
  ('d0e5e000-0000-4000-8000-100000000004', 'd0e5e000-0000-4000-8000-0000000000a1', 'admin1@pelikat.test', 'Pelikat Admin Satu',
   'admin_update_subscription', 'd0e5e000-0000-4000-8000-000000000011',
   jsonb_build_object('sub_expires_at', 'annual'), now() - interval '210 days'),
  ('d0e5e000-0000-4000-8000-100000000005', 'd0e5e000-0000-4000-8000-0000000000c1', 'runner1@pelikat.test', 'Adam Faizal bin Harun',
   'runner_registered', 'd0e5e000-0000-4000-8000-000000000061',
   jsonb_build_object('event_id', 'd0e5e000-0000-4000-8000-000000000021', 'category_id', 'd0e5e000-0000-4000-8000-000000000031'), now() - interval '70 days'),
  ('d0e5e000-0000-4000-8000-100000000006', 'd0e5e000-0000-4000-8000-0000000000c1', 'runner1@pelikat.test', 'Adam Faizal bin Harun',
   'payment_confirmed', 'd0e5e000-0000-4000-8000-000000000061',
   jsonb_build_object('event_id', 'd0e5e000-0000-4000-8000-000000000021', 'bib_number', 'N10-001'), now() - interval '70 days'),
  ('d0e5e000-0000-4000-8000-100000000007', 'd0e5e000-0000-4000-8000-0000000000b1', 'klcityrunners@pelikat.test', 'KL City Runners',
   'complimentary_registrations_added', 'd0e5e000-0000-4000-8000-000000000021',
   jsonb_build_object('event_id', 'd0e5e000-0000-4000-8000-000000000021', 'category_id', 'd0e5e000-0000-4000-8000-000000000032', 'role', 'pacer',
                      'guests', jsonb_build_array(jsonb_build_object('name', 'Danial Haqim (Official Pacer)', 'email', 'pacer.danial@pelikat.test', 'bib_number', 'N05-004'))),
   now() - interval '60 days'),
  ('d0e5e000-0000-4000-8000-100000000008', 'd0e5e000-0000-4000-8000-0000000000c6', 'runner6@pelikat.test', 'Lim Siew Ling',
   'registration_cancelled', 'd0e5e000-0000-4000-8000-000000000066',
   jsonb_build_object('event_id', 'd0e5e000-0000-4000-8000-000000000021', 'refund', true), now() - interval '55 days'),
  ('d0e5e000-0000-4000-8000-100000000009', null, 'klcityrunners@pelikat.test', 'KL City Runners',
   'organizer_subscription_payment', 'd0e5e000-0000-4000-8000-000000000011',
   jsonb_build_object('amount', 499.00, 'currency', 'MYR', 'payment_provider', 'hitpay', 'payment_reference', 'seed-org-sub-101'), now() - interval '210 days'),
  ('d0e5e000-0000-4000-8000-10000000000a', 'd0e5e000-0000-4000-8000-0000000000a2', 'admin2@pelikat.test', 'Pelikat Admin Dua',
   'admin_update_registration', 'd0e5e000-0000-4000-8000-000000000073',
   jsonb_build_object('note', 'Manually verified payment slip'), now() - interval '1 day'),
  ('d0e5e000-0000-4000-8000-10000000000b', 'd0e5e000-0000-4000-8000-0000000000b1', 'klcityrunners@pelikat.test', 'KL City Runners',
   'merch.order_status', 'd0e5e000-0000-4000-8000-0000000000bc',
   jsonb_build_object('status', 'collected', 'order_ids', jsonb_build_array('d0e5e000-0000-4000-8000-0000000000bc')), now() - interval '39 days'),
  ('d0e5e000-0000-4000-8000-10000000000c', 'd0e5e000-0000-4000-8000-0000000000c3', 'runner3@pelikat.test', 'Tan Wei Ming',
   'merch.checkout', 'd0e5e000-0000-4000-8000-0000000000be',
   jsonb_build_object('order_number', 'PM-SEED003', 'event_id', 'd0e5e000-0000-4000-8000-000000000021', 'total', 15.00, 'payment_method', 'fpx'), now() - interval '8 days'),
  ('d0e5e000-0000-4000-8000-10000000000d', 'd0e5e000-0000-4000-8000-0000000000c1', 'runner1@pelikat.test', 'Adam Faizal bin Harun',
   'payment_confirmed', 'd0e5e000-0000-4000-8000-00000000006a',
   jsonb_build_object('event_id', 'd0e5e000-0000-4000-8000-000000000023', 'bib_number', 'PH21-001'), now() - interval '18 days'),
  ('d0e5e000-0000-4000-8000-10000000000e', 'd0e5e000-0000-4000-8000-0000000000b2', 'penangpacers@pelikat.test', 'Penang Pacers',
   'merch.order_status', 'd0e5e000-0000-4000-8000-0000000000c3',
   jsonb_build_object('status', 'cancelled', 'order_ids', jsonb_build_array('d0e5e000-0000-4000-8000-0000000000c3')), now() - interval '1 day')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- §22 PLATFORM SETTINGS  (migration 053 pre-seeds 6 keys — idempotent top-up,
--      do nothing so admin edits are preserved)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.platform_settings (key, value)
values
  ('platform_name',            '"Pelikat Running Platform"'::jsonb),
  ('support_email',            '"support@pelikat.com"'::jsonb),
  ('feature_virtual_run',      'true'::jsonb),
  ('feature_photo_ai',         'true'::jsonb),
  ('feature_repc_collection',  'true'::jsonb),
  ('maintenance_mode',         'false'::jsonb),
  ('organizer_subscription_price',
   '{"amount": 99.00, "currency": "MYR", "period": "year", "duration_days": 365}'::jsonb)
on conflict (key) do nothing;

commit;
