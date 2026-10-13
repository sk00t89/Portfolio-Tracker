import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const revertPath='supabase/staging/002-runtime.empty-revert.approval.sql';
export function buildStagingEmptyRevert() {
    const runtime=readFileSync('supabase/staging/002-runtime.approval.sql','utf8').replaceAll('\r\n','\n');
    const foundation=readFileSync('supabase/staging/001-foundation.auto-rls.approval.sql','utf8').replaceAll('\r\n','\n');
    const read=foundation.match(/create function public\.get_portfolio_performance_input\(\)[\s\S]*?\$\$;/)?.[0];
    if(!read)throw new Error('Foundation read function missing');
    const signatures=[...runtime.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\) returns /g)]
        .filter(match=>match[1]!=='get_portfolio_performance_input')
        .map(match=>`${match[1]}(${match[2].split(',').filter(Boolean).map(arg=>arg.trim().split(/\s+/)[1]).join(',')})`);
    if(signatures.length!==16)throw new Error('Runtime inventory changed; review recovery before regeneration');
    return `-- REVIEW ONLY: separate approval required; NOT part of runtime migration approval.
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
${read.replace('create function','create or replace function')}
revoke all on function public.get_portfolio_performance_input() from public,anon,authenticated,service_role;
grant execute on function public.get_portfolio_performance_input() to authenticated;
${signatures.reverse().map(signature=>`drop function public.${signature};`).join('\n')}
drop table public.staging_performance_corrections,public.staging_performance_runs,public.staging_performance_imports,public.staging_performance_market_cache,public.staging_runtime_environment;
alter table public.portfolio_performance_baselines drop column ledger_state;
notify pgrst,'reload schema';
commit;
`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
    if(process.argv.length!==2)throw new Error('Local generation only');
    writeFileSync(revertPath,buildStagingEmptyRevert());
    console.log('Empty-staging recovery draft prepared locally. No database connection.');
}
