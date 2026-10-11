import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {localCredentials,assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
import {syntheticFiles,syntheticCatalog,syntheticImportAnswers,fixtureKey} from './syntheticPortfolioFixtures.mjs';
import {preparePortfolioCsvImport,reconcileManualImportTrades} from '../src/services/portfolioCsvImport.js';
import {createLocalHistoryRuntime} from './localHistoryRuntime.mjs';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
assertLocalDatabase();const credentials=localCredentials();
console.log('LOCAL ONLY: API 127.0.0.1:55321, verified Docker database port 55322. Synthetic CSV and separate users.');
const admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}),history=createLocalHistoryRuntime(admin);
const unwrap=result=>{assert.ifError(result.error);return result.data;};
const password='LocalSyntheticOnly!42',users=[];
for(const name of ['csv-alice','csv-bob','csv-funds']) {
    const email=`${name}-${randomUUID().slice(0,8)}@portfolio-test.invalid`;
    const user=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(credentials.url,credentials.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    unwrap(await client.auth.signInWithPassword({email,password}));users.push({id:user.id,email,client});
}
const hashLegacy=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(p) order by user_id,valuation_date)::text from public.portfolio_daily_values p),''));");
const before=hashLegacy(),files=syntheticFiles.slice(0,4);
async function prepare(selected) {
    const plan=preparePortfolioCsvImport(selected,syntheticImportAnswers,syntheticCatalog);assert.equal(plan.ready,true);
    if(plan.kind==='opening') {
        plan.priceSources=await Promise.all(plan.positions.map(p=>history.market.price(p,plan.date)));
        plan.fxSources=await Promise.all([...new Set([...plan.positions,...plan.cash].map(p=>p.currency))].filter(c=>c!=='SEK').map(c=>history.market.fx(c,plan.date)));
        const fx=c=>c==='SEK'?1:plan.fxSources.find(p=>p.from===c).rate;
        plan.positions=plan.positions.map(p=>({...p,price:plan.priceSources.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:fx(p.currency)}));
        plan.cash=plan.cash.map(c=>({...c,fxRateToSek:fx(c.currency)}));
    }return plan;
}
const key=selected=>createHash('sha256').update(fixtureKey(selected)).digest('hex');
const commit=(user,selected,plan,revision)=>admin.rpc('commit_local_performance_import',{p_user_id:user.id,p_import_key:key(selected),p_plan:plan,p_revision:revision});
const plan=await prepare(files);
for(const user of users) {
    const selected=user===users[2]?[files[2],files[3]]:files;
    const result=unwrap(await commit(user,selected,await prepare(selected),null));assert.equal(result.initialized,true);
    assert.equal(unwrap(await commit(user,selected,await prepare(selected),0)).duplicate,true);
    await history.update(user.id);
    const input=await history.database.input(user.id),performance=performanceFromStoredInput(input);
    assert.equal(performance.available,true);assert.equal(performance.points[0].value,100);
}
console.log('PASS: three separate users, Avanza/Nordnet/Lysa opening CSV, distinct fund account, separate cash, 0% anchor and service history without login.');
const [alice,bob]=users;
for(const table of ['local_performance_imports','local_performance_runs','local_performance_corrections']) {
    assert.deepEqual(unwrap(await alice.client.from(table).select('*').eq('user_id',bob.id)),[]);
    assert.ok((await alice.client.from(table).insert({user_id:bob.id})).error);
    assert.ok((await alice.client.from(table).delete().eq('user_id',alice.id)).error);
}
assert.ok((await alice.client.from('local_performance_market_cache').select('*')).error);
assert.ok((await alice.client.rpc('get_local_performance_worker_input',{p_user_id:bob.id})).error);
assert.ok((await alice.client.rpc('commit_local_performance_import',{p_user_id:bob.id,p_import_key:key(files),p_plan:plan})).error);
console.log('PASS: owner-only RLS on receipts/run/corrections; shared cache and worker/import RPC forbidden to browser users.');
const trades=await prepare([syntheticFiles[4]]);
const manualId=randomUUID();
unwrap(await bob.client.rpc('register_local_portfolio_trade',{p_draft:{...trades.events[0],externalReference:null},p_request_id:manualId,p_expected_revision:0,p_deposit:null}));
assert.ok((await commit(bob,[syntheticFiles[4]],trades,1)).error);
assert.equal((await history.database.input(bob.id)).events.length,1);
const matched=reconcileManualImportTrades(trades,await history.database.input(bob.id),{'match:synthetic-trade-001':manualId});
const matchedResult=unwrap(await commit(bob,[syntheticFiles[4]],matched,1));assert.equal(matchedResult.inserted,1);assert.equal(matchedResult.skipped,1);
assert.equal((await history.database.input(bob.id)).events.length,2);
const matchedRetry=reconcileManualImportTrades(trades,await history.database.input(bob.id));
assert.equal(unwrap(await commit(bob,[syntheticFiles[4]],matchedRetry,0)).duplicate,true);
await history.update(bob.id);
console.log('PASS: manual buy + later CSV asks for matching, safely links reference, and never creates a second copy of the same trade.');
assert.equal(unwrap(await commit(alice,[syntheticFiles[4]],trades,0)).inserted,2);
assert.equal(unwrap(await commit(alice,[syntheticFiles[4]],trades,0)).duplicate,true);
const prior=await history.database.input(alice.id);assert.equal(prior.events.length,2);
const overlap={...trades,events:[trades.events[0]]};
const overlappingKey=createHash('sha256').update('synthetic overlap').digest('hex');
const overlapResult=unwrap(await admin.rpc('commit_local_performance_import',{p_user_id:alice.id,p_import_key:overlappingKey,p_plan:overlap,p_revision:prior.revision}));assert.equal(overlapResult.skipped,1);
const bad={...trades,events:[{...trades.events[0],externalReference:'rollback-001'},{...trades.events[1],quantity:10000,externalReference:'rollback-002'}]};
assert.ok((await admin.rpc('commit_local_performance_import',{p_user_id:alice.id,p_import_key:createHash('sha256').update('rollback').digest('hex'),p_plan:bad,p_revision:prior.revision})).error);
assert.deepEqual(await history.database.input(alice.id),prior);
console.log('PASS: stable references, reimport and overlapping files deduplicate; failing second trade rolls back entire import, cash and revisions.');
await history.update(alice.id);
const oldRows=unwrap(await admin.from('portfolio_performance_observations').select('*').eq('user_id',alice.id));
const input=await history.database.input(alice.id),event=input.events[0];
assert.ok((await bob.client.rpc('correct_local_portfolio_trade',{p_event_id:event.id,p_patch:{quantity:2},p_request_id:randomUUID(),p_expected_revision:0})).error);
const correctionId=randomUUID();
const corrected=unwrap(await alice.client.rpc('correct_local_portfolio_trade',{p_event_id:event.id,p_patch:{quantity:2,date:'2026-10-07'},p_request_id:correctionId,p_expected_revision:input.revision}));
assert.equal(corrected.revision,input.revision+1);
assert.equal(unwrap(await alice.client.rpc('correct_local_portfolio_trade',{p_event_id:event.id,p_patch:{quantity:2,date:'2026-10-07'},p_request_id:correctionId,p_expected_revision:0})).duplicate,true);
await history.update(alice.id);await history.update(alice.id);
const current=await history.database.input(alice.id);assert.equal(current.observations.length,input.observations.length);assert.equal(current.observations[0].revision,corrected.revision);
for(const row of oldRows)assert.deepEqual(unwrap(await admin.from('portfolio_performance_observations').select('*').eq('user_id',alice.id).eq('revision',row.revision).eq('valuation_date',row.valuation_date).single()),row);
const failed=await alice.client.rpc('correct_local_portfolio_trade',{p_event_id:event.id,p_patch:{quantity:100000},p_request_id:randomUUID(),p_expected_revision:current.revision});assert.ok(failed.error);
assert.deepEqual(await history.database.input(alice.id),current);
const cashDraft={kind:'DEPOSIT',accountId:'Avanza-ISK-test',currency:'SEK',amount:1000,date:'2026-10-06',timingPolicy:'end_of_day_assumption'};
const cashId=randomUUID();
unwrap(await alice.client.rpc('register_local_portfolio_cash',{p_draft:cashDraft,p_request_id:cashId,p_expected_revision:current.revision}));
assert.equal(unwrap(await alice.client.rpc('register_local_portfolio_cash',{p_draft:cashDraft,p_request_id:cashId,p_expected_revision:0})).duplicate,true);
await history.update(alice.id);
const cashInput=await history.database.input(alice.id),cashPerformance=performanceFromStoredInput(cashInput);
assert.equal(cashPerformance.available,true);assert.equal(cashPerformance.method,'DAILY_MODIFIED_DIETZ');
assert.ok(cashPerformance.points.at(-1).value<110); // Deposit is not a 1000 SEK gain.
assert.ok((await alice.client.rpc('register_local_portfolio_cash',{p_draft:{...cashDraft,kind:'WITHDRAWAL',amount:100000},p_request_id:randomUUID(),p_expected_revision:cashInput.revision})).error);
assert.deepEqual(await history.database.input(alice.id),cashInput);
assert.ok((await alice.client.rpc('register_local_portfolio_cash',{p_draft:{...cashDraft,timingPolicy:null},p_request_id:randomUUID(),p_expected_revision:cashInput.revision})).error);
const withdrawal={...cashDraft,kind:'WITHDRAWAL',amount:100,date:'2026-10-08'};
unwrap(await alice.client.rpc('register_local_portfolio_cash',{p_draft:withdrawal,p_request_id:randomUUID(),p_expected_revision:cashInput.revision}));
await history.update(alice.id);
assert.equal(performanceFromStoredInput(await history.database.input(alice.id)).available,true);
const afterWithdrawal=await history.database.input(alice.id);
assert.ok((await alice.client.rpc('register_local_portfolio_cash',{p_draft:{...cashDraft,timingPolicy:null,occurredAt:'2026-10-06T12:00:00'},p_request_id:randomUUID(),p_expected_revision:afterWithdrawal.revision})).error);
unwrap(await alice.client.rpc('register_local_portfolio_cash',{p_draft:{...cashDraft,amount:10,timingPolicy:null,occurredAt:'2026-10-06T21:55:00Z'},p_request_id:randomUUID(),p_expected_revision:afterWithdrawal.revision}));
await history.update(alice.id);
const lateFlowInput=await history.database.input(alice.id);assert.equal(performanceFromStoredInput(lateFlowInput).available,true);
assert.equal(new Date(lateFlowInput.observations[0].asOf).toLocaleTimeString('sv-SE',{timeZone:'Europe/Stockholm'}),'23:59:59');
console.log('PASS: deposits/withdrawals adjust cash without becoming returns; missing timing and insufficient cash fail atomically; estimated Dietz is explicit.');
assert.equal(hashLegacy(),before);
console.log('PASS: backdated correction, retained immutable revisions, atomic failed correction, idempotent worker, unchanged legacy holdings and snapshots.');
let demonstrationUsers=[];try{demonstrationUsers=JSON.parse(readFileSync('supabase-test/demo-users.local','utf8')).users.filter(u=>u.email.startsWith('csv-demo-'));}catch{/* Initial test run. */}
writeFileSync('supabase-test/demo-users.local',JSON.stringify({password,users:[...users.map(({id,email})=>({id,email})),...demonstrationUsers]},null,2));
console.log('Synthetic CSV demonstration users ready. No production target or real user data touched.');
