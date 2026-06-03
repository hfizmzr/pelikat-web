-- Fix audit_log RLS: triggers need INSERT permission
-- Enforce append-only behavior (no updates, no deletes)

create policy "allow audit log inserts" on public.audit_log
  for insert with check (true);

create policy "no update on audit log" on public.audit_log
  for update using (false);

create policy "no delete on audit log" on public.audit_log
  for delete using (false);
