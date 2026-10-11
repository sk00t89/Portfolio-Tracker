import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { localCredentials, runLocalSql, assertLocalApiUrl } from './localPerformanceEnvironment.mjs';
import { createLocalPerformanceClient, verifyLocalPerformanceEnvironment } from '../src/services/localPerformanceClient.js';
import { replayPerformanceLedger } from '../src/utils/performanceLedger.js';
import { performanceFromStoredInput } from '../src/services/portfolioPerformance.js';
import { calculatePerformanceObservation } from '../src/utils/performanceObservation.js';
import { buildDailyPerformanceView, COMPARISON_VERSION } from '../src/utils/performanceComparison.js';

const credentials=localCredentials();assertLocalApiUrl(credentials.url);
console.log('Verified LOCAL ONLY: API 127.0.0.1:55321, Docker database port 55322. Synthetic data only.');
const admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const password='LocalSyntheticOnly!42';const suffix=randomUUID().slice(0,8);
const users=[];
for(const label of ['alice','bob']) {
    const email=`${label}-${suffix}@portfolio-test.invalid`;
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);
    const client=createLocalPerformanceClient(credentials.url,credentials.anonKey);
    const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
    await verifyLocalPerformanceEnvironment(client);users.push({id:data.user.id,email,client});
}
const [alice,bob]=users;
// These are scratch copies of legacy schemas; no production source or data is imported.
runLocalSql(readFileSync('supabase/local-fixture.sql','utf8'));
runLocalSql(readFileSync('supabase/dashboard-history.sql','utf8'));
runLocalSql(`insert into public.holdings(user_id,name,quantity,currency) values('${alice.id}','Synthetic legacy sentinel',7,'SEK');
    insert into public.portfolio_daily_values(user_id,valuation_date,total_value_sek,observed_at) values('${alice.id}','2026-10-01',777,'2026-10-01T21:30:00Z');`);
const legacyHash=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(p) order by user_id,valuation_date)::text from public.portfolio_daily_values p),''));");
const beforeLegacy=legacyHash();
const base={source:'synthetic_test',date:'2026-10-04',asOf:'2026-10-04T21:30:00Z',
    positions:[{accountId:'test-account',instrumentId:'test-sek-stock',currency:'SEK',quantity:10,price:100,fxRateToSek:1}],
    cash:[{accountId:'test-account',currency:'SEK',amount:1000,fxRateToSek:1}]};
const call=async(client,name,args={})=>{const result=await client.rpc(name,args);assert.ifError(result.error);return result.data;};
const read=client=>call(client,'get_portfolio_performance_input');
for(const user of users) await call(user.client,'initialize_local_performance_portfolio',{p_baseline:base});
assert.equal((await read(alice.client)).baseline.valueSek,2000);
console.log('PASS: first synthetic import stores positions, cash and computed opening value; two distinct Auth users.');
const duplicateImport=await alice.client.rpc('initialize_local_performance_portfolio',{p_baseline:base});assert.ok(duplicateImport.error);
for(const table of ['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations']) {
    const cross=await alice.client.from(table).select('*').eq('user_id',bob.id);assert.ifError(cross.error);assert.deepEqual(cross.data,[]);
    const insert=await alice.client.from(table).insert({user_id:bob.id});assert.ok(insert.error);
    const update=await alice.client.from(table).update({user_id:alice.id}).eq('user_id',bob.id);assert.ok(update.error);
    const deletion=await alice.client.from(table).delete().eq('user_id',alice.id);assert.ok(deletion.error);
}
const anon=createLocalPerformanceClient(credentials.url,credentials.anonKey);
assert.ok((await anon.rpc('get_portfolio_performance_input')).error);
assert.ok((await anon.rpc('initialize_local_performance_portfolio',{p_baseline:base})).error);
assert.ok((await alice.client.rpc('publish_local_performance_observations',{p_user_id:bob.id,p_revision:0,p_observations:[]})).error);
console.log('PASS: RLS isolation on all three tables; direct INSERT/UPDATE/DELETE, anonymous reads/writes and authenticated publisher denied.');
const draft=(extra={})=>({accountId:'test-account',instrumentId:'test-sek-stock',currency:'SEK',kind:'BUY',quantity:2,unitPrice:100,date:'2026-10-06',
    fee:{amount:5,currency:'SEK'},funding:'existing_cash',...extra});
const save=(client,d,revision,id=randomUUID(),deposit=null)=>client.rpc('register_local_portfolio_trade',{
    p_draft:d,p_expected_revision:revision,p_request_id:id,p_deposit:deposit});
