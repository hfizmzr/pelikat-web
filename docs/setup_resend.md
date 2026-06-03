# Resend Email Setup Guide

This document covers how to configure Resend for the Pelikat platform.

## Overview

Resend is used to send transactional emails from Supabase Edge Functions. The primary use case is notifying admins when a new organizer submits an application via the form at `/organizer/apply/form`.

### Where Resend is Used

| File | Purpose |
|------|---------|
| `supabase/functions/notify-organizer-application/index.ts` | Sends email to all admin users when an organizer application is submitted |
| `src/app/api/admin/health/route.ts` | Health check that verifies `RESEND_API_KEY` is configured |

---

## Prerequisites

1. A [Resend account](https://resend.com)
2. A Resend API key (starts with `re_`)
3. (Production) A domain you own and can verify with Resend

---

## Quick Start

### 1. Get Your API Key

1. Log in to [Resend Dashboard](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Copy the key (starts with `re_`)

### 2. Configure Environment Variables

#### Local Development (`.env`)

Add to your `.env` file:

```env
RESEND_API_KEY=re_your_api_key_here
```

#### Supabase Edge Functions (Secrets)

Edge Functions read from Supabase secrets, not `.env`. Set them via CLI:

```bash
# Development (allows any origin for local testing)
npx supabase secrets set RESEND_API_KEY='re_your_api_key_here' --project-ref ugexrrslijmwtieevjbs
npx supabase secrets set FROM_EMAIL='onboarding@resend.dev' --project-ref ugexrrslijmwtieevjbs

# Production (use your verified domain)
npx supabase secrets set RESEND_API_KEY='re_your_api_key_here' --project-ref ugexrrslijmwtieevjbs
npx supabase secrets set FROM_EMAIL='notifications@pelikat.com' --project-ref ugexrrslijmwtieevjbs
npx supabase secrets set CORS_ALLOWED_ORIGINS='https://pelikat.com' --project-ref ugexrrslijmwtieevjbs
```

> **Note:** `FROM_EMAIL` and `CORS_ALLOWED_ORIGINS` are optional. If omitted, the Edge Function falls back to:
> - `FROM_EMAIL`: `notifications@pelikat.com`
> - `CORS_ALLOWED_ORIGINS`: `*` (allow all origins)

---

## Domain Verification (Required for Production)

Resend **rejects** emails sent from unverified domains or public email providers (`@gmail.com`, `@yahoo.com`, etc.).

### Common Error

```json
{
  "name": "validation_error",
  "message": "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains"
}
```

### How to Verify Your Domain

1. Go to [Resend Dashboard → Domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain (e.g., `pelikat.com`)
4. Add the DNS records shown by Resend to your domain's DNS settings
5. Wait for verification (can take a few minutes to hours)
6. Update `FROM_EMAIL` to use your verified domain:
   ```bash
   npx supabase secrets set FROM_EMAIL='notifications@pelikat.com' --project-ref ugexrrslijmwtieevjbs
   ```

### Using Resend's Test Address (Development Only)

If you don't have a verified domain yet, use Resend's default test address:

```bash
npx supabase secrets set FROM_EMAIL='onboarding@resend.dev' --project-ref ugexrrslijmwtieevjbs
```

**Limitations:**
- Emails may show "Sent with Resend" branding
- Some email providers may mark them as spam
- Recommended only for development/testing

---

## Verifying Your Setup

### 1. Check Health Endpoint

Visit `http://localhost:3000/api/admin/health` (or your production URL). Look for:

```json
{
  "status": "healthy",
  "checks": {
    "email": {
      "status": "healthy",
      "message": "Email service configured"
    }
  }
}
```

### 2. Test the Organizer Application Flow

1. Go to `/organizer/apply/form`
2. Fill in the form with test data
3. Submit
4. Check your admin email inbox for the notification

### 3. Check Edge Function Logs

In the Supabase Dashboard, go to **Edge Functions → notify-organizer-application → Logs**.

A successful response looks like:

```json
{
  "success": true,
  "recipients": 2,
  "failed": 0
}
```

If `failed > 0`, the emails were found but Resend rejected them (usually a domain verification issue).

---

## Troubleshooting

### "The [domain] domain is not verified" (403)

**Cause:** The `FROM_EMAIL` domain is not verified in Resend.

**Fix:**
- Development: Set `FROM_EMAIL` to `onboarding@resend.dev`
- Production: Verify your domain at https://resend.com/domains

### CORS Errors in Browser

**Cause:** The Supabase Edge Function preflight response is missing or blocking CORS headers.

**Fix:**
1. Ensure `CORS_ALLOWED_ORIGINS` includes your frontend URL:
   ```bash
   npx supabase secrets set CORS_ALLOWED_ORIGINS='http://localhost:3000,https://pelikat.com' --project-ref ugexrrslijmwtieevjbs
   ```
2. Redeploy the edge function after code changes:
   ```bash
   npx supabase functions deploy notify-organizer-application --project-ref ugexrrslijmwtieevjbs
   ```
3. Hard refresh the browser (Ctrl+Shift+R) to clear cached preflight responses.

### "No admin users found"

**Cause:** No users in `auth.users` have `app_metadata.role = 'admin'`.

**Fix:** Run this SQL to grant admin role to a user:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'your-admin-email@example.com';
```

### "Email service not configured" in Health Check

**Cause:** `RESEND_API_KEY` is missing from `.env` (for health check) or Supabase secrets (for Edge Functions).

**Fix:** Add `RESEND_API_KEY` to both:
- `.env` (for Next.js health check)
- Supabase secrets (for Edge Functions)

---

## Environment Variable Reference

| Variable | Location | Required | Description |
|----------|----------|----------|-------------|
| `RESEND_API_KEY` | `.env` + Supabase Secrets | Yes | Resend API key (`re_...`) |
| `FROM_EMAIL` | Supabase Secrets | No | Sender email address. Falls back to `notifications@pelikat.com` |
| `CORS_ALLOWED_ORIGINS` | Supabase Secrets | No | Comma-separated list of allowed origins. Falls back to `*` |

---

## Related Files

- `supabase/functions/notify-organizer-application/index.ts` — Edge Function that sends emails
- `src/app/organizer/apply/form/page.tsx` — Frontend form that triggers the email
- `src/app/api/admin/health/route.ts` — Health check endpoint

---

## Further Reading

- [Resend Documentation](https://resend.com/docs)
- [Resend Domain Verification](https://resend.com/docs/dashboard/domains/introduction)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
