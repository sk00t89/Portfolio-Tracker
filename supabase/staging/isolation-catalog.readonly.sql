-- Read-only prerequisite AND post-test check. Only the approved staging dashboard.
-- This does not create users, rows, policies, grants, functions or jobs.
begin read only;
do $$
declare t text; r text; op text;
begin
    if (select count(*) from pg_catalog.pg_class
        where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','f','S'))<>3 then
        raise exception 'Unexpected public application relations';
    end if;
    if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace)<>3
       or exists (select 1 from pg_catalog.pg_proc where pronamespace='public'::regnamespace
           and (proname not in ('get_portfolio_performance_input','invalidate_performance_coverage','rls_auto_enable') or pronargs<>0)) then
        raise exception 'Unexpected application function or overload';
    end if;
    if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_event_trigger e on e.evtfoid=p.oid
        where p.oid='public.rls_auto_enable()'::regprocedure and pg_get_userbyid(p.proowner)='postgres'
        and p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[] and p.proacl is null
        and md5(p.prosrc)='c44fb229ea8a6b0afd04a0a33261c16c'
        and e.evtname='ensure_rls' and e.evtenabled='O' and e.evtevent='ddl_command_end'
        and e.evttags=array['CREATE TABLE','CREATE TABLE AS','SELECT INTO']::text[]) then
        raise exception 'Automatic RLS differs from reviewed installation';
    end if;
    if (select count(*) from pg_catalog.pg_policies where schemaname='public')<>3 then
        raise exception 'Unexpected policies';
    end if;
    foreach t in array array['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations'] loop
        if not exists (select 1 from pg_catalog.pg_class where oid=('public.'||t)::regclass and relrowsecurity and pg_get_userbyid(relowner)='postgres')
           or not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename=t
                and cmd='SELECT' and roles=array['authenticated']::name[]
                and qual='(( SELECT auth.uid() AS uid) = user_id)' and with_check is null) then
            raise exception 'Unexpected RLS or owner policy';
        end if;
        foreach r in array array['anon','authenticated'] loop
            foreach op in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
                if has_table_privilege(r,'public.'||t,op) then raise exception 'Unexpected client privilege';end if;
            end loop;
            if has_table_privilege(r,'public.'||t,'SELECT')<>(r='authenticated') then
                raise exception 'Unexpected read privilege';
            end if;
        end loop;
    end loop;
    if has_function_privilege('anon','public.get_portfolio_performance_input()','EXECUTE')
       or not has_function_privilege('authenticated','public.get_portfolio_performance_input()','EXECUTE')
       or has_function_privilege('anon','public.invalidate_performance_coverage()','EXECUTE')
       or has_function_privilege('authenticated','public.invalidate_performance_coverage()','EXECUTE')
       or not exists(select 1 from pg_proc where oid='public.get_portfolio_performance_input()'::regprocedure and not prosecdef and proconfig=array['search_path=""']::text[])
       or not exists(select 1 from pg_proc where oid='public.invalidate_performance_coverage()'::regprocedure and prosecdef and proconfig=array['search_path=""']::text[]) then
        raise exception 'Unexpected RPC grants or execution context';
    end if;
end;
$$;
select 'PASS catalog prerequisite; compare function bodies and event-trigger inventory with migration evidence' as result,
    (select count(*) from auth.users) as auth_users,
    (select count(*) from public.portfolio_performance_baselines) as baselines,
    (select count(*) from public.portfolio_ledger_events) as events,
    (select count(*) from public.portfolio_performance_observations) as observations;
rollback;
