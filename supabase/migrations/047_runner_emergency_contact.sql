-- ── RUNNER EMERGENCY CONTACT ──────────────────────────────────
alter table runner_profiles
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text;

-- PDPA erasure must also wipe emergency contact PII.
create or replace function anonymize_runner_profile(p_runner_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  update public.runner_profiles set
    full_name = 'Deleted User',
    phone = null,
    dob = null,
    gender = null,
    ic_encrypted = null,
    ic_document_path = null,
    ic_document_mime = null,
    ic_document_uploaded_at = null,
    emergency_contact_name = null,
    emergency_contact_phone = null,
    t_shirt_size = null,
    is_deleted = true,
    deleted_at = now(),
    pdpa_agreed = false
  where id = p_runner_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Profile not found or access denied';
  end if;
end;
$$;