const firstId=randomUUID();const first=await save(alice.client,draft(),0,firstId);assert.ifError(first.error);assert.equal(first.data.revision,1);
assert.equal(first.data.ledgerState.cash[0].amount,795);assert.equal(first.data.ledgerState.positions[0].quantity,12);
const retry=await save(alice.client,draft(),0,firstId);assert.ifError(retry.error);assert.equal(retry.data.duplicate,true);
assert.ok((await save(alice.client,draft({quantity:3}),1,firstId)).error);
assert.equal((await read(alice.client)).events.length,1);assert.equal((await read(bob.client)).events.length,0);
console.log('PASS: trade, fees, cash and revision commit together; retries are idempotent and payload conflicts fail.');
const unchanged=await read(alice.client);
for(const bad of [draft({quantity:1000}),draft({kind:'SELL',quantity:100}),draft({fee:null}),draft({date:'2026-10-03'}),draft({currency:'USD'})]) {
    assert.ok((await save(alice.client,bad,1)).error);assert.deepEqual(await read(alice.client),unchanged);
}
const fundedFailure=await save(alice.client,draft({quantity:1000,funding:'external_money'}),1,randomUUID(),{amount:10,fxRateToSek:1,timingPolicy:'end_of_day_assumption'});
assert.ok(fundedFailure.error);assert.deepEqual(await read(alice.client),unchanged);
console.log('PASS: failure after deposit insertion rolls back deposit, trade, cash and revision; unknown fee, oversell and invalid history also roll back.');
const backdated=await save(alice.client,draft({date:'2026-10-05',quantity:1,fee:{amount:0,currency:'SEK'}}),1);assert.ifError(backdated.error);
const input=await read(alice.client);const js=replayPerformanceLedger(input.baseline,input.events,'2026-10-09');
assert.deepEqual(input.ledgerState.cash,js.cash);
assert.deepEqual(input.ledgerState.positions,js.positions);
assert.equal(input.ledgerState.cash[0].amount,695);assert.equal(input.ledgerState.positions[0].quantity,13);
console.log('PASS: backdated trade replays all subsequent events; SQL state agrees with JavaScript replay.');
const race=await Promise.all([save(alice.client,draft({quantity:1}),2),save(alice.client,draft({quantity:1}),2)]);
assert.equal(race.filter(r=>!r.error).length,1);assert.equal(race.filter(r=>r.error?.code==='40001').length,1);
const funded=await save(alice.client,draft({quantity:1,date:'2026-10-07',funding:'external_money',fee:{amount:0,currency:'SEK'}}),3,randomUUID(),
    {amount:100,fxRateToSek:1,timingPolicy:'end_of_day_assumption'});assert.ifError(funded.error);assert.equal(funded.data.revision,5);
const sold=await save(alice.client,draft({kind:'SELL',quantity:1,date:'2026-10-08',unitPrice:110,fee:{amount:2,currency:'SEK'}}),5);assert.ifError(sold.error);
console.log('PASS: concurrent writers serialize; stale revision rejects one writer; funded buy records a distinct external flow and sell restores cash net of fees.');
const source=await read(alice.client);assert.equal(source.observations.length,0);
const dates=['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'];
const observations=dates.map((date,i)=>calculatePerformanceObservation({baseline:source.baseline,events:source.events,date,
    asOf:`${date}T21:30:00Z`,revision:source.revision,source:'synthetic_test',journalCoverage:'complete',costCoverage:'complete',rates:[],
    prices:[{date,instrumentId:'test-sek-stock',currency:'SEK',price:100+i*2,verified:true,source:'synthetic_test'}]},Date.parse('2026-10-10T12:00:00Z')));
const badBatch=await admin.rpc('publish_local_performance_observations',{p_user_id:alice.id,p_revision:source.revision,
    p_observations:[observations[0],{...observations[1],valueSek:-1}]});assert.ok(badBatch.error);
assert.equal((await read(alice.client)).observations.length,0);
assert.ok((await admin.rpc('publish_local_performance_observations',{p_user_id:alice.id,p_revision:0,p_observations:observations})).error);
await call(admin,'publish_local_performance_observations',{p_user_id:alice.id,p_revision:source.revision,p_observations:observations});
const saved=await read(alice.client);const p=performanceFromStoredInput(saved,Date.parse('2026-10-10T12:00:00Z'));
assert.equal(p.available,true);assert.equal(p.method,'DAILY_MODIFIED_DIETZ');
assert.equal(p.points[0].value,100);
assert.ok(Math.abs(p.points[1].value-100)<1e-9,'buy with existing cash and zero fee must not create return');
for(const id of ['OMXS30','SP500']) {
    const benchmark={apiVersion:COMPARISON_VERSION,verified:true,id,currency:'SEK',returnBasis:'price_return',
        source:'Synthetic index test fixture, not actual market data',convention:p.convention,points:dates.map((date,i)=>({date,value:100+i}))};
    const view=buildDailyPerformanceView(p,benchmark,'1M','2026-10-10',Date.parse('2026-10-10T12:00:00Z'));
    assert.equal(view.comparison.available,true);assert.equal(view.comparison.series[0].value,0);assert.equal(view.comparison.series[0].benchmark,0);
}
console.log('PASS: finalized observation batch is atomic, revision-checked and produces persisted cash-flow-adjusted returns + both index overlays at common 0%.');
const extra=await save(alice.client,draft({date:'2026-10-09',quantity:1}),source.revision);assert.ifError(extra.error);
assert.equal((await read(alice.client)).observations.length,0);
const old=await admin.from('portfolio_performance_observations').select('revision').eq('user_id',alice.id);assert.ifError(old.error);assert.equal(old.data.length,5);
assert.equal(legacyHash(),beforeLegacy);
console.log('PASS: journal revision hides stale derived history, preserves previous observations, and leaves legacy holdings/snapshots byte-equivalent.');
const newState=await read(alice.client);
const secondDevice=createLocalPerformanceClient(credentials.url,credentials.anonKey);const auth=await secondDevice.auth.signInWithPassword({email:alice.email,password});assert.ifError(auth.error);
assert.deepEqual(await read(secondDevice),newState);
console.log('PASS: a separate authenticated session sees the same journal, cash and revisions without localStorage.');
writeFileSync('supabase-test/demo-users.local',JSON.stringify({password,users:users.map(({id,email})=>({id,email}))},null,2));
console.log('All local database integration checks passed. Synthetic demo identities saved only to ignored local file.');
