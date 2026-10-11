// Rehearse the approval draft locally; no cloud credentials or URLs accepted.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';

const container=assertLocalDatabase();
const database=`portfolio_staging_${randomBytes(5).toString('hex')}`;
const draft=readFileSync('supabase/staging/001-foundation.approval.sql','utf8').replace(/^\uFEFF/,'');
const proposal=readFileSync('supabase/proposals/portfolio-performance-v1.sql','utf8');
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
const userA=randomUUID(),userB=randomUUID();
sql(`insert into auth.users values('${userA}','staging-a@portfolio-test.invalid');`);
sql(draft,/requires zero Auth users/);
sql('delete from auth.users;create table public.guard_probe(id integer);');
sql(draft,/requires an empty public application schema/);
assert.equal(sql('select count(*) from public.guard_probe;'),'0');
sql('drop table public.guard_probe;');
sql(draft.replace(/commit;\s*$/,'select 1/0;commit;'),/division by zero/);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"),'0');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),'0');
sql(draft);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"),'3');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),'2');
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
console.log(`PASS staging foundation LOCAL ONLY: empty-target guards, atomic rollback, 3 RLS tables, 2 functions, two owner identities, denied client writes, service trigger revision, original data unchanged. Scratch DB ${database}. SHA256 ${createHash('sha256').update(draft).digest('hex')}. Managed Auth/cloud not tested.`);
