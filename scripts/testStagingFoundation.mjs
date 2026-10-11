// Rehearse the approval draft locally; no cloud credentials or URLs accepted.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';

const container=assertLocalDatabase();
const database=`portfolio_staging_${randomBytes(5).toString('hex')}`;
assert.ok(process.argv.length===2 || (process.argv.length===3 && process.argv[2]==='--auto-rls'), 'Only the local --auto-rls option is accepted');
const autoRls=process.argv[2]==='--auto-rls';
const draft=readFileSync(`supabase/staging/001-foundation${autoRls?'.auto-rls':''}.approval.sql`,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const proposal=readFileSync('supabase/proposals/portfolio-performance-v1.sql','utf8').replaceAll('\r\n','\n');
assert.equal(draft.slice(draft.indexOf('create table public.')).trim(),
    proposal.slice(proposal.indexOf('create table public.')).trim(),
    'Foundation must preserve the reviewed storage/RLS/read adapter');
const fingerprint=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(b) order by user_id)::text from public.portfolio_performance_baselines b),'')||coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(v) order by user_id,valuation_date)::text from public.portfolio_daily_values v),''));");
const before=fingerprint();
runLocalSql(`create database ${database} owner postgres;`,{admin:true});
function sql(input,expectedError){
    assertLocalDatabase();
    assert.match(database,/^portfolio_staging_[a-f0-9]{10}$/);
    const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],
        {input,encoding:'utf8',maxBuffer:1024*1024});
    if(expectedError){assert.notEqual(result.status,0);assert.match(result.stderr,expectedError);}
    else if(result.status!==0)throw new Error(result.stderr);
    return result.stdout.trim();
}
sql(`create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    grant usage on schema auth to authenticated;`);
let observedRls;
if(autoRls){
    observedRls=readFileSync('tests/fixtures/staging/rls-auto-enable.observed.sql','utf8').replaceAll('\r\n','\n');
    sql(observedRls);
    assert.equal(sql("select md5(prosrc) from pg_proc where oid='public.rls_auto_enable()'::regprocedure;"),'c44fb229ea8a6b0afd04a0a33261c16c','Fixture differs from observed cloud definition');
    sql("create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable();");
    sql("create function public.unexpected_probe() returns integer language sql as $$select 1;$$;");
    sql(draft,/requires an empty public application schema/);
    sql('drop function public.unexpected_probe();');
    sql("create function public.rls_auto_enable(integer) returns integer language sql as $$select 1;$$;");
    sql(draft,/requires an empty public application schema/);
    sql('drop function public.rls_auto_enable(integer);');
    sql('alter event trigger ensure_rls disable;');
    sql(draft,/requires an empty public application schema/);
    sql('alter event trigger ensure_rls enable;');
    sql("alter function public.rls_auto_enable() reset search_path;");
    sql(draft,/requires an empty public application schema/);
    sql("alter function public.rls_auto_enable() set search_path=pg_catalog;");
    sql(observedRls.replace(' cmd record;',' -- altered body\n cmd record;'));
    sql(draft,/requires an empty public application schema/);
    sql(observedRls);
    sql("revoke execute on function public.rls_auto_enable() from public;");
    sql(draft,/requires an empty public application schema/);
    // Restore the observed null ACL only in this disposable scratch database.
    sql('drop event trigger ensure_rls;drop function public.rls_auto_enable();');
    sql(observedRls);
    sql("create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable();");
    const metadata=sql("select pg_get_functiondef('public.rls_auto_enable()'::regprocedure)||coalesce(proacl::text,'NULL') from pg_proc where oid='public.rls_auto_enable()'::regprocedure;");
    sql(draft.replace(/commit;\s*$/,'select 1/0;commit;'),/division by zero/);
    assert.equal(sql("select pg_get_functiondef('public.rls_auto_enable()'::regprocedure)||coalesce(proacl::text,'NULL') from pg_proc where oid='public.rls_auto_enable()'::regprocedure;"),metadata,'Failed migration changed automatic RLS');
}
const userA=randomUUID(),userB=randomUUID();
sql(`insert into auth.users values('${userA}','staging-a@portfolio-test.invalid');`);
sql(draft,/requires zero Auth users/);
sql('delete from auth.users;create table public.guard_probe(id integer);');
sql(draft,/requires an empty public application schema/);
assert.equal(sql('select count(*) from public.guard_probe;'),'0');
sql('drop table public.guard_probe;');
sql(draft.replace(/commit;\s*$/,'select 1/0;commit;'),/division by zero/);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"),'0');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),autoRls?'1':'0');
sql(draft);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"),'3');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),autoRls?'3':'2');
if(autoRls){
    assert.equal(sql("select pg_get_functiondef('public.rls_auto_enable()'::regprocedure);"),observedRls.trim());
    assert.equal(sql("select proacl is null from pg_proc where oid='public.rls_auto_enable()'::regprocedure;"),'t');
    sql("begin;set local role authenticated;select public.rls_auto_enable();rollback;",/cannot display a value of type event_trigger/);
    // This observed version catches context errors. PERFORM can finish, but
    // without a DDL event it must not alter tables or its own metadata.
    const beforeDirect=sql("select jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r';");
    sql("begin;set local role authenticated;do $$begin perform public.rls_auto_enable();end;$$;rollback;");
    assert.equal(sql("select jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r';"),beforeDirect);
}
sql(draft,/requires an empty public application schema/);
for(const [i,id] of [userA,userB].entries())sql(`insert into auth.users values('${id}','staging-${i}@portfolio-test.invalid');
    insert into public.portfolio_performance_baselines(user_id,baseline) values('${id}','{}');`);
