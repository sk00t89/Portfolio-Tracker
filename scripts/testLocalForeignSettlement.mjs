import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {assertLocalDatabase,localCredentials,runLocalSql} from './localPerformanceEnvironment.mjs';
import {createLocalHistoryRuntime} from './localHistoryRuntime.mjs';
import {ledgerCostBasis} from '../src/utils/ledgerCostBasis.js';
assertLocalDatabase();const c=localCredentials(),admin=createClient(c.url,c.serviceKey,{auth:{persistSession:false}}),history=createLocalHistoryRuntime(admin);
const ok=r=>{assert.ifError(r.error);return r.data;},users=[];
const legacy=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(p) order by user_id,valuation_date)::text from public.portfolio_daily_values p),''));");
const beforeLegacy=legacy();
for(const name of ['native','converted']){
    const email=`fx-${name}-${randomUUID().slice(0,8)}@portfolio-test.invalid`,password='LocalSyntheticOnly!42';
    const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(c.url,c.anonKey,{auth:{persistSession:false}});ok(await client.auth.signInWithPassword({email,password}));users.push({id:user.id,client});
    ok(await client.rpc('initialize_local_performance_portfolio',{p_baseline:{source:'synthetic_test',date:'2026-10-04',asOf:'2026-10-04T23:30:00+02:00',
        positions:[{accountId:'test',instrumentId:'synthetic-us-equity',currency:'USD',quantity:10,price:20,fxRateToSek:10,averagePrice:10,averagePriceSek:90}],
        cash:[{accountId:'test',currency:'SEK',amount:1000,fxRateToSek:1},{accountId:'test',currency:'USD',amount:100,fxRateToSek:10}]}}));
}
const [native,converted]=users,buy={kind:'BUY',accountId:'test',instrumentId:'synthetic-us-equity',currency:'USD',quantity:2,unitPrice:20,date:'2026-10-05',fee:{amount:1,currency:'USD'},funding:'existing_cash'};
const save=(u,d,id,revision)=>u.client.rpc('register_local_portfolio_trade',{p_draft:d,p_request_id:id,p_expected_revision:revision,p_deposit:null});
ok(await save(native,buy,randomUUID(),0));const nativeInput=await history.database.input(native.id);
assert.equal(nativeInput.ledgerState.cash.find(c=>c.currency==='USD').amount,59);
assert.equal(ledgerCostBasis(nativeInput.baseline,nativeInput.events).values().next().value.averagePriceSek,null);
const draft={...buy,settlement:'broker_conversion',settlementAmountSek:215},id=randomUUID();
const saved=ok(await save(converted,draft,id,0));assert.equal(ok(await save(converted,draft,id,0)).duplicate,true);
let input=await history.database.input(converted.id);assert.equal(input.events.length,2);
assert.equal(input.ledgerState.cash.find(c=>c.currency==='USD').amount,100);assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,785);
assert.equal(ledgerCostBasis(input.baseline,input.events).values().next().value.averagePriceSek,1115/12);
const sell={...draft,kind:'SELL',quantity:3,unitPrice:25,date:'2026-10-06',fee:{amount:2,currency:'USD'},settlementAmountSek:800};
const sold=ok(await save(converted,sell,randomUUID(),saved.revision));input=await history.database.input(converted.id);
assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,1585);assert.equal(input.ledgerState.cash.find(c=>c.currency==='USD').amount,100);
await history.update(converted.id);const previous=await history.database.input(converted.id);
const patch={quantity:3,unitPrice:20,fee:{amount:1,currency:'USD'},settlementAmountSek:320,date:'2026-10-05'};
assert.ok((await native.client.rpc('correct_local_portfolio_trade',{p_event_id:id,p_patch:patch,p_request_id:randomUUID(),p_expected_revision:nativeInput.revision})).error);
const correctionId=randomUUID(),args={p_event_id:id,p_patch:patch,p_request_id:correctionId,p_expected_revision:sold.revision};
ok(await converted.client.rpc('correct_local_portfolio_trade',args));assert.equal(ok(await converted.client.rpc('correct_local_portfolio_trade',args)).duplicate,true);
input=await history.database.input(converted.id);assert.equal(input.ledgerState.cash.find(c=>c.currency==='USD').amount,100);assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,1480);
assert.equal(ledgerCostBasis(input.baseline,input.events).values().next().value.averagePriceSek,1220/13);
assert.equal(ok(await admin.from('portfolio_performance_observations').select('*').eq('user_id',converted.id).eq('revision',previous.revision)).length,previous.observations.length);
const stable=structuredClone(input);
assert.ok((await save(converted,{...draft,settlementAmountSek:100000},randomUUID(),input.revision)).error);
assert.ok((await save(converted,{...sell,fee:{amount:75,currency:'USD'}},randomUUID(),input.revision)).error);
assert.ok((await converted.client.rpc('correct_local_portfolio_trade',{...args,p_patch:{quantity:4},p_request_id:randomUUID(),p_expected_revision:input.revision})).error);
assert.deepEqual(await history.database.input(converted.id),stable,'Failed operation must roll back FX, trade, cash and revisions');
const sekFeeId=randomUUID(),sekFeeBuy={...draft,quantity:1,fee:{amount:5,currency:'SEK'},settlementAmountSek:210,date:'2026-10-07'};
const sekBought=ok(await save(converted,sekFeeBuy,sekFeeId,input.revision));
input=await history.database.input(converted.id);assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,1270);
assert.equal(input.ledgerState.cash.find(c=>c.currency==='USD').amount,100);
assert.equal(ledgerCostBasis(input.baseline,input.events).values().next().value.averagePrice,null);
const sekFeeSell={...sell,quantity:1,fee:{amount:10,currency:'SEK'},settlementAmountSek:235,date:'2026-10-08'};
const sekSold=ok(await save(converted,sekFeeSell,randomUUID(),sekBought.revision));
input=await history.database.input(converted.id);assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,1505);
ok(await converted.client.rpc('correct_local_portfolio_trade',{p_event_id:sekFeeId,p_patch:{fee:{amount:10,currency:'SEK'},settlementAmountSek:220},p_request_id:randomUUID(),p_expected_revision:sekSold.revision}));
input=await history.database.input(converted.id);assert.equal(input.ledgerState.cash.find(c=>c.currency==='SEK').amount,1495);
assert.equal(input.ledgerState.cash.find(c=>c.currency==='USD').amount,100);
for(const user of users){ok(await user.client.auth.signOut());await history.update(user.id);}
assert.equal(legacy(),beforeLegacy);
console.log('PASS LOCAL ONLY 55321/55322: native USD cash, actual SEK buy/sell settlement, fee-inclusive GAV, linked FX corrections, two-user RLS, idempotency, rollback, historical revisions and logged-out recalculation.');
