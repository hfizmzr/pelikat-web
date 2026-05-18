-- ── VIEWS ─────────────────────────────────────────────────────

-- Registration count per event (used in organizer dashboard)
create or replace view event_registration_counts as
select event_id, count(*) as total,
       sum(case when checked_in then 1 else 0 end) as checked_in_count
from registrations
group by event_id;

-- Leaderboard (virtual run, ranked by distance)
create or replace view leaderboard_virtual as
select rp.full_name, rp.id as runner_id,
       r.event_id, sum(rl.distance_km) as total_km,
       rank() over (partition by r.event_id order by sum(rl.distance_km) desc) as rank
from run_logs rl
join runner_profiles rp on rp.id = rl.runner_id
join registrations r on r.runner_id = rl.runner_id and r.event_id = rl.event_id
group by rp.full_name, rp.id, r.event_id;
