-- Run manually AFTER dashboard-history.sql and manual-assets.sql. Never auto-applied.
begin;
alter table public.holdings add column if not exists coin_id text;
alter table public.portfolio_daily_values add column if not exists source text not null default 'client';
alter table public.portfolio_daily_values add column if not exists source_metadata jsonb not null default '{}'::jsonb;
grant all on public.portfolio_daily_values to service_role;

create table if not exists public.portfolio_snapshot_runs (
    user_id uuid not null references auth.users(id) on delete cascade,
    valuation_date date not null,
    attempted_at timestamptz not null,
    status text not null check(status in ('saved','superseded','failed')),
    reason text,
    primary key(user_id,valuation_date)
);
alter table public.portfolio_snapshot_runs enable row level security;
revoke all on public.portfolio_snapshot_runs from public, anon, authenticated;
grant all on public.portfolio_snapshot_runs to service_role;
grant select on public.portfolio_snapshot_runs to authenticated;
drop policy if exists "Own snapshot outcomes" on public.portfolio_snapshot_runs;
create policy "Own snapshot outcomes" on public.portfolio_snapshot_runs for select to authenticated using ((select auth.uid())=user_id);

-- A revision protects the worker from input edits while it fetches prices.
-- Price refreshes themselves do not change canonical quantities or ownership.
create or replace function public.bump_portfolio_input_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_old jsonb; v_new jsonb;
begin
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    if tg_table_name = 'holdings' then
        v_old := v_old - array['current_price','current_value_sek','previous_close','price_updated_at','value_sek','updated_at','average_price','average_price_sek'];
        v_new := v_new - array['current_price','current_value_sek','previous_close','price_updated_at','value_sek','updated_at','average_price','average_price_sek'];
    elsif tg_table_name = 'lysa_data' then
        if coalesce(v_new->>'data_type',v_old->>'data_type') <> 'transactions' then return null; end if;
        v_old := v_old - 'updated_at'; v_new := v_new - 'updated_at';
    end if;
    if v_old is not distinct from v_new then return null; end if;
    -- Ownership transfers invalidate both accounts.
    for v_user in select distinct id from (values ((v_old->>'user_id')::uuid), ((v_new->>'user_id')::uuid)) as owners(id) where id is not null loop
        if not exists(select 1 from auth.users where id=v_user) then continue; end if;
        insert into public.portfolio_snapshot_settings(user_id,input_revision) values(v_user,1)
        on conflict(user_id) do update set input_revision = public.portfolio_snapshot_settings.input_revision+1;
    end loop;
    return null;
end; $$;
revoke all on function public.bump_portfolio_input_revision() from public,anon,authenticated;
drop trigger if exists snapshot_inputs_changed on public.holdings;
create trigger snapshot_inputs_changed after insert or update or delete on public.holdings for each row execute function public.bump_portfolio_input_revision();
drop trigger if exists snapshot_inputs_changed on public.manual_assets;
create trigger snapshot_inputs_changed after insert or update or delete on public.manual_assets for each row execute function public.bump_portfolio_input_revision();
drop trigger if exists snapshot_inputs_changed on public.lysa_data;
create trigger snapshot_inputs_changed after insert or update or delete on public.lysa_data for each row execute function public.bump_portfolio_input_revision();

