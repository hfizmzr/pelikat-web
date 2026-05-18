-- ── REPC COLLECTIONS ──────────────────────────────────────────
create table repc_collections (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id),
  organizer_id    uuid references organizers(id),
  collected_by    text,
  collected_at    timestamptz default now(),
  is_proxy        boolean default false,
  consent_code_id uuid references repc_consent_codes(id)
);
