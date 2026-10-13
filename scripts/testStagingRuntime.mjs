// Exact approval SQL, only in a uniquely named local Docker scratch database.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
import {buildStagingRuntimeDraft,draftPath} from './buildStagingRuntimeDraft.mjs';
import {buildStagingEmptyRevert,revertPath} from './buildStagingEmptyRevert.mjs';
import {syntheticFiles,syntheticCatalog,syntheticImportAnswers} from './syntheticPortfolioFixtures.mjs';
import {preparePortfolioCsvImport} from '../src/services/portfolioCsvImport.js';
import {syntheticHistoricalProvider} from './localHistoryRuntime.mjs';
import {updatePerformanceHistory} from '../supabase/functions/_shared/performanceHistoryWorker.js';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
import {ledgerCostBasis} from '../src/utils/ledgerCostBasis.js';

assert.equal(process.argv.length,2,'No cloud target or credentials accepted');
const container=assertLocalDatabase(),database=`portfolio_staging_runtime_${randomBytes(5).toString('hex')}`;
const draft=readFileSync(draftPath,'utf8').replaceAll('\r\n','\n');
assert.equal(draft,buildStagingRuntimeDraft(),'Review SQL must match its source derivation');
const fingerprint=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(v) order by user_id,valuation_date)::text from public.portfolio_daily_values v),'')||coalesce((select jsonb_agg(to_jsonb(b) order by user_id)::text from public.portfolio_performance_baselines b),''));");
const before=fingerprint();runLocalSql(`create database ${database} owner postgres;`,{admin:true});
function sql(input,expectedError) {
    assertLocalDatabase();assert.match(database,/^portfolio_staging_runtime_[a-f0-9]{10}$/);
    const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-qAt'],{input,encoding:'utf8',maxBuffer:4*1024*1024});
    if(expectedError){assert.notEqual(result.status,0);assert.match(result.stderr,expectedError);}
    else if(result.status!==0)throw new Error(result.stderr);
    return result.stdout.trim();
}
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const owner=(id,query)=>sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';${query};rollback;`);
const service=(query,error)=>sql(`begin;set local role service_role;${query};commit;`,error);
sql(`create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
    grant usage on schema auth to authenticated,service_role;`);