-- One SQL statement gives a consistent MVCC view of all inputs and revision.
create or replace function public.get_portfolio_snapshot_input(p_user_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
    select jsonb_build_object('ready',s.manual_assets_ready,'revision',s.input_revision::text,
      'holdings',coalesce((select jsonb_agg(to_jsonb(h)) from public.holdings h where h.user_id=p_user_id),'[]'::jsonb),
      'manual_assets',coalesce((select jsonb_agg(to_jsonb(a)) from public.manual_assets a where a.user_id=p_user_id),'[]'::jsonb),
      'lysa_transactions',coalesce((select l.data from public.lysa_data l where l.user_id=p_user_id and l.data_type='transactions'),'[]'::jsonb))
    from public.portfolio_snapshot_settings s where s.user_id=p_user_id;
$$;

create or replace function public.save_server_portfolio_daily_value(
    p_user_id uuid, p_revision bigint, p_valuation_date date, p_total_value_sek numeric,
    p_observed_at timestamptz, p_metadata jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_ready boolean; v_written integer;
begin
    select input_revision,manual_assets_ready into v_revision,v_ready from public.portfolio_snapshot_settings where user_id=p_user_id for update;
    if v_ready is distinct from true or v_revision is distinct from p_revision then raise exception 'Portfolio inputs changed'; end if;
    if p_observed_at is null or p_observed_at > clock_timestamp() + interval '1 minute'
      or p_observed_at < clock_timestamp() - interval '20 minutes'
      or p_valuation_date is distinct from (p_observed_at at time zone 'Europe/Stockholm')::date
      or p_valuation_date is distinct from (clock_timestamp() at time zone 'Europe/Stockholm')::date
      or p_total_value_sek is null or p_total_value_sek < 0
      or p_total_value_sek::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid server observation'; end if;
    insert into public.portfolio_daily_values as existing(user_id,valuation_date,total_value_sek,observed_at,updated_at,source,source_metadata)
    values(p_user_id,p_valuation_date,p_total_value_sek,p_observed_at,clock_timestamp(),'server',coalesce(p_metadata,'{}'::jsonb))
    on conflict(user_id,valuation_date) do update set total_value_sek=excluded.total_value_sek,
      observed_at=excluded.observed_at,updated_at=excluded.updated_at,source=excluded.source,source_metadata=excluded.source_metadata
      where existing.observed_at < excluded.observed_at;
    get diagnostics v_written = row_count;
    return v_written=1;
end; $$;

-- Client writes still use their original RPC, and clear server provenance on replacement.
create or replace function public.save_portfolio_daily_value(p_valuation_date date,p_total_value_sek numeric,p_observed_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_written integer;
begin
    if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
    if p_observed_at is null or p_observed_at > clock_timestamp()+interval '5 minutes'
      or p_valuation_date is distinct from (p_observed_at at time zone 'Europe/Stockholm')::date
      or p_total_value_sek is null or p_total_value_sek < 0 or p_total_value_sek::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid portfolio observation'; end if;
    insert into public.portfolio_daily_values as existing(user_id,valuation_date,total_value_sek,observed_at,updated_at,source,source_metadata)
    values(v_user,p_valuation_date,p_total_value_sek,p_observed_at,clock_timestamp(),'client','{}')
    on conflict(user_id,valuation_date) do update set total_value_sek=excluded.total_value_sek,
      observed_at=excluded.observed_at,updated_at=excluded.updated_at,source='client',source_metadata='{}'
      where existing.observed_at < excluded.observed_at;
    get diagnostics v_written=row_count; return v_written=1;
end; $$;
revoke all on function public.get_portfolio_snapshot_input(uuid),public.save_server_portfolio_daily_value(uuid,bigint,date,numeric,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.get_portfolio_snapshot_input(uuid),public.save_server_portfolio_daily_value(uuid,bigint,date,numeric,timestamptz,jsonb) to service_role;
revoke all on function public.save_portfolio_daily_value(date,numeric,timestamptz) from public,anon;
grant execute on function public.save_portfolio_daily_value(date,numeric,timestamptz) to authenticated;

create or replace function public.record_portfolio_snapshot_outcome(p_user_id uuid,p_date date,p_attempted_at timestamptz,p_status text,p_reason text)
returns void language sql security definer set search_path = '' as $$
    insert into public.portfolio_snapshot_runs as existing(user_id,valuation_date,attempted_at,status,reason)
    values(p_user_id,p_date,p_attempted_at,p_status,left(p_reason,300))
    on conflict(user_id,valuation_date) do update set attempted_at=excluded.attempted_at,status=excluded.status,reason=excluded.reason
    where existing.attempted_at < excluded.attempted_at;
$$;
revoke all on function public.record_portfolio_snapshot_outcome(uuid,date,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_portfolio_snapshot_outcome(uuid,date,timestamptz,text,text) to service_role;
commit;
