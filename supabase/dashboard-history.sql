-- Run manually in the Supabase SQL editor after reviewing. No automatic migration.
begin;

alter table public.holdings add column if not exists previous_close numeric;

create table if not exists public.portfolio_daily_values (
    user_id uuid not null references auth.users(id) on delete cascade,
    valuation_date date not null,
    total_value_sek numeric not null check (total_value_sek >= 0),
    observed_at timestamptz not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, valuation_date)
);

-- Also supports installations that already ran the earlier version of this manual SQL.
alter table public.portfolio_daily_values add column if not exists observed_at timestamptz;
update public.portfolio_daily_values set observed_at = updated_at where observed_at is null;
alter table public.portfolio_daily_values alter column observed_at set not null;

alter table public.portfolio_daily_values enable row level security;
revoke all on public.portfolio_daily_values from public, anon, authenticated;
grant select on public.portfolio_daily_values to authenticated;

drop policy if exists "Users manage their own daily values" on public.portfolio_daily_values;
create policy "Users manage their own daily values"
    on public.portfolio_daily_values for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- No direct authenticated INSERT/UPDATE: all writes must pass the atomic ordering check.
create or replace function public.save_portfolio_daily_value(
    p_valuation_date date, p_total_value_sek numeric, p_observed_at timestamptz
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_written integer;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_observed_at is null or p_observed_at > clock_timestamp() + interval '5 minutes'
        or p_valuation_date is distinct from (p_observed_at at time zone 'Europe/Stockholm')::date
        or p_total_value_sek is null or p_total_value_sek < 0
        or p_total_value_sek::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Invalid portfolio observation' using errcode = '22023';
    end if;
    insert into public.portfolio_daily_values as existing
        (user_id, valuation_date, total_value_sek, observed_at, updated_at)
    values (v_user_id, p_valuation_date, p_total_value_sek, p_observed_at, clock_timestamp())
    on conflict (user_id, valuation_date) do update
        set total_value_sek = excluded.total_value_sek,
            observed_at = excluded.observed_at, updated_at = clock_timestamp()
        where existing.observed_at < excluded.observed_at;
    get diagnostics v_written = row_count;
    return v_written = 1;
end;
$$;

revoke all on function public.save_portfolio_daily_value(date, numeric, timestamptz) from public, anon;
grant execute on function public.save_portfolio_daily_value(date, numeric, timestamptz) to authenticated;

commit;
