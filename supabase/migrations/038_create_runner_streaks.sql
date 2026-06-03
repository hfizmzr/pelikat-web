-- Runner streaks table (consecutive-day tracking)
create table runner_streaks (
    runner_id      uuid primary key references runner_profiles(id) on delete cascade,
    current_streak int not null default 0,
    longest_streak int not null default 0,
    last_run_date  date,
    updated_at     timestamptz not null default now()
);

-- Enable RLS
alter table runner_streaks enable row level security;

-- RLS: runner sees own streak
create policy "runner sees own streak" on runner_streaks
    for select using (runner_id = my_runner_id());

-- Function: update streak when a run_log is inserted
create or replace function update_runner_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into runner_streaks (runner_id, current_streak, longest_streak, last_run_date)
    values (new.runner_id, 1, 1, current_date)
    on conflict (runner_id) do update set
        current_streak = case
            when runner_streaks.last_run_date = current_date - interval '1 day'
                then runner_streaks.current_streak + 1
            when runner_streaks.last_run_date = current_date
                then runner_streaks.current_streak
            else 1
        end,
        longest_streak = greatest(
            runner_streaks.longest_streak,
            case
                when runner_streaks.last_run_date = current_date - interval '1 day'
                    then runner_streaks.current_streak + 1
                when runner_streaks.last_run_date = current_date
                    then runner_streaks.current_streak
                else 1
            end
        ),
        last_run_date = current_date,
        updated_at = now();
    return new;
end;
$$;

-- Trigger fires on every run_log insert
create trigger on_run_log_insert_streak
    after insert on run_logs
    for each row
    execute function update_runner_streak();
