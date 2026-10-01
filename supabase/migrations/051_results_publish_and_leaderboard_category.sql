-- ── RESULTS PUBLISH GATE (FR-69) + LEADERBOARD CATEGORY (UC15) ─
-- Organizer must explicitly publish results before the runner
-- leaderboard becomes visible. Defaults to false: every event is
-- gated until its organizer opts in.
alter table events
  add column if not exists results_published boolean default false;

-- Re-create leaderboard_virtual with the registration's race category
-- appended (new columns added at the end; existing columns unchanged
-- so create-or-replace stays compatible). One registration per
-- (event, runner) after migrations 006/049, so grouping by category
-- does not split runners across rows.
create or replace view leaderboard_virtual as
select
    rp.full_name,
    rp.id as runner_id,
    rp.gender,
    r.event_id,
    sum(rl.distance_km) as total_km,
    rank() over (partition by r.event_id order by sum(rl.distance_km) desc) as rank,
    r.category_id,
    rc.name as category_name
from run_logs rl
join runner_profiles rp on rp.id = rl.runner_id
join registrations r on r.runner_id = rl.runner_id and r.event_id = rl.event_id
left join race_categories rc on rc.id = r.category_id
group by rp.full_name, rp.id, rp.gender, r.event_id, r.category_id, rc.name;
