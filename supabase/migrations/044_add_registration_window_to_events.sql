-- Add registration window columns to events table
alter table events
  add column if not exists reg_open  timestamptz,
  add column if not exists reg_close timestamptz;
