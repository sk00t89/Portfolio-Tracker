-- REVIEW ONLY: separate approval required; NOT part of runtime migration approval.
-- Empty synthetic staging only, target vutjthqlgzokeylaxpzp must be independently verified.
-- No CASCADE. Stop if Auth or any portfolio/runtime/cache data exists.
begin;
do $$ declare t text;n bigint;begin
    if (select count(*) from auth.users)<>0 then raise exception 'Empty recovery requires zero Auth users';end if;
    if (select count(*) from public.staging_runtime_environment)<>1 or not exists(select 1 from public.staging_runtime_environment where project_ref='vutjthqlgzokeylaxpzp' and synthetic_only and runtime_version='staging-runtime-v1') then raise exception 'Unexpected runtime identity';end if;
    if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S'))<>8 then raise exception 'Unexpected recovery catalog';end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))<>19 then raise exception 'Unexpected recovery functions';end if;
    foreach t in array array['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations','staging_performance_imports','staging_performance_runs','staging_performance_market_cache','staging_performance_corrections'] loop
        execute format('select count(*) from public.%I',t) into n;
        if n<>0 then raise exception 'Recovery refuses nonempty table %',t;end if;
    end loop;
end $$;
create or replace function public.get_portfolio_performance_input() returns jsonb
language sql stable security invoker set search_path = '' as $$
    select jsonb_build_object('apiVersion','portfolio-performance-v1','baseline',b.baseline,
        'revision',b.revision,'cashFlowCoverage',b.cash_flow_coverage,'costCoverage',b.cost_coverage,
        'convention',b.convention,'returnBasis',b.return_basis,
        'events',coalesce((select jsonb_agg(e.event || jsonb_build_object(
            'id',e.event_id,'date',e.trade_date,'sequence',e.sequence,'accountId',e.account_key,
            'source',e.source,'externalReference',e.external_reference) order by e.trade_date,e.sequence)
            from public.portfolio_ledger_events e where e.user_id=b.user_id),'[]'::jsonb),
        'observations',coalesce((select jsonb_agg(o.observation || jsonb_build_object('date',o.valuation_date,'revision',o.revision)
            order by o.valuation_date) from public.portfolio_performance_observations o
            where o.user_id=b.user_id and o.revision=b.revision),'[]'::jsonb))
    from public.portfolio_performance_baselines b where b.user_id=(select auth.uid());
$$;
revoke all on function public.get_portfolio_performance_input() from public,anon,authenticated,service_role;
grant execute on function public.get_portfolio_performance_input() to authenticated;
drop function public.archive_staging_market_batch(jsonb);
drop function public.register_staging_portfolio_cash(jsonb,uuid,bigint);
drop function public.publish_staging_history_batch(uuid,bigint,jsonb);
drop function public.correct_staging_portfolio_trade(uuid,jsonb,uuid,bigint);
drop function public.commit_staging_performance_import(uuid,text,jsonb,bigint);
drop function public.get_staging_performance_worker_input(uuid);
drop function public.get_staging_performance_environment();
drop function public.publish_staging_performance_observations(uuid,bigint,jsonb);
drop function public.register_staging_portfolio_trade(jsonb,uuid,bigint,jsonb);
drop function public.register_staging_trade_for_owner(uuid,jsonb,uuid,bigint,jsonb);
drop function public.initialize_staging_performance_portfolio(jsonb);
drop function public.replay_staging_performance_ledger(jsonb,jsonb);
drop function public.staging_cash_delta(jsonb,text,text,numeric);
drop function public.validate_staging_opening(jsonb);
drop function public.require_staging_performance_test();
drop function public.require_staging_synthetic_user(uuid);
drop table public.staging_performance_corrections,public.staging_performance_runs,public.staging_performance_imports,public.staging_performance_market_cache,public.staging_runtime_environment;
alter table public.portfolio_performance_baselines drop column ledger_state;
notify pgrst,'reload schema';
commit;
