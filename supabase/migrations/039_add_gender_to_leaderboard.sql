-- Recreate leaderboard_virtual with gender column from runner_profiles
-- NOTE: gender is inserted before event_id here, which create-or-replace
-- cannot do (a view's existing column names are immutable; only end-appends
-- are allowed — SQLSTATE 42P16 on fresh replay). Drop first so the final
-- shape matches the cloud schema exactly.
drop view leaderboard_virtual;
create or replace view leaderboard_virtual as
select
    rp.full_name,
    rp.id as runner_id,
    rp.gender,
    r.event_id,
    sum(rl.distance_km) as total_km,
    rank() over (partition by r.event_id order by sum(rl.distance_km) desc) as rank
from run_logs rl
join runner_profiles rp on rp.id = rl.runner_id
join registrations r on r.runner_id = rl.runner_id and r.event_id = rl.event_id
group by rp.full_name, rp.id, rp.gender, r.event_id;
