import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const runtimeSources=['supabase-test/performance-runtime.sql','supabase-test/history-stage.sql','supabase-test/cash-stage.sql','supabase-test/market-archive.sql'];
export const draftPath='supabase/staging/002-runtime.approval.sql';
export function buildStagingRuntimeDraft() {
    const foundation=readFileSync('supabase/staging/001-foundation.auto-rls.approval.sql','utf8').replaceAll('\r\n','\n');
    const sourceHash=name=>{
        const match=foundation.match(new RegExp(`create function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));
        if(!match)throw new Error(`Foundation function missing: ${name}`);
        return createHash('md5').update(match[1]).digest('hex');
    };
    const hashes=runtimeSources.map(path=>`-- Source ${path} sha256 ${createHash('sha256').update(readFileSync(path,'utf8').replaceAll('\r\n','\n')).digest('hex')}`).join('\n');
    let body=runtimeSources.map(path=>readFileSync(path,'utf8').replaceAll('\r\n','\n')
        .replace(/^begin;$/m,'').replace(/^commit;$/m,'')
        .replace(/^--.*\n/gm,'').replace(/^notify pgrst.*$/gm,'')).join('\n');
    body=body.replaceAll('local_performance','staging_performance').replaceAll('local_portfolio','staging_portfolio').replaceAll('local_history','staging_history')
        .replaceAll('local_cash_delta','staging_cash_delta').replaceAll('archive_local_market_batch','archive_staging_market_batch')
        .replaceAll('local-public-market-archive','staging-synthetic-market-archive')
        .replaceAll('portfolio-performance-local-test','portfolio-performance-staging');
    body=body.replace(/do \$\$ begin\n[\s\S]*?end \$\$;/, 'select public.require_staging_performance_test();');
    body=body.replace(/create function public.require_staging_performance_test\(\) returns void[\s\S]*?revoke all on function public.require_staging_performance_test\(\) from public,anon,authenticated;/,'');
    body=body.replace("'syntheticOnly',true);", "'syntheticOnly',true,'projectRef','vutjthqlgzokeylaxpzp','runtimeVersion','staging-runtime-v1');");
    // Every public mutation/worker route with an explicit owner also checks the
    // disposable account marker. Pure replay helpers do not select an owner.
    body=body.replace(/(create (?:or replace )?function public\.\w+\(p_user_id uuid[\s\S]*?perform public.require_staging_performance_test\(\);)/g,
        '$1\n    perform public.require_staging_synthetic_user(p_user_id);');
    body=body.replace('v_state=public.replay_staging_performance_ledger(p_baseline,', 'perform public.validate_staging_opening(p_baseline);\n    v_state=public.replay_staging_performance_ledger(p_baseline,');
    body=body.replace("v_baseline=p_plan||jsonb_build_object('verified',true", "perform public.validate_staging_opening(p_plan);\n        v_baseline=p_plan||jsonb_build_object('verified',true");
    return `-- REVIEW DRAFT ONLY. NO CLOUD EXECUTION AUTHORIZED.
-- Intended project: vutjthqlgzokeylaxpzp. SQL cannot verify a Supabase project ID.
-- Mandatory dashboard/API identity verification before any approved cloud run.
-- Synthetic-only runtime. No Auth users, portfolio rows, jobs or deployments.
${hashes}
begin;
do $$ begin
    if (select count(*) from auth.users)<>0 then raise exception 'Runtime requires zero Auth users';end if;
    if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','f','S'))<>3
        or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations')
        and c.relkind='r' and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres')<>3
        then raise exception 'Unexpected foundation tables';end if;
    if (select count(*) from public.portfolio_performance_baselines)<>0
        or (select count(*) from public.portfolio_ledger_events)<>0
        or (select count(*) from public.portfolio_performance_observations)<>0 then raise exception 'Foundation must be empty';end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))<>3
        or not exists(select 1 from pg_proc where oid='public.rls_auto_enable()'::regprocedure and md5(prosrc)='c44fb229ea8a6b0afd04a0a33261c16c'
        and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog']::text[] and proacl is null)
        or not exists(select 1 from pg_event_trigger where evtname='ensure_rls' and evtenabled='O' and evtevent='ddl_command_end'
            and evtfoid='public.rls_auto_enable()'::regprocedure and evtowner='postgres'::regrole
            and evttags=array['CREATE TABLE','CREATE TABLE AS','SELECT INTO']::text[])
        then raise exception 'Unexpected foundation functions or automatic RLS';end if;
    if not exists(select 1 from pg_proc where oid='public.get_portfolio_performance_input()'::regprocedure
        and md5(replace(prosrc,E'\\r\\n',E'\\n'))='${sourceHash('get_portfolio_performance_input')}'
        and proowner='postgres'::regrole and not prosecdef and proconfig=array['search_path=""']::text[])
        or not exists(select 1 from pg_proc where oid='public.invalidate_performance_coverage()'::regprocedure
        and md5(replace(prosrc,E'\\r\\n',E'\\n'))='${sourceHash('invalidate_performance_coverage')}'
        and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']::text[])
        or not has_function_privilege('authenticated','public.get_portfolio_performance_input()','EXECUTE')
        or has_function_privilege('anon','public.get_portfolio_performance_input()','EXECUTE')
        or has_function_privilege('authenticated','public.invalidate_performance_coverage()','EXECUTE')
        or has_function_privilege('anon','public.invalidate_performance_coverage()','EXECUTE')
        then raise exception 'Unexpected foundation RPC definitions or privileges';end if;
    if exists(select 1 from pg_policies where schemaname='public' and (cmd<>'SELECT' or roles<>array['authenticated']::name[]
        or regexp_replace(qual,'\\s','','g')<>'((SELECTauth.uid()ASuid)=user_id)'))
        or (select count(*) from pg_policies where schemaname='public')<>3 then raise exception 'Unexpected foundation policies';end if;
    if exists(select 1 from (values('portfolio_performance_baselines'),('portfolio_ledger_events'),('portfolio_performance_observations')) t(name)
        cross join (values('anon'),('authenticated')) r(role)
        cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)
        where has_table_privilege(r.role,'public.'||t.name,p.privilege)<>(r.role='authenticated' and p.privilege='SELECT'))
        then raise exception 'Unexpected foundation table grants';end if;
end $$;
create table public.staging_runtime_environment (
    singleton boolean primary key check(singleton),
    project_ref text not null check(project_ref='vutjthqlgzokeylaxpzp'),
    runtime_version text not null check(runtime_version='staging-runtime-v1'),
    synthetic_only boolean not null check(synthetic_only)
);
insert into public.staging_runtime_environment values(true,'vutjthqlgzokeylaxpzp','staging-runtime-v1',true);
alter table public.staging_runtime_environment enable row level security;
revoke all on public.staging_runtime_environment from public,anon,authenticated,service_role;
grant select on public.staging_runtime_environment to service_role;
create function public.require_staging_synthetic_user(p_user_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$ begin
    if not exists(select 1 from auth.users where id=p_user_id and email like '%@portfolio-test.invalid'
        and raw_app_meta_data->>'portfolio_staging_synthetic'='true') then
        raise exception 'Marked synthetic staging account required' using errcode='42501';end if;
end $$;
revoke all on function public.require_staging_synthetic_user(uuid) from public,anon,authenticated;
create function public.require_staging_performance_test() returns void
language plpgsql stable security definer set search_path='' as $$ begin
    if not exists(select 1 from public.staging_runtime_environment where project_ref='vutjthqlgzokeylaxpzp'
        and runtime_version='staging-runtime-v1' and synthetic_only) then raise exception 'Staging identity missing';end if;
    if auth.uid() is not null then perform public.require_staging_synthetic_user(auth.uid());end if;
end $$;
revoke all on function public.require_staging_performance_test() from public,anon,authenticated;
create function public.validate_staging_opening(p_baseline jsonb) returns void
language plpgsql stable set search_path='' as $$ declare p jsonb;begin
    if p_baseline->>'source' is distinct from 'synthetic_test' then raise exception 'Synthetic opening required';end if;
    for p in select * from jsonb_array_elements(p_baseline->'positions') loop
        if (p->>'instrumentId' in ('synthetic-sek-equity','synthetic-us-equity','synthetic-nordnet-equity','synthetic-fund','synthetic-lysa-fund','synthetic-certificate')
            and p->>'currency'=case when p->>'instrumentId'='synthetic-us-equity' then 'USD' else 'SEK' end) is not true
            then raise exception 'Synthetic instrument registry required';end if;
    end loop;
end $$;
revoke all on function public.validate_staging_opening(jsonb) from public,anon,authenticated;
${body}
notify pgrst,'reload schema';
commit;
`;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/buildStagingRuntimeDraft.mjs')) {
    if(process.argv.length!==2)throw new Error('No execution or target options accepted');
    writeFileSync(draftPath,buildStagingRuntimeDraft());
    console.log('Prepared review SQL locally; no database connection.');
}
