-- ── RUN LOG SERVER-SIDE VALIDATION (FR-61) ────────────────────
-- Reject invalid rows that predate server-side validation.
delete from run_logs
where coalesce(distance_km, 0) <= 0
   or coalesce(duration_sec, 0) <= 0;

alter table run_logs
  add constraint run_logs_positive_values
  check (coalesce(distance_km, 0) > 0 and coalesce(duration_sec, 0) > 0);

-- Insert runs via RPC so pace is computed and validated server-side.
create or replace function public.log_run(
  p_distance_km numeric,
  p_duration_sec int,
  p_gps_data jsonb default null
) returns public.run_logs
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_runner_id uuid;
  v_run public.run_logs;
begin
  select id into v_runner_id
  from public.runner_profiles
  where user_id = auth.uid();

  if v_runner_id is null then
    raise exception 'Runner profile not found';
  end if;

  if p_distance_km is null or p_distance_km <= 0 then
    raise exception 'Distance must be greater than 0';
  end if;

  if p_duration_sec is null or p_duration_sec <= 0 then
    raise exception 'Time must be greater than 0';
  end if;

  insert into public.run_logs (
    runner_id,
    distance_km,
    duration_sec,
    pace_min_km,
    gps_data
  )
  values (
    v_runner_id,
    p_distance_km,
    p_duration_sec,
    p_duration_sec / 60.0 / p_distance_km,
    p_gps_data
  )
  returning * into v_run;

  return v_run;
end;
$$;
