# Seeding Runbook — pelikat-web

`supabase/seed.sql` is a comprehensive, **idempotent** seeder for the Pelikat
running-event platform. It seeds 3 admins, 5 organizers (one per lifecycle
state), 10 runners, 10 events (past / active / future × physical / virtual),
42 registrations, payments & webhooks, REPC kit collection, a merch store,
run logs, streaks, badges, photo tags and audit entries — with **fixed UUIDs**
so re-runs are **state-idempotent**: every insert/upsert converges to the same
dataset. A re-run is NOT an exact no-op — the seed.sql §9 `event_shirt_inventory`
upsert re-writes rows and therefore adds a few audit-trigger rows on every run
(see §5 "Known gaps & notes" → "Audit-trigger noise" for the source).

---

## 1. Green-light sequence (full reset + seed)

```bash
cd pelikat-web
supabase start          # boot the local stack (ports: db 54322, api 54321)
supabase db reset       # ⚠ DESTROYS ALL DATA — then applies migrations 001–068
                        #   and automatically runs supabase/seed.sql afterwards
```

> ⚠ `supabase db reset` **drops and recreates the database**. Only run it on
> explicit go-ahead. The seed file itself is purely additive — the destruction
> comes from the reset, never from the seed.

## 2. Seed-only re-run (idempotent top-up, no data loss)

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql
```

Safe against an already-seeded database: every insert uses fixed UUIDs with
`on conflict do nothing` (targeted upserts for `event_shirt_inventory`,
`runner_streaks`, `platform_settings`). Must run as the `postgres` superuser
(bypasses RLS — `payments` / `webhook_events` are FORCE-RLS'd).

## Cloud A2 variant (hosted project ugexrrslijmwtieevjbs — PRESERVES your personal admin logins)

On 2026-10-20 a wipe-and-seed was executed against the **hosted cloud project**
`ugexrrslijmwtieevjbs` to bring its data in line with this seeder. What was run,
in a single transaction: `begin; set local role postgres;` → `TRUNCATE` all 20
public tables (`RESTRICT`) → `delete from auth.users where id <> <two preserved
admin uuids>` (identities/sessions cascade) → `set local role postgres; \i supabase/seed.sql`
→ verification batch → a 17-identity corrective (`provider_id` forced to the user
UUID / `identity_data.sub`, after GoTrue's UNIQUE `(provider_id, provider)` index
was found to skip conflicting rows) → verify `identities_total = 20`,
`unloggable_seed_users = 0`, all seed-matrix counts **PASS**. Purpose: restore the
full seed matrix while preserving the `hafizisamzar@gmail.com` /
`abdul.hafiz170022@gmail.com` Google admin logins and all 153 storage blobs.
⚠ This documents WHAT WAS RUN, not a command to run blindly — what gets wiped
depends entirely on which users you choose to preserve per run, and a backup
(`supabase db dump` / REST export) **must exist first**. Full staged block
preserved in the @db-specialist orchestrator session of 2026-10-20.

## 3. Credentials

Password for **every** seeded account: — see local seeding secret (below)

> **Credential handling.** The shared password for the seeded `@pelikat.test`
> accounts applies ONLY to freshly seeded **local** environments created by
> `supabase db reset` + `supabase/seed.sql` in this repo — it is deliberately
> NOT documented as a published value here; obtain it from the team's private
> credential store, not from any file in the repo. On the hosted project
> (`ugexrrslijmwtieevjbs`) the 18 seeded `@pelikat.test` accounts had their
> passwords ROTATED to unknown values immediately after the 2026-10-20 cloud
> seeding, so the historical password no longer unlocks anything there (the
> preserved `@gmail.com` Google admin logins were unaffected). If local
> passwords ever need changing, rotate them per-project via the usual Supabase
> dashboard / SQL flow.

### Admins (`raw_app_meta_data: {"role":"admin"}`)

| Email               | Name               |
|---------------------|--------------------|
| admin1@pelikat.test | Pelikat Admin Satu |
| admin2@pelikat.test | Pelikat Admin Dua  |
| admin3@pelikat.test | Pelikat Admin Tiga |

### Organizers (`{"role":"organizer","organizer_id":"<organizers.id>"}`)

| Email                        | Password      | Organizer           | State                                          |
|------------------------------|---------------|---------------------|------------------------------------------------|
| klcityrunners@pelikat.test   | (local seed secret — not published here)  | KL City Runners     | active, approved, subscription paid (+155 d)    |
| penangpacers@pelikat.test    | (local seed secret — not published here)  | Penang Pacers       | active, approved, subscription expires in 12 d  |
| jbultras@pelikat.test        | (local seed secret — not published here)  | JB Ultras           | **pending approval** (approved_at NULL)         |
| borneotrailcrew@pelikat.test | (local seed secret — not published here)  | Borneo Trail Crew   | **rejected** (rejected_at set, inactive)        |
| putrajayastriders@pelikat.test | (local seed secret — not published here) | Putrajaya Striders | **inactive** — lapsed subscription (65 d ago)   |

### Runners (`{"role":"runner"}`, complete runner_profiles)

| Email                 | Name                        | Gender / Size | Notes                          |
|-----------------------|-----------------------------|---------------|--------------------------------|
| runner1@pelikat.test  | Adam Faizal bin Harun       | M / M         | heavy activity: 2 events + streaks |
| runner2@pelikat.test  | Nurul Aisyah binti Zulkifli | F / S         | 6 registrations across events  |
| runner3@pelikat.test  | Tan Wei Ming                | M / L         | 100% on virtual 60K            |
| runner4@pelikat.test  | Priya Darshini              | F / XS        | pending JB registration        |
| runner5@pelikat.test  | Muhammad Hafiz bin Roslan   | M / XL        | 3-day streak                   |
| runner6@pelikat.test  | Lim Siew Ling               | F / XXL       | refunded KL registration       |
| runner7@pelikat.test  | Ahmad Zulkarnain bin Omar   | M / M         | claimed VIP comp on E3         |
| runner8@pelikat.test  | Chloe Wong Mei Ling         | F / S         | virtual finisher + merch buyer |
| runner9@pelikat.test  | Gopal Krishnan              | M / M         | 6-day run streak, pending merch order |
| runner10@pelikat.test | Farah Nadia binti Ahmad     | F / M         | free kids-category entry       |

All runners have DOB, phone, emergency contact and `pdpa_agreed = true`.

## 4. What is seeded (counts per table)

| Table                  | Rows | Highlights                                                              |
|------------------------|------|-------------------------------------------------------------------------|
| storage.buckets        | 7    | race-photos, certificates, receipts, photo-gallery, avatars, ic-documents, merch-images |
| auth.users / identities| 18   | 3 admin + 5 organizer + 10 runner, email-confirmed; shared local seed password (not published here)      |
| organizers             | 5    | one per lifecycle state (active / expiring / pending / rejected / inactive) |
| events                 | 10   | 2 past (closed; 1 physical with results published, 1 virtual) · 4 active (2 physical, 2 virtual) · 4 future published (2 physical, 2 virtual) — dates via `now()::date` arithmetic, never stale |
| race_categories        | 19   | paid HitPay tiers, early-bird vs standard (shared prefix, offset bib_start), free/RM0, VIP, pacer categories |
| runner_profiles        | 10   | XS–XXL sizes, genders, DOB, emergency contacts, pdpa_agreed             |
| registrations          | 42   | paid+completed payments+bib · pending+pending payment+bib NULL (payment-first flow) · waived (free + comps) · 1 refunded · runner/pacer/vip roles · claimed comps (runner_id set) & unclaimed comps (guest_name/email, several email-less) for CSV export & auto-claim testing |
| event_shirt_inventory  | 12   | 6 sizes × E1 + E3, upserted on (event_id,size); claimed_qty consistent with collections |
| payments               | 36   | 29 registration `completed`, 2 `pending` (bib still NULL), 1 `refunded`, 3 merch, 1 organizer_subscription — `provider_request_id` values `seed-*` (never the reserved `pending:` prefix) |
| webhook_events         | 3    | succeeded ×2, refunded ×1, unique payload hashes                        |
| repc_consent_codes     | 4    | used (×2), expired-unused, **active-unused** (`PUTRAJAYA-002`, testable proxy check-in) |
| repc_collections       | 8    | self + proxy (collector_* snapshot columns filled), denormalized event/runner/bib fields |
| merch_products         | 5    | on a physical (E1) and a virtual (E6) event: tees, singlet, cap, medal engraving (one-SKU, size/color NULL) |
| merch_variants         | 11   | healthy / LOW below threshold (S=3, L=2) / SOLD OUT (0)                 |
| merch_orders           | 7    | all 5 statuses: collected, ready, confirmed, cancelled (×2: by runner, expired), pending ×2 (one reserved `expires_at = now()+15 min`, one unreserved NULL — both survive the pg_cron releaser) |
| merch_order_items      | 8    | snapshot columns `product_name` / `variant_label` populated             |
| run_logs               | 40   | virtual progress 25% / 60% / 100% on active events; E2 finishers at 100% + one 80% non-finisher; generic runs for streaks |
| runner_streaks         | 6    | fixed up after the trigger collapses historical logs (consistent with run_logs) |
| runner_badges          | 13   | `finisher_e_cert` entitlements (= physical e-cert), VIP + milestone badges |
| photo_tags             | 8    | all 4 statuses (auto / review / discarded / confirmed), confidences, batch ids |
| audit_log              | ~144  | on a FRESH wipe+seed: 14 business events (never logins) + ~130 automatic `INSERT <table>` trigger rows from the 11 audited tables (see below). Seed-only re-runs see far less |
| platform_settings      | 6    | same keys migration 053 pre-seeds (upsert, never overwrites admin edits) |

## 5. Known gaps & notes

- **Promo codes / vouchers have NO schema** anywhere in migrations 001–068 —
  nothing is faked; needs a schema decision first.
- **Official physical race results have NO table** — only the
  `events.results_published` gate exists. Physical "results" are represented by
  registrations + bibs + check-ins; virtual results come from the
  run_logs-driven `leaderboard_virtual` view.
- **Audit-trigger noise**: migration 032 attaches `audit.log_change()` to 11
  tables, so every seeded row auto-writes an `INSERT <table>` audit row. This
  is accepted noise. Re-runs do **not** duplicate it (conflicting inserts are
  skipped before triggers fire) — except the §9 `event_shirt_inventory` upsert,
  which re-writes rows and adds a few noise entries each run. Harmless.
- **Photos are placeholders**: `photo_tags.storage_path` values exist under
  `race-photos/`, but no `storage.objects` rows are created — gallery signed
  URLs will 404 until real photos are uploaded.
- **Merch image paths** (`image_path`) are placeholders too — upload real
  images to the `merch-images` bucket to see them render.
- **Bib format** mimics `allocate_bib()` exactly:
  `bib_prefix || lpad(seq, digits(bib_start + max_slots - 1), '0')`, unique per
  event. Virtual registrations have `bib_number IS NULL`.

## 6. Legacy files

The files in `supabase/seeds/` (`merch_hub_demo.sql`, `merch_store_demo.sql`,
`transfer_event_organizer.sql`) are **standalone demo one-offs** for the old
demo data. They are **not** part of `supabase db reset` and not needed after
this seeder — left untouched for reference.