sql(readFileSync('tests/fixtures/staging/rls-auto-enable.observed.sql','utf8'));
sql("create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable();");
sql(readFileSync('supabase/staging/001-foundation.auto-rls.approval.sql','utf8'));
const foundation=sql("select jsonb_build_object('columns',(select jsonb_agg(row_to_json(c)) from information_schema.columns c where table_schema='public'), 'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'));");
sql(draft.replace(/commit;\s*$/,'select 1/0;commit;'),/division by zero/);
assert.equal(sql("select jsonb_build_object('columns',(select jsonb_agg(row_to_json(c)) from information_schema.columns c where table_schema='public'), 'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'));"),foundation);
sql('create table public.unexpected_probe(id integer);');sql(draft,/Unexpected foundation tables/);sql('drop table public.unexpected_probe;');
sql('grant update on public.portfolio_performance_baselines to authenticated;');sql(draft,/Unexpected foundation table grants/);
sql('revoke update on public.portfolio_performance_baselines from authenticated;');
// Managed projects may grant these roles EXECUTE by default. The reviewed
// migration must override those defaults on every new function.
sql('alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
sql(draft);sql(draft,/Unexpected foundation tables/);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"),'8');
assert.equal(sql("select md5(prosrc) from pg_proc where oid='public.rls_auto_enable()'::regprocedure;"),'c44fb229ea8a6b0afd04a0a33261c16c');
const users=[randomUUID(),randomUUID()],unmarked=randomUUID();
for(const id of users)sql(`insert into auth.users values('${id}','${id}@portfolio-test.invalid','{"portfolio_staging_synthetic":true}');`);
sql(`insert into auth.users values('${unmarked}','unmarked@portfolio-test.invalid','{}');`);
const plan=preparePortfolioCsvImport([syntheticFiles[0],syntheticFiles[1],syntheticFiles[5],syntheticFiles[3]],syntheticImportAnswers,syntheticCatalog);
assert.equal(plan.ready,true);
const market=syntheticHistoricalProvider();
plan.priceSources=await Promise.all(plan.positions.map(p=>market.price(p,plan.date)));
plan.fxSources=[await market.fx('USD',plan.date)];
const fx=currency=>currency==='SEK'?1:plan.fxSources[0].rate;
plan.positions=plan.positions.map(p=>({...p,price:plan.priceSources.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:fx(p.currency)}));
plan.cash=plan.cash.map(c=>({...c,fxRateToSek:fx(c.currency)}));
const importKey='a'.repeat(64);
service(`select public.commit_staging_performance_import('${unmarked}','${importKey}',${literal(plan)},null)`,/Marked synthetic staging account required/);
const realPlan=structuredClone(plan);realPlan.positions[0].instrumentId='real-instrument';
service(`select public.commit_staging_performance_import('${users[0]}','${importKey}',${literal(realPlan)},null)`,/Synthetic instrument registry required/);
for(const id of users) {
    const result=JSON.parse(service(`select public.commit_staging_performance_import('${id}','${importKey}',${literal(plan)},null)`));
    assert.equal(result.valueSek,7200);
    assert.equal(JSON.parse(service(`select public.commit_staging_performance_import('${id}','${importKey}',${literal(plan)},0)`)).duplicate,true);
}
const input=id=>JSON.parse(service(`select public.get_staging_performance_worker_input('${id}')`));
const clientRpcs=new Set(['initialize_staging_performance_portfolio','register_staging_portfolio_trade','correct_staging_portfolio_trade','register_staging_portfolio_cash','get_portfolio_performance_input']);
const serviceRpcs=new Set(['get_staging_performance_worker_input','commit_staging_performance_import','publish_staging_performance_observations','publish_staging_history_batch','archive_staging_market_batch']);
const executeMatrix=JSON.parse(sql(`select jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,
    'PUBLIC',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
    'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%staging%' or p.proname='get_portfolio_performance_input');`));
assert.equal(executeMatrix.length,17);
for(const row of executeMatrix) {
    const environment=row.name==='get_staging_performance_environment';
    assert.equal(row.PUBLIC,false,row.signature+' PUBLIC');
    assert.equal(row.anon,environment,row.signature+' anon');
    assert.equal(row.authenticated,environment||clientRpcs.has(row.name),row.signature+' authenticated');
    assert.equal(row.service_role,environment||serviceRpcs.has(row.name),row.signature+' service_role');
}
console.log('PASS effective EXECUTE matrix: all 16 new functions plus replaced read RPC; PUBLIC/anon/authenticated/service_role, including simulated permissive default grants.');
assert.doesNotMatch(draft,/set_config\s*\(/i,'No claim mutation may survive in staging SQL');
const aliceBeforeImport=input(users[0]),bobBeforeImport=input(users[1]);
// Service target and an existing session must agree. A client never has
// EXECUTE on this service-only function, even if its body is otherwise valid.
sql(`begin;set local role service_role;set local request.jwt.claim.sub='${users[0]}';select public.commit_staging_performance_import('${users[1]}','${importKey}',${literal(plan)},0);commit;`,/Owner does not match session/);
sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${users[0]}';select public.commit_staging_performance_import('${users[1]}','${importKey}',${literal(plan)},0);commit;`,/permission denied/);
sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${users[0]}';select public.register_staging_trade_for_owner('${users[1]}','{}','${randomUUID()}',0,null);commit;`,/permission denied/);
assert.deepEqual(input(users[0]),aliceBeforeImport);assert.deepEqual(input(users[1]),bobBeforeImport);
// Exercise the former impersonation branch in one transaction, then a second
// owner in the SAME transaction and a subsequent call. A date-only CSV trade
// import is optional; it is used here only to prove the removed claim path.
const transactions={kind:'transactions',source:'synthetic_test',events:[{kind:'BUY',accountId:'Avanza-ISK-test',instrumentId:'synthetic-sek-equity',currency:'SEK',quantity:1,unitPrice:102,date:'2026-10-05',fee:{amount:0,currency:'SEK'},funding:'existing_cash',externalReference:'synthetic-identity-check'}]};
const claimIdentity=()=>sql(`select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'claims',current_setting('request.jwt.claims',true));`);
const identityBefore=claimIdentity();
const identityWithin=JSON.parse(service(`select public.commit_staging_performance_import('${users[1]}','${'b'.repeat(64)}',${literal(transactions)},0);
    select public.commit_staging_performance_import('${users[0]}','${importKey}',${literal(plan)},0);
    select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'claims',current_setting('request.jwt.claims',true))`).split('\n').at(-1));
assert.equal(identityWithin.sub,null);assert.equal(identityWithin.claims,null);assert.equal(claimIdentity(),identityBefore);
assert.deepEqual(input(users[0]),aliceBeforeImport);assert.equal(input(users[1]).events.length,1);
console.log('PASS identity negatives: client/service spoofing denied, former transaction-import branch leaves sub/claims unchanged within and between calls, target B import leaves A byte-equivalent.');
for(const [index,id] of users.entries()) {
    assert.equal(owner(id,'select count(*) from public.portfolio_performance_baselines'),'1');
    assert.equal(owner(id,`select count(*) from public.portfolio_performance_baselines where user_id='${users[1-index]}'`),'0');
    assert.deepEqual(JSON.parse(owner(id,'select public.get_portfolio_performance_input()')).ledgerState,input(id).ledgerState);
}
const alice=users[0],tradeId=randomUUID();
const draftTrade={kind:'BUY',accountId:'Nordnet-KF-test',instrumentId:'synthetic-certificate',currency:'SEK',quantity:2,unitPrice:10.5,date:'2026-10-05',fee:{amount:0,currency:'SEK'},funding:'existing_cash'};
const mutate=(name,id,args)=>JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';select public.${name}(${args});commit;`));
mutate('register_staging_portfolio_trade',alice,`${literal(draftTrade)},'${tradeId}',0,null`);
assert.equal(input(alice).revision,1);
assert.equal(mutate('register_staging_portfolio_trade',alice,`${literal(draftTrade)},'${tradeId}',0,null`).duplicate,true);
const failed=structuredClone(draftTrade);failed.kind='SELL';failed.quantity=9999;
const beforeFailure=input(alice);
sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${alice}';select public.register_staging_portfolio_trade(${literal({...draftTrade,instrumentId:'unverified-real'})},'${randomUUID()}',1,null);commit;`,/Known synthetic position required/);
sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${alice}';select public.register_staging_portfolio_trade(${literal(failed)},'${randomUUID()}',1,null);commit;`,/insufficient|exceeds|negative|quantity|position|cash/i);
assert.deepEqual(input(alice),beforeFailure,'Failed trade must roll back cash, journal and revision');
sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${alice}';select public.register_staging_portfolio_trade(${literal(draftTrade)},'${randomUUID()}',0,null);commit;`,/revision changed/i);
const deposit={kind:'DEPOSIT',accountId:'Nordnet-KF-test',currency:'SEK',amount:100,date:'2026-10-06',timingPolicy:'end_of_day_assumption'};
mutate('register_staging_portfolio_cash',alice,`${literal(deposit)},'${randomUUID()}',1`);
const sell={...draftTrade,kind:'SELL',quantity:1,unitPrice:11,date:'2026-10-07',fee:{amount:1,currency:'SEK'}};
mutate('register_staging_portfolio_trade',alice,`${literal(sell)},'${randomUUID()}',2,null`);
const databaseAdapter={input:async id=>input(id),
    publish:async(id,revision,observations)=>service(`select public.publish_staging_history_batch('${id}',${revision},${literal(observations)})`),
    failure:async(id,revision,date)=>service(`insert into public.staging_performance_runs(user_id,revision,valuation_date,status,reason) values('${id}',${revision},'${date}','failed','synthetic missing data') on conflict(user_id,revision,valuation_date) do update set status='failed'`)};
for(const id of users) {
    await updatePerformanceHistory({userId:id,database:databaseAdapter,market,now:Date.parse('2026-10-10T12:00:00Z')});
    const returns=performanceFromStoredInput(input(id),Date.parse('2026-10-10T12:00:00Z'));
    assert.equal(returns.available,true);assert.equal(returns.points[0].value,100);
    assert.equal(returns.method,id===alice?'DAILY_MODIFIED_DIETZ':'TWR');
}
const oldRevision=input(alice).revision;
mutate('correct_staging_portfolio_trade',alice,`'${tradeId}',${literal({unitPrice:11})},'${randomUUID()}',${oldRevision}`);
assert.equal(input(alice).revision,oldRevision+1);assert.deepEqual(input(alice).observations,[]);
assert.equal(sql(`select count(*) from public.portfolio_performance_observations where user_id='${alice}' and revision=${oldRevision};`),'5');
await updatePerformanceHistory({userId:alice,database:databaseAdapter,market,now:Date.parse('2026-10-10T12:00:00Z')});
const tables=['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations','staging_performance_imports','staging_performance_runs','staging_performance_corrections'];
for(const table of tables) {
    for(const id of users)assert.equal(owner(id,`select count(*) from public.${table} where user_id<>'${id}'`),'0');
    for(const role of ['anon','authenticated'])for(const operation of ['INSERT','UPDATE','DELETE','TRUNCATE'])
        assert.equal(sql(`select has_table_privilege('${role}','public.${table}','${operation}');`),'f');
}
for(const role of ['anon','authenticated'])assert.equal(sql(`select has_table_privilege('${role}','public.staging_performance_market_cache','SELECT');`),'f');
for(const signature of ['commit_staging_performance_import(uuid,text,jsonb,bigint)','get_staging_performance_worker_input(uuid)','publish_staging_history_batch(uuid,bigint,jsonb)','archive_staging_market_batch(jsonb)','require_staging_synthetic_user(uuid)'])
    for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`),'f');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%staging%' and (proconfig is distinct from array['search_path=""']::text[]);`),'0');
