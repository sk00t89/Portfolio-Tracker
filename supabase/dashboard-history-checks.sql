-- Optional manual database verification AFTER dashboard-history.sql is approved and applied.
-- Not executed by Codex. Requires SQL-editor/admin access and one existing auth user.
-- Every test data change is rolled back. This is not a migration.
begin;
do $$
declare
    v_user uuid;
    v_date date := (clock_timestamp() at time zone 'Europe/Stockholm')::date - 1;
    v_older timestamptz;
    v_newer timestamptz;
    v_value numeric;
    v_observed timestamptz;
begin
    select id into v_user from auth.users order by created_at limit 1;
    if v_user is null then raise exception 'Create a test auth user first'; end if;
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    v_older := (v_date + time '12:00') at time zone 'Europe/Stockholm';
    v_newer := v_older + interval '1 minute';
    delete from public.portfolio_daily_values where user_id = v_user and valuation_date = v_date;

    if not public.save_portfolio_daily_value(v_date, 200, v_newer) then raise exception 'New observation not written'; end if;
    if public.save_portfolio_daily_value(v_date, 100, v_older) then raise exception 'Older observation overwrote newer'; end if;
    if public.save_portfolio_daily_value(v_date, 300, v_newer) then raise exception 'Equal observation time overwrote existing value'; end if;
    select total_value_sek, observed_at into v_value, v_observed
        from public.portfolio_daily_values where user_id = v_user and valuation_date = v_date;
    if v_value <> 200 or v_observed <> v_newer then raise exception 'Stored value or observation changed'; end if;

    if not public.save_portfolio_daily_value(v_date, 400, v_newer + interval '1 minute') then raise exception 'Later observation rejected'; end if;
    if has_table_privilege('authenticated', 'public.portfolio_daily_values', 'INSERT')
        or has_table_privilege('authenticated', 'public.portfolio_daily_values', 'UPDATE') then
        raise exception 'Direct writes can bypass ordering';
    end if;
    raise notice 'Ordering, equal-time idempotency and direct-write restrictions passed';
end;
$$;
rollback;
