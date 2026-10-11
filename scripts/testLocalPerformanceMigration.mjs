// Empty-database DDL rehearsal only. Never accepts a cloud URL or project ref.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
import {reviewPerformanceSql,reviewedSqlFiles} from './auditLocalPerformanceSecurity.mjs';

const container=assertLocalDatabase(),database=`portfolio_migration_${randomBytes(5).toString('hex')}`;
const expected=reviewPerformanceSql();
const fingerprint=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(b) order by user_id)::text from public.portfolio_performance_baselines b),'')||coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(v) order by user_id,valuation_date)::text from public.portfolio_daily_values v),''));");
const before=fingerprint();
runLocalSql(`create database ${database} owner postgres;`,{admin:true});
runLocalSql(`alter database ${database} set portfolio_tracker.test_only='true';`,{admin:true});
function sql(input,{failure=false}={}){
    assertLocalDatabase();assert.match(database,/^portfolio_migration_[a-f0-9]{10}$/);
    const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],
        {input,encoding:'utf8',maxBuffer:4*1024*1024});
    if(failure){assert.notEqual(result.status,0);assert.match(result.stderr,/division by zero/);}
    else if(result.status!==0)throw new Error(`Empty local migration rehearsal failed: ${result.stderr}`);
    return result.stdout.trim();
}
// Minimal Auth SQL dependency, not a replacement for Supabase Auth or its service.
sql(`create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
    grant usage on schema auth to authenticated;`);
const bundle=reviewedSqlFiles.map(path=>{
    const text=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
    // All six reviewed files have exactly one outer transaction wrapper.
    assert.equal([...text.matchAll(/^begin;$/gm)].length,1,path);
    assert.equal([...text.matchAll(/^commit;$/gm)].length,1,path);
    return text.replace(/^begin;$/m,'').replace(/^commit;$/m,'');
}).join('\n');
sql(`begin;${bundle}\nselect 1/0;commit;`,{failure:true});
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"),'0','Failed migration left partial tables');
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),'0','Failed migration left functions');
sql(`begin;${bundle}\ncommit;`);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"),String(expected.tables.length));
assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"),String(expected.functions.length));
const users=[randomUUID(),randomUUID()];
for(const [i,id] of users.entries())sql(`insert into auth.users values('${id}','migration-${i}@portfolio-test.invalid');
    insert into public.portfolio_performance_baselines(user_id,baseline) values('${id}','{}');`);
for(const id of users)assert.equal(sql(`begin;set local role authenticated;
    set local request.jwt.claim.sub='${id}';
    select count(*) from public.portfolio_performance_baselines;rollback;`).split('\n').find(line=>/^\d+$/.test(line)),'1','RLS must expose only own baseline');
assert.equal(sql("select has_function_privilege('authenticated','public.publish_local_public_history(uuid,bigint,jsonb)','EXECUTE');"),'f');
assert.equal(sql("select has_table_privilege('anon','public.portfolio_performance_baselines','SELECT');"),'f');
assert.equal(fingerprint(),before,'Existing local baseline/holdings/snapshots changed');
console.log(`PASS EMPTY LOCAL MIGRATION: ${expected.tables.length} RLS tables, ${expected.functions.length} functions, injected DDL failure rolled back, two synthetic owner identities isolated, existing local data unchanged. Scratch database ${database}. Auth dependency stub only; no cloud acceptance claim.`);