assert.equal(fingerprint(),before,'Existing local legacy/snapshot/baseline data changed');
assert.equal(ledgerCostBasis(input(alice).baseline,input(alice).events).get(JSON.stringify(['Nordnet-KF-test','synthetic-certificate'])).quantity,21);
const missingMarket={...market,price:async(p,date)=>{if(date==='2026-10-07')throw new Error('Syntetisk NAV saknas');return market.price(p,date);}};
mutate('correct_staging_portfolio_trade',alice,`'${tradeId}',${literal({unitPrice:11.5})},'${randomUUID()}',${input(alice).revision}`);
await assert.rejects(()=>updatePerformanceHistory({userId:alice,database:databaseAdapter,market:missingMarket,now:Date.parse('2026-10-10T12:00:00Z')}),/NAV saknas/);
assert.deepEqual(input(alice).observations.map(o=>o.date),['2026-10-05','2026-10-06']);
await updatePerformanceHistory({userId:alice,database:databaseAdapter,market,now:Date.parse('2026-10-10T12:00:00Z')});
assert.equal(fingerprint(),before,'Missing-data recovery must preserve existing local data');
const archived=[];
for(const instrument of syntheticCatalog)for(const date of ['2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'])archived.push(await market.price(instrument,date));
service(`select public.archive_staging_market_batch(${literal(archived)})`);
const beforeArchive=input(alice),pricePoint=archived.find(p=>p.instrumentId==='synthetic-certificate'&&p.date==='2026-10-09');
const changed={...pricePoint,price:pricePoint.price+0.5};
assert.equal(JSON.parse(service(`select public.archive_staging_market_batch(${literal([changed])})`)).corrected,1);
assert.equal(input(alice).revision,beforeArchive.revision+1);assert.deepEqual(input(alice).events,beforeArchive.events);
assert.deepEqual(input(alice).observations,[]);
assert.equal(JSON.parse(service(`select public.archive_staging_market_batch(${literal([changed])})`)).unchanged,1);
const stableArchive=sql('select jsonb_agg(to_jsonb(m) order by cache_key) from public.staging_performance_market_cache m;'),stableInput=input(alice);
service(`select public.archive_staging_market_batch(${literal([{...changed,price:999},{...changed,instrumentId:'unverified-real'}])})`,/Verified synthetic market evidence required/);
assert.equal(sql('select jsonb_agg(to_jsonb(m) order by cache_key) from public.staging_performance_market_cache m;'),stableArchive);
assert.deepEqual(input(alice),stableInput,'Failed source batch must roll back source and portfolio revision');
const revert=readFileSync(revertPath,'utf8').replaceAll('\r\n','\n');assert.equal(revert,buildStagingEmptyRevert());
sql(revert,/Empty recovery requires zero Auth users/);
// Cleanup only this freshly created scratch database and its generated users.
sql(`delete from public.staging_performance_imports;delete from public.staging_performance_runs;delete from public.staging_performance_corrections;
    delete from auth.users where id in ('${users[0]}','${users[1]}','${unmarked}');delete from public.staging_performance_market_cache;`);
