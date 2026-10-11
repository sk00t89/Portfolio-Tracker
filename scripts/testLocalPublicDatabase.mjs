import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {assertLocalDatabase,localCredentials,runLocalSql} from './localPerformanceEnvironment.mjs';
import {mirrorPublicArchive,createPublicDatabaseHistory} from './publicMarketDatabase.mjs';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
import {fetchPerformanceBenchmark} from '../src/services/performanceBenchmarks.js';
import {buildDailyPerformanceView} from '../src/utils/performanceComparison.js';
assertLocalDatabase();const c=localCredentials(),admin=createClient(c.url,c.serviceKey,{auth:{persistSession:false}});
const ok=r=>{assert.ifError(r.error);return r.data;},history=createPublicDatabaseHistory(admin),users=[];
const legacy=()=>runLocalSql("select md5(coalesce((select jsonb_agg(to_jsonb(h) order by id)::text from public.holdings h),'')||coalesce((select jsonb_agg(to_jsonb(p) order by user_id,valuation_date)::text from public.portfolio_daily_values p),''));");
const beforeLegacy=legacy();await mirrorPublicArchive(admin);const instrumentId='public-CA00288U1066',date='2026-10-05';
assert.equal((await history.market.price({instrumentId:'public-SE0007074117',currency:'SEK'},'2026-10-09')).date,'2026-10-08','Explicit issuer no-NAV date retains actual source date');
await assert.rejects(()=>history.market.price({instrumentId:'public-LU1232457504',currency:'SEK'},'2026-10-09'),/inte verifierats/);
await assert.rejects(()=>history.market.price({instrumentId:'public-CH0585378661',currency:'SEK'},'2026-10-08'),/produktkurs.*saknas/);
const price=await history.market.price({instrumentId,currency:'USD'},date),fx=await history.market.fx('USD',date);
for(const name of ['alice','bob']){
    const email=`public-demo-${name}-${randomUUID().slice(0,8)}@portfolio-test.invalid`,password='LocalSyntheticOnly!42';
    const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
    const client=createClient(c.url,c.anonKey,{auth:{persistSession:false}});ok(await client.auth.signInWithPassword({email,password}));
    const baseline={source:'synthetic_test',syntheticPublicDemo:true,date,asOf:'2026-10-05T23:59:59+02:00',priceSources:[price],fxSources:[fx],
        positions:[{accountId:'fictional-public-account',instrumentId,name:'AbCellera · fiktivt antal',assetType:'STOCK',currency:'USD',quantity:2,price:price.price,fxRateToSek:fx.rate}],
        cash:[{accountId:'fictional-public-account',currency:'SEK',amount:1000,fxRateToSek:1},{accountId:'fictional-public-account',currency:'USD',amount:0,fxRateToSek:fx.rate}]};
    ok(await client.rpc('initialize_local_performance_portfolio',{p_baseline:baseline}));users.push({id:user.id,email,client});
}
const [alice,bob]=users;
const trade={kind:'BUY',accountId:'fictional-public-account',instrumentId,currency:'USD',quantity:1,unitPrice:5,date:'2026-10-06',
    fee:{amount:0,currency:'USD'},funding:'existing_cash',settlement:'broker_conversion',settlementAmountSek:50};
ok(await alice.client.rpc('register_local_portfolio_trade',{p_draft:trade,p_request_id:randomUUID(),p_expected_revision:0}));
for(const user of users){await user.client.auth.signOut();await history.update(user.id,Date.parse('2026-10-10T12:00:00Z'));}
let input=await history.database.input(alice.id);assert.equal(input.observations.length,4);assert.equal(input.ledgerState.cash[0].amount,950);
const portfolio=performanceFromStoredInput(input);assert.equal(portfolio.available,true);assert.equal(portfolio.method,'TWR');assert.equal(portfolio.points[0].value,100);
for(const index of ['OMXS30','SP500']){
    const benchmark=await fetchPerformanceBenchmark((url,options)=>fetch(`http://127.0.0.1:55801${url}`,options),index,'1M',new AbortController().signal);
    const view=buildDailyPerformanceView(portfolio,benchmark,'1M','2026-10-10',Date.parse('2026-10-10T12:00:00Z'));
    assert.equal(view.comparison.available,true);assert.equal(view.comparison.series[0].value,0);assert.equal(view.comparison.series[0].benchmark,0);
}
ok(await bob.client.auth.signInWithPassword({email:bob.email,password:'LocalSyntheticOnly!42'}));
assert.deepEqual(ok(await bob.client.from('portfolio_performance_observations').select('*').eq('user_id',alice.id)),[]);
assert.ok((await bob.client.from('local_performance_market_cache').select('*')).error);
assert.ok((await bob.client.rpc('archive_local_public_sources',{p_points:[]})).error);
assert.ok((await bob.client.rpc('publish_local_public_history',{p_user_id:alice.id,p_revision:input.revision,p_observations:input.observations})).error);
const point=await history.market.price({instrumentId,currency:'USD'},'2026-10-07');
// Revision-only test: price stays genuine. Do not invent or corrupt a public price.
const corrected={...point,contentSha256:createHash('sha256').update('synthetic provenance-revision test').digest('hex')};
ok(await admin.rpc('archive_local_public_sources',{p_points:[corrected]}));
const stale=await admin.rpc('publish_local_public_history',{p_user_id:alice.id,p_revision:input.revision,p_observations:input.observations});assert.ok(stale.error);
assert.equal(ok(await admin.from('portfolio_performance_observations').select('*').eq('user_id',alice.id).eq('revision',input.revision)).length,4);
await mirrorPublicArchive(admin);input=await history.database.input(alice.id);assert.equal(input.observations.length,0);
const validating={...history.database,publish:async(id,revision,observations)=>{
    const bad=structuredClone(observations);bad.at(-1).valueSek+=1;
    assert.ok((await admin.rpc('publish_local_public_history',{p_user_id:id,p_revision:revision,p_observations:bad})).error);
    for(const field of ['priceSources','fxSources']){
        const incomplete=structuredClone(observations);incomplete.at(-1)[field]=[];
        assert.ok((await admin.rpc('publish_local_public_history',{p_user_id:id,p_revision:revision,p_observations:incomplete})).error);
    }
    assert.equal(ok(await admin.from('portfolio_performance_observations').select('*').eq('user_id',id).eq('revision',revision)).length,0,'Whole bad batch rolls back');
    await history.database.publish(id,revision,observations);
}};
const {updatePerformanceHistory}=await import('../supabase/functions/_shared/performanceHistoryWorker.js');
await updatePerformanceHistory({userId:alice.id,database:validating,market:history.market,now:Date.parse('2026-10-10T12:00:00Z')});
await history.update(bob.id,Date.parse('2026-10-10T12:00:00Z'));
assert.equal(legacy(),beforeLegacy);
const demo=JSON.parse(readFileSync('supabase-test/demo-users.local','utf8'));
writeFileSync('supabase-test/demo-users.local',JSON.stringify({...demo,users:[...demo.users,...users.map(({id,email})=>({id,email}))]},null,2));
console.log('PASS LOCAL PUBLIC DB: fictional opening/cash + actual public prices/FX + atomic trade + logged-out persisted history + both index zero anchors; two users/RLS, stale sources, correction revisions, bad-batch rollback and unchanged legacy data.');
