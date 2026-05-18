-- ── REPC CONSENT CODES ─────────────────────────────────────────
create table repc_consent_codes (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id),
  organizer_id    uuid references organizers(id),
  code            text unique not null,
  is_used         boolean default false,
  expires_at      timestamptz not null,
  created_at      timestamptz default now()
);