sql("insert into public.staging_performance_market_cache values('synthetic-recovery-probe','{}',now());");
sql(revert,/Recovery refuses nonempty table/);
sql("delete from public.staging_performance_market_cache where cache_key='synthetic-recovery-probe';");
sql(revert.replace(/commit;\s*$/,'select 1/0;commit;'),/division by zero/);
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"),'8','Failed recovery must roll back');
sql(revert);
const recovered=sql("select jsonb_build_object('columns',(select jsonb_agg(row_to_json(c)) from information_schema.columns c where table_schema='public'), 'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'));");
const normalize=value=>{const result=JSON.parse(value);result.functions=result.functions.map(f=>f.replaceAll('\r\n','\n'));
    result.columns.sort((a,b)=>a.table_name.localeCompare(b.table_name)||a.ordinal_position-b.ordinal_position);return result;};
assert.deepEqual(normalize(recovered),normalize(foundation),'Empty recovery must restore exact foundation columns/functions');
assert.equal(sql("select has_function_privilege('authenticated','public.get_portfolio_performance_input()','EXECUTE');"),'t');
for(const role of ['anon','service_role'])assert.equal(sql(`select has_function_privilege('${role}','public.get_portfolio_performance_input()','EXECUTE');`),'f');
assert.equal(fingerprint(),before,'Empty recovery must not touch existing local data');
console.log('PASS empty-staging recovery: refuses test accounts/data, injected recovery error rolls back, successful recovery restores foundation columns/functions/read grants and leaves automatic RLS intact.');
console.log(`PASS local exact-foundation runtime: automatic RLS, DDL/trade rollback, two owners, synthetic import/reimport, buys/sells/flows, TWR/Dietz, backdated correction, retained revisions, missing NAV recovery, client grants. Scratch retained: ${database}. Auth is a SQL stub, not cloud login proof.`);
