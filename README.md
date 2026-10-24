# Pelikat Web

> Next.js 16 frontend for the Pelikat platform: race-event registrations and payments for runners, event management for organizers, and platform administration. Uses Supabase (Postgres + Auth + Storage) and the Django `pelikat-api` backend. PWA-enabled (Serwist).

## Stack

- Next.js 16 (App Router, React 19, TypeScript)
- Tailwind CSS + shadcn/ui (Radix primitives)
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Serwist (PWA / service worker)
- MapLibre GL, Recharts, html5-qrcode / qrcode
- Vitest (unit), Playwright (E2E + PWA), k6 (load tests)

## Quick Start (Docker, recommended)

No local Node.js installation is required.

### Prerequisites

- Docker
- Docker Compose (v2+)

### Development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open http://localhost:3000 (hot reload / Fast Refresh enabled).

Stop: `CTRL + C` or `docker compose -f docker-compose.dev.yml down`.

### Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Stop: `docker compose -f docker-compose.prod.yml down`.

### Summary

| Environment | Command | Purpose |
|-------------|---------|---------|
| Development | `docker compose -f docker-compose.dev.yml up --build` | Local development with hot reload |
| Production | `docker compose -f docker-compose.prod.yml up --build -d` | Optimized production deployment |

You do not need `pnpm install` or a local Node.js: dependencies are installed inside the container. Any dependency changes require rebuilding the image.

## Local (pnpm, alternative)

```bash
pnpm install
pnpm dev          # next dev on :3000
pnpm build        # production build
pnpm lint         # eslint
```

## Tests

```bash
pnpm test             # vitest unit tests
pnpm test:e2e         # playwright E2E (auth flows, PWA install/offline, touch targets)
pnpm test:e2e:pwa     # playwright PWA config
pnpm test:k6          # k6 load test
pnpm test:k6:local    # k6 load test (local config)
# also: test:watch, test:ui, test:e2e:ui
```

## Environment Variables

See `.env.example` for the full list (names/purpose only — never commit real values):

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project connection (anon key is public-safe).
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose to the client.
- `DJANGO_URL` — base URL of the `pelikat-api` backend.
- `INTERNAL_API_KEY` — shared secret forwarded to the API on internal calls.
- `NEXT_PUBLIC_APP_URL` — public app URL.
- `PAYMENT_PROVIDER` / `NEXT_PUBLIC_PAYMENT_PROVIDER` — active payment provider.
- `NEXT_PUBLIC_TUNNEL_URL` — public tunnel URL for local internal-webhook testing.

## Supabase

Supabase setup lives in `supabase/` — start with [supabase/SETUP.md](supabase/SETUP.md), then [supabase/SEED.md](supabase/SEED.md) for seeding. Migrations in `supabase/migrations/`, seed data in `supabase/seed.sql` and `supabase/seeds/`, edge functions in `supabase/functions/`.

## Project Structure

```
pelikat-web/
├── src/
│   ├── app/            # App Router pages
│   │   ├── runner/     # Runner-facing pages (badges, documents, leaderboard, payments, repc)
│   │   ├── organizer/  # Organizer pages (events, runners, analytics, merch, financial, payment…)
│   │   ├── admin/      # Platform admin (registrations, billing, security, audit logs, settings…)
│   │   ├── (auth)/     # Auth routes
│   │   └── api/        # Next.js API routes (proxy/admin/documents/payments/repc/leaderboard)
│   ├── components/     # UI components (shadcn/ui based)
│   ├── hooks/          # React hooks
│   ├── lib/            # Supabase clients, utilities
│   └── proxy.ts        # Internal proxy to pelikat-api
├── supabase/           # Supabase config, migrations, seed, edge functions, docs (SEED.md, SETUP.md)
├── tests/              # Integration / security / reliability / usability suites
├── e2e/                # Playwright E2E specs
├── k6/                 # Load tests
├── docs/               # Specs & requirements (spec_nextjs.md, spec_supabase.md, …)
├── docker-compose.dev.yml / docker-compose.prod.yml
└── playwright.config.ts / playwright.pwa.config.ts / vitest.config.ts
```

## Docs

- `docs/spec_nextjs.md`, `docs/spec_supabase.md`, `docs/spec_django.md` — per-system specs
- `docs/modules_and_features.md` — module & feature breakdown
- `docs/setup_resend.md` — email (Resend) setup
- `supabase/SETUP.md`, `supabase/SEED.md` — Supabase setup and seeding

## Team Workflow

When a new developer joins:

1. Clone the repository: `git clone <repository-url> && cd pelikat-web`
2. Start the development environment: `docker compose -f docker-compose.dev.yml up --build`
3. Open http://localhost:3000 and start developing.

Configure the env vars above (`.env`) before first run.

<!-- TODO: deployment target (hosting, analytics wiring, monitoring) is not documented in the repo — add a Deployment section once decided. -->