for(const id of [userA,userB]){
    assert.deepEqual(JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';
        select jsonb_build_object('owners',(select jsonb_agg(user_id) from public.portfolio_performance_baselines),
        'revision',public.get_portfolio_performance_input()->'revision');rollback;`).split('\n').find(line=>line.startsWith('{'))),
        {owners:[id],revision:0});
}
for(const table of ['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations']){
    assert.equal(sql(`select has_table_privilege('anon','public.${table}','SELECT');`),'f');
    for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','${privilege}');`),'f');
    assert.equal(sql(`select has_table_privilege('service_role','public.${table}','INSERT');`),'t');
}
assert.equal(sql("select has_function_privilege('anon','public.get_portfolio_performance_input()','EXECUTE');"),'f');
assert.equal(sql("select has_function_privilege('authenticated','public.invalidate_performance_coverage()','EXECUTE');"),'f');
for(const id of [userA,userB])sql(`begin;set local role service_role;insert into public.portfolio_ledger_events
    (user_id,event_id,trade_date,sequence,account_key,source,event)
    values('${id}','${randomUUID()}','2026-10-09',1,'synthetic','synthetic','{}');
    insert into public.portfolio_performance_observations(user_id,valuation_date,revision,observation)
    values('${id}','2026-10-09',1,'{}');commit;`);
for(const id of [userA,userB]){
    assert.deepEqual(JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';
        select jsonb_build_object('eventOwners',(select jsonb_agg(user_id) from public.portfolio_ledger_events),
        'observationOwners',(select jsonb_agg(user_id) from public.portfolio_performance_observations),
        'revision',public.get_portfolio_performance_input()->'revision',
        'events',jsonb_array_length(public.get_portfolio_performance_input()->'events'),
        'observations',jsonb_array_length(public.get_portfolio_performance_input()->'observations'));
        rollback;`).split('\n').find(line=>line.startsWith('{'))),
        {eventOwners:[id],observationOwners:[id],revision:1,events:1,observations:1});
}
assert.equal(fingerprint(),before,'Existing local data changed');
console.log(`PASS staging foundation LOCAL ONLY: empty-target guards${autoRls?', exact automatic-RLS fixture retained, unexpected function/overload/body/ACL/search-path/disabled-trigger rejected, SELECT event-trigger result rejected and out-of-context PERFORM has no table effect':''}, atomic rollback, 3 RLS tables, 2 application functions, two owner identities, denied client writes, service trigger revision, original data unchanged. Scratch DB ${database}. SHA256 ${createHash('sha256').update(draft).digest('hex')}. Managed Auth/cloud not tested.`);
