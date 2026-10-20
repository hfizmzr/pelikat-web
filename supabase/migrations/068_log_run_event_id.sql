-- ── LOG_RUN: optional event linking (virtual-run certificates) ─
-- Additive, backward-compatible extension of 048's log_run: the
-- signature grows a trailing p_event_id uuid DEFAULT NULL. Named-arg
-- calls (runner run-log page) and positional calls both stay valid —
-- existing calls simply omit p_event_id and keep NULL event_id
-- (generic runs are unaffected).
--
-- When p_event_id IS provided, the run is claimed for that event:
-- the caller must hold a CONFIRMED registration (paid or waived —
-- see src/lib/registration-status.ts) for the event. Gamification
-- distance must not be attachable to arbitrary events, since the
-- virtual-event progress bar and e-cert path sum run_logs by
-- (event_id, runner_id).

create or replace function public.log_run(
  p_distance_km numeric,
  p_duration_sec int,
  p_gps_data jsonb default null,
  p_event_id uuid default null
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

  if p_event_id is not null then
    -- Event-linked run: require a confirmed registration for the event
    -- (paid or waived complimentary). Raises otherwise.
    if not exists (
      select 1
      from public.registrations r
      where r.runner_id = v_runner_id
        and r.event_id = p_event_id
        and r.payment_status in ('paid', 'waived')
    ) then
      raise exception 'No confirmed registration for this event';
    end if;
  end if;

  insert into public.run_logs (
    runner_id,
    event_id,
    distance_km,
    duration_sec,
    pace_min_km,
    gps_data
  )
  values (
    v_runner_id,
    p_event_id,
    p_distance_km,
    p_duration_sec,
    p_duration_sec / 60.0 / p_distance_km,
    p_gps_data
  )
  returning * into v_run;

  return v_run;
end;
$$;
