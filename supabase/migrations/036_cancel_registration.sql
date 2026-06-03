create or replace function public.cancel_registration(
  p_registration_id uuid
) returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_runner_id uuid;
  v_reg record;
  v_user_email text;
begin
  select id into v_runner_id
  from public.runner_profiles
  where user_id = auth.uid();

  if v_runner_id is null then
    raise exception 'Runner profile not found';
  end if;

  select * into v_reg
  from public.registrations
  where id = p_registration_id
    and runner_id = v_runner_id;

  if not found then
    raise exception 'Registration not found or not yours';
  end if;

  if v_reg.checked_in then
    raise exception 'Cannot cancel after check-in';
  end if;

  select email into v_user_email
  from auth.users where id = auth.uid();

  insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
  values (
    auth.uid(),
    'registration_cancelled',
    p_registration_id,
    jsonb_build_object(
      'event_id', v_reg.event_id,
      'bib_number', v_reg.bib_number,
      'category_id', v_reg.category_id
    ),
    v_user_email
  );

  delete from public.registrations where id = p_registration_id;

  return true;
end;
$$;

drop policy if exists "runners can cancel own registration" on public.registrations;

create policy "runners can cancel own registration"
  on public.registrations
  for delete
  using (runner_id = public.my_runner_id() and checked_in = false);
