-- MANUAL ONLY. Requires pg_cron, pg_net and Supabase Vault.
-- Before running: create Vault secrets portfolio_snapshot_url (full Edge Function URL)
-- and portfolio_snapshot_secret (same >=32-character random secret as SNAPSHOT_CRON_SECRET).
-- Never put the secret in frontend .env variables or source control.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function public.enqueue_portfolio_snapshot_batch(p_after_user_id uuid default null,p_dry_run boolean default true)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name='portfolio_snapshot_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='portfolio_snapshot_secret';
    if v_url is null or length(v_secret) < 32 or v_secret is null then raise exception 'Snapshot Vault configuration missing'; end if;
    select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-snapshot-secret',v_secret),
      body:=jsonb_build_object('dryRun',p_dry_run,'afterUserId',p_after_user_id,'continue',true),timeout_milliseconds:=90000) into v_request;
    return v_request;
end; $$;
revoke all on function public.enqueue_portfolio_snapshot_batch(uuid,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_portfolio_snapshot_batch(uuid,boolean) to service_role;

-- UTC cron wakes every ten minutes; SQL restricts it to Stockholm 23:30/23:40/23:50.
-- Therefore US close at 21:00 or 22:00 Stockholm, half days and DST are all covered.
-- Every retry starts from the first user; the worker skips completed server runs.
select cron.schedule('portfolio-daily-snapshot','*/10 * * * *',
  $job$select public.enqueue_portfolio_snapshot_batch(null,false)
       where (clock_timestamp() at time zone 'Europe/Stockholm')::time >= time '23:30';$job$);
-- It remains INACTIVE after this transaction. Running this file does not activate cron.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='portfolio-daily-snapshot';
commit;
