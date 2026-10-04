-- Separate explicit approval required. Do not run during implementation/testing.
-- First verify dry-run output, functions/secrets, calendars and all database checks.
select cron.alter_job(jobid,active:=true) from cron.job where jobname='portfolio-daily-snapshot';
-- Disable: select cron.alter_job(jobid,active:=false) from cron.job where jobname='portfolio-daily-snapshot';
