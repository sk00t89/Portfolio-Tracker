import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {localCredentials,assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
import {syntheticFiles,syntheticCatalog,syntheticImportAnswers,fixtureKey} from './syntheticPortfolioFixtures.mjs';
import {preparePortfolioCsvImport} from '../src/services/portfolioCsvImport.js';
import {createSyntheticHistoryRuntime} from './localHistoryRuntime.mjs';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
assertLocalDatabase();const credentials=localCredentials();
console.log('LOCAL ONLY: guarded project, API 127.0.0.1:55321, Docker database port 55322. Synthetic current holdings only.');
const admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const history=createSyntheticHistoryRuntime(admin,{now:Date.parse('2026-10-10T12:00:00Z')}),unwrap=result=>{assert.ifError(result.error);return result.data;};
const hashLegacy=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(p) order by user_id,valuation_date)::text from public.portfolio_daily_values p),''));");
const beforeLegacy=hashLegacy(),users=[],password='LocalSyntheticOnly!42';
for(const prefix of ['forward-alice','forward-bob']) {
    const email=`${prefix}-${randomUUID().slice(0,8)}@portfolio-test.invalid`;
    const user=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(credentials.url,credentials.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    unwrap(await client.auth.signInWithPassword({email,password}));users.push({id:user.id,email,client});
}
const files=[syntheticFiles[0],syntheticFiles[1],syntheticFiles[5],syntheticFiles[3]];
const plan=preparePortfolioCsvImport(files,syntheticImportAnswers,syntheticCatalog);
assert.equal(plan.ready,true);assert.equal(plan.positions.length,6);assert.deepEqual(plan.questions,[]);
assert.ok(!files.some(f=>/Amount,Counterpart|Datum;Konto;Typ/.test(f.text)),'No transaction files in onboarding');
plan.priceSources=await Promise.all(plan.positions.map(p=>history.market.price(p,plan.date)));
plan.fxSources=await Promise.all(['USD'].map(c=>history.market.fx(c,plan.date)));
const fx=c=>c==='SEK'?1:plan.fxSources.find(p=>p.from===c).rate;
plan.positions=plan.positions.map(p=>({...p,price:plan.priceSources.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:fx(p.currency)}));
plan.cash=plan.cash.map(c=>({...c,fxRateToSek:fx(c.currency)}));
plan.valueSek=plan.positions.reduce((total,p)=>total+p.quantity*p.price*p.fxRateToSek,0)
    +plan.cash.reduce((total,c)=>total+c.amount*c.fxRateToSek,0);
const importKey=createHash('sha256').update(fixtureKey(files)).digest('hex');
for(const user of users) {
    const result=unwrap(await admin.rpc('commit_local_performance_import',{p_user_id:user.id,p_import_key:importKey,p_plan:plan,p_revision:null}));
    assert.equal(result.valueSek,7200);assert.equal((await history.database.input(user.id)).events.length,0);
    assert.equal(unwrap(await admin.rpc('commit_local_performance_import',{p_user_id:user.id,p_import_key:importKey,p_plan:plan,p_revision:0})).duplicate,true);
}
const [alice,bob]=users;
assert.ok((await alice.client.rpc('archive_local_market_batch',{p_points:[]})).error);
assert.ok((await bob.client.from('local_performance_market_cache').select('*')).error);
assert.deepEqual(unwrap(await alice.client.from('portfolio_performance_baselines').select('*').eq('user_id',bob.id)),[]);
unwrap(await alice.client.rpc('register_local_portfolio_trade',{p_draft:{kind:'BUY',accountId:'Nordnet-KF-test',instrumentId:'synthetic-certificate',currency:'SEK',quantity:2,unitPrice:10.5,date:'2026-10-05',fee:{amount:0,currency:'SEK'},funding:'existing_cash'},p_request_id:randomUUID(),p_expected_revision:0,p_deposit:null}));
unwrap(await alice.client.rpc('register_local_portfolio_cash',{p_draft:{kind:'DEPOSIT',accountId:'Nordnet-KF-test',currency:'SEK',amount:100,date:'2026-10-06',timingPolicy:'end_of_day_assumption'},p_request_id:randomUUID(),p_expected_revision:1}));
unwrap(await alice.client.rpc('register_local_portfolio_trade',{p_draft:{kind:'SELL',accountId:'Nordnet-KF-test',instrumentId:'synthetic-certificate',currency:'SEK',quantity:1,unitPrice:11,date:'2026-10-07',fee:{amount:1,currency:'SEK'},funding:'existing_cash'},p_request_id:randomUUID(),p_expected_revision:2,p_deposit:null}));
for(const user of users)unwrap(await user.client.auth.signOut());
for(const user of users) {
    await history.update(user.id);const input=await history.database.input(user.id),returns=performanceFromStoredInput(input);
    assert.equal(returns.available,true);assert.equal(returns.points[0].value,100);
    assert.equal(returns.method,user===alice?'DAILY_MODIFIED_DIETZ':'TWR');
    if(user===alice)assert.ok(Math.abs(returns.points.find(p=>p.date==='2026-10-06').value-7277.5/7200*100)<1e-8,'Deposit is not a return');
}
console.log('PASS: current Avanza/Nordnet holdings + Lysa fund units + certificate + cash; no old transactions; buys/sells/flows; logged-out service history and zero anchor.');
const before=await history.database.input(alice.id),beforeBob=await history.database.input(bob.id);
const source=await history.archive.read({instrumentId:'synthetic-certificate',currency:'SEK',date:'2026-10-09'});
const changed={...source,price:source.price+0.5};
const result=await history.archive.commitBatch([changed]);assert.equal(result.corrected,1);assert.equal(result.revisedPortfolios>=2,true);
const revised=await history.database.input(alice.id);assert.equal(revised.revision,before.revision+1);assert.deepEqual(revised.events,before.events);assert.deepEqual(revised.ledgerState,before.ledgerState);
assert.deepEqual(revised.observations,[]);
assert.deepEqual(unwrap(await admin.from('portfolio_performance_observations').select('observation').eq('user_id',alice.id).eq('revision',before.revision)).map(o=>o.observation),before.observations);
assert.equal((await history.archive.commitBatch([changed])).unchanged,1);
assert.equal((await history.database.input(alice.id)).revision,revised.revision);
assert.ok((await admin.rpc('publish_local_history_batch',{p_user_id:alice.id,p_revision:revised.revision,p_observations:before.observations.map(o=>({...o,revision:revised.revision}))})).error,'Stale quote evidence cannot publish into a new revision');
await history.update(alice.id);await history.update(bob.id);
const after=await history.database.input(alice.id),afterBob=await history.database.input(bob.id);
assert.equal(after.observations.at(-1).valueSek,before.observations.at(-1).valueSek+21*0.5);
assert.equal(afterBob.observations.at(-1).valueSek,beforeBob.observations.at(-1).valueSek+20*0.5);
const restarted=createSyntheticHistoryRuntime(admin,{now:Date.parse('2026-10-10T12:00:00Z')});await restarted.collect();assert.equal((await restarted.archive.read(changed)).price,changed.price);
const stableRevision=after.revision,stablePrice=changed.price;
assert.ok((await admin.rpc('archive_local_market_batch',{p_points:[{...changed,price:changed.price+1},{...changed,instrumentId:'real-instrument'}]})).error);
assert.equal((await history.archive.read(changed)).price,stablePrice);assert.equal((await history.database.input(alice.id)).revision,stableRevision);
assert.ok((await admin.rpc('archive_local_market_batch',{p_points:[changed,changed]})).error);
const key=`archive:price:${changed.instrumentId}:${changed.currency}:${changed.date}:version:%`;
assert.ok(unwrap(await admin.from('local_performance_market_cache').select('cache_key').like('cache_key',key)).length>=2);
// Verify opening-price corrections without leaving the demo's opening balance invalid.
// PostgreSQL asserts within the same transaction; then the entire exercise rolls back.
runLocalSql(`begin;
    select public.archive_local_market_batch('[{"instrumentId":"synthetic-certificate","currency":"SEK","date":"2026-10-02","price":11,"source":"synthetic_test","verified":true}]'::jsonb);
    do $$ begin if not exists(select 1 from public.portfolio_performance_baselines where user_id='${alice.id}'::uuid
        and baseline->>'sourceReconciliationRequired'='true') then raise exception 'Opening correction was not blocked';end if;end $$;
    rollback;`);
assert.equal((await history.database.input(alice.id)).revision,stableRevision);
assert.equal(hashLegacy(),beforeLegacy);
const demo=JSON.parse(readFileSync('supabase-test/demo-users.local','utf8'));
writeFileSync('supabase-test/demo-users.local',JSON.stringify({...demo,users:[...demo.users,...users.map(({id,email})=>({id,email}))]},null,2));
console.log('PASS: immutable public source versions, idempotent restart, corrected prices recalculate both users, stale publication denied, bad batch rolls back, RLS and legacy data unchanged.');
