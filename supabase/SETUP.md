# Pelikat Running Platform — Supabase Setup Guide

This guide walks you through setting up Supabase for local development and cloud deployment.

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed
- [pnpm](https://pnpm.io/) installed
- A Supabase account (for cloud deployment)

---

## Quick Start (Local Development)

### 1. Start Supabase Locally

```bash
supabase start
```

This spins up a local Supabase stack with Postgres, Auth, Storage, Realtime, and the Studio dashboard at `http://127.0.0.1:54323`.

### 2. Run Migrations

```bash
supabase db reset
```

This applies all migrations in order from `supabase/migrations/`.

### 3. Set Up Storage Buckets

Run the storage setup script in the SQL Editor:

```bash
# Open the local Supabase Studio → SQL Editor
# Paste and run the contents of supabase/setup-storage.sql
```

Or via CLI:

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/setup-storage.sql
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy on-auth-user-created
```

### 5. Configure Auth Hooks

#### Custom Access Token Hook (runs on every login)

This is the **authoritative source** for organizer role assignment. It checks `is_active` on every login and token refresh.

1. Dashboard → Authentication → Hooks
2. Find **Custom Access Token** → Enable
3. Set URL: `https://<project-ref>.functions.supabase.co/custom-access-token-hook`
4. Save

#### Legacy Webhook (runs on first signup only)

The `on-auth-user-created` webhook handles initial signup. Hook it via:

1. Dashboard → Database → Webhooks
2. Create webhook on `auth.users` table, `INSERT` event
3. Point to: `https://<project-ref>.functions.supabase.co/on-auth-user-created`

> **Note:** The Custom Access Token hook supersedes the webhook for role checks. The webhook is kept for backward compatibility.

### 6. Set Environment Variables

Copy `.env.example` to `.env.local` in the Next.js project root:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start-output>
```

The anon key is printed when you run `supabase start`.

---

## Cloud Deployment

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a region closest to your users (e.g., `ap-southeast-1` Singapore)
3. Set a database password
4. Note the **Project URL** and **anon key**

### 2. Link Your Project

```bash
supabase link --project-ref <your-project-ref>
```

Find your project ref in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`

### 3. Push Migrations

```bash
supabase db push
```

### 4. Set Up Storage Buckets

Run the storage setup script in the Supabase Dashboard → SQL Editor:

```bash
# Copy the contents of supabase/setup-storage.sql
# Paste into SQL Editor and run
```

### 5. Deploy Edge Functions

```bash
supabase functions deploy custom-access-token-hook \
  --project-ref <your-project-ref> \
  --no-verify-jwt

supabase functions deploy on-auth-user-created \
  --project-ref <your-project-ref> \
  --no-verify-jwt
```

Then set the function secrets:

```bash
supabase secrets set \
  SUPABASE_URL=<your-project-url> \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Get the service role key from Dashboard → Project Settings → API.

### 6. Configure Auth Hooks

#### Custom Access Token Hook (required — runs on every login)

1. Dashboard → Authentication → Hooks
2. Find **Custom Access Token** → Enable
3. Set URL: `https://<project-ref>.functions.supabase.co/custom-access-token-hook`
4. Save

#### Legacy Webhook (optional — runs on first signup only)

1. Dashboard → Database → Webhooks
2. Create webhook on `auth.users` table, `INSERT` event
3. Point to: `https://<project-ref>.functions.supabase.co/on-auth-user-created`

> **Note:** The Custom Access Token hook is the authoritative source for role/is_active checks. The webhook is kept for backward compatibility.

### 7. Configure Google OAuth

1. Create a Google Cloud project → OAuth 2.0 credentials
2. Dashboard → Authentication → Providers → Google → Enable
3. Add Client ID and Client Secret
4. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

### 8. Set Environment Variables (Next.js)

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### 9. Enable Realtime

Dashboard → Database → Replication → toggle on for these tables:

| Table | Events |
|-------|--------|
| `registrations` | UPDATE |
| `run_logs` | INSERT |
| `runner_badges` | INSERT |
| `photo_tags` | INSERT, UPDATE |

---

## Becoming an Admin

After signing up with your Google account:

```sql
update auth.users
set raw_app_meta_data = '{"role": "admin"}'
where email = 'your-email@example.com';
```

---

## Creating an Organizer

Organizers cannot self-register. An admin must create them:

```sql
insert into organizers (name, slug, contact_email)
values ('KL Marathon', 'kl-marathon', 'organizer@example.com');
```

When that email logs in via Google, the edge function automatically assigns the organizer role.

---

## Project Structure

```
supabase/
├── config.toml                  # Supabase CLI config for local dev
├── migrations/                  # Database migrations (applied in order)
│   ├── 001_create_extensions.sql
│   ├── 002_create_organizers_table.sql
│   ├── ...
│   ├── 020_create_views.sql
│   └── 021_setup_pg_cron.sql
├── functions/
│   ├── custom-access-token-hook/  # Auth hook — runs on every login
│   │   ├── index.ts
│   │   └── deno.json
│   └── on-auth-user-created/      # Webhook — runs on first signup
│       ├── index.ts
│       └── deno.json
├── setup-storage.sql            # Storage bucket creation + RLS policies
└── SETUP.md                     # This file
```

---

## Architecture Overview

| Responsibility | Supabase | Django (separate service) |
|----------------|----------|---------------------------|
| User auth (Google OAuth) | Yes | |
| JWT issuance | Yes | |
| All CRUD (PostgREST) | Yes | |
| RLS enforcement | Yes | |
| File storage | Yes | |
| Realtime subscriptions | Yes | |
| YOLO + OCR pipeline | | Yes |
| HMAC QR signing/verify | | Yes |
| Consent code generation | | Yes |
| Badge evaluation logic | | Yes |
| E-cert PDF generation | | Yes |

---

## Troubleshooting

### `supabase start` fails
Make sure Docker is running and you have enough resources (8GB+ RAM recommended).

### Migrations out of sync
```bash
supabase db reset          # Local: wipe and re-apply all
supabase db push           # Cloud: push pending migrations
```

### Edge function not triggering
For the Custom Access Token hook: verify it's enabled in Dashboard → Authentication → Hooks and the URL is correct. Check function logs in Dashboard → Edge Functions → Logs.

For the legacy webhook: verify it's configured on `auth.users` INSERT and the function URL is correct.

### RLS blocking queries
Remember: the `service_role` key bypasses RLS. Use it only in backend services (Django), never in the frontend.
