import test from 'node:test';
import assert from 'node:assert/strict';
import { replayPerformanceLedger, valuePerformanceLedger, PERFORMANCE_CONVENTION } from '../src/utils/performanceLedger.js';
import { buildPortfolioPerformance, modifiedDietz, exactTimeWeightedReturn, PERFORMANCE_VERSION } from '../src/utils/portfolioPerformance.js';
import { prepareLedgerTradeDraft } from '../src/utils/ledgerTradeDraft.js';
import { performanceFromStoredInput, readPortfolioPerformance } from '../src/services/portfolioPerformance.js';
import { calculatePerformanceObservation } from '../src/utils/performanceObservation.js';

const now = Date.parse('2026-10-10T12:00:00Z');
const baseline = () => ({ verified:true, coverage:'complete', source:'confirmed account statement', date:'2026-10-04',
    asOf:'2026-10-04T21:30:00Z', valueSek:2000, finalized:true,
    positions:[{accountId:'a',instrumentId:'stock',currency:'SEK',quantity:10}],
    cash:[{accountId:'a',currency:'SEK',amount:1000},{accountId:'a',currency:'USD',amount:0},{accountId:'b',currency:'SEK',amount:0}] });
const event = (extra = {}) => ({ id:'buy',source:'broker',verified:true,date:'2026-10-05',sequence:0,
    accountId:'a',currency:'SEK',kind:'BUY',instrumentId:'stock',quantity:5,amount:500,fee:{amount:0,currency:'SEK'},...extra });
const price = (date, value=100) => [{ instrumentId:'stock',currency:'SEK',date,price:value,verified:true,source:'exchange' }];
const fx = date => [{from:'USD',to:'SEK',date,rate:10,verified:true,source:'historical FX'}];
const value = (state,date,p=100) => valuePerformanceLedger(state,date,price(date,p),fx(date));
const input = () => ({apiVersion:PERFORMANCE_VERSION, baseline:baseline(),revision:1, convention:PERFORMANCE_CONVENTION,
    cashFlowCoverage:'complete',costCoverage:'complete',returnBasis:'net_total_return',flows:[],
    observations:[{date:'2026-10-05',asOf:'2026-10-05T21:30:00Z',valueSek:2200,verified:true,source:'certified daily close',
        finalized:true,coverage:'complete',revision:1}]});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('internal buy and sell rebalance holdings and cash without inventing investment return', () => {
    const original=baseline(), copy=structuredClone(original);
    const buy=replayPerformanceLedger(original,[event()],'2026-10-05');
    close(value(buy,'2026-10-05'),2000);
    assert.equal(buy.positions[0].quantity,15);assert.equal(buy.externalFlows.length,0);
    const sell=replayPerformanceLedger(original,[event({kind:'SELL',quantity:5})],'2026-10-05');
    close(value(sell,'2026-10-05'),2000);assert.equal(sell.positions[0].quantity,5);
    assert.deepEqual(original,copy);
});
test('fees, dividends and interest are performance, not external cash flows', () => {
    const paid=replayPerformanceLedger(baseline(),[event({fee:{amount:10,currency:'SEK'}})],'2026-10-05');
    close(value(paid,'2026-10-05'),1990);
    for(const kind of ['DIVIDEND','INTEREST']) {
        const state=replayPerformanceLedger(baseline(),[event({kind,amount:20,fee:undefined})],'2026-10-05');
        close(value(state,'2026-10-05'),2020);assert.equal(state.externalFlows.length,0);
    }
    const state=replayPerformanceLedger(baseline(),[event({kind:'FEE',amount:20,fee:undefined})],'2026-10-05');
    close(value(state,'2026-10-05'),1980);
});
test('deposits and withdrawals carry signed SEK flows; unknown FX never defaults to one', () => {
    const deposit=replayPerformanceLedger(baseline(),[event({kind:'DEPOSIT',amount:500,fxRateToSek:1,fee:undefined})],'2026-10-05');
    close(value(deposit,'2026-10-05'),2500);assert.equal(deposit.externalFlows[0].amountSek,500);
    const withdrawal=replayPerformanceLedger(baseline(),[event({kind:'WITHDRAWAL',amount:500,fxRateToSek:1,fee:undefined})],'2026-10-05');
    assert.equal(withdrawal.externalFlows[0].amountSek,-500);
    const usd=replayPerformanceLedger(baseline(),[event({kind:'DEPOSIT',currency:'USD',amount:50,fxRateToSek:10,fee:undefined})],'2026-10-05');
    close(value(usd,'2026-10-05'),2500);assert.equal(usd.externalFlows[0].amountSek,500);
    assert.throws(()=>replayPerformanceLedger(baseline(),[event({kind:'DEPOSIT'})],'2026-10-05'),/valutakurs/);
});
test('cash transfer and actual FX exchange stay internal, with exchange costs included', () => {
    const transfer=replayPerformanceLedger(baseline(),[event({kind:'TRANSFER',toAccountId:'b',amount:500,fee:undefined})],'2026-10-05');
    close(value(transfer,'2026-10-05'),2000);assert.equal(transfer.externalFlows.length,0);
    const exchanged=replayPerformanceLedger(baseline(),[event({kind:'FX',amount:500,toCurrency:'USD',toAmount:49,fee:{amount:5,currency:'SEK'}})],'2026-10-05');
    close(value(exchanged,'2026-10-05'),1985);assert.equal(exchanged.externalFlows.length,0);
});
test('historical replay uses trade date; sold positions disappear without projecting today backwards', () => {
    const events=[event({date:'2026-10-07'}),event({id:'sell',date:'2026-10-08',kind:'SELL',quantity:15,amount:1500})];
    assert.equal(replayPerformanceLedger(baseline(),events,'2026-10-06').positions[0].quantity,10);
    assert.equal(replayPerformanceLedger(baseline(),events,'2026-10-07').positions[0].quantity,15);
    assert.equal(replayPerformanceLedger(baseline(),events,'2026-10-08').positions[0].quantity,0);
    close(value(replayPerformanceLedger(baseline(),events,'2026-10-08'),'2026-10-08'),2000);
});
test('unknown fees, insufficient cash, overselling and pre-baseline trades block certified replay', () => {
    for(const overrides of [{fee:null},{amount:1500},{kind:'SELL',quantity:11},{date:'2026-10-04'},{verified:false},{sequence:undefined}]) {
        assert.throws(()=>replayPerformanceLedger(baseline(),[event(overrides)],'2026-10-05'));
    }
});
test('import id and broker reference duplicates block replay instead of double counting', () => {
    assert.throws(()=>replayPerformanceLedger(baseline(),[event(),event({sequence:1})],'2026-10-05'),/Dubbel/);
    assert.throws(()=>replayPerformanceLedger(baseline(),[event({externalReference:'trade-1'}),event({id:'different',sequence:1,externalReference:'trade-1'})],'2026-10-05'),/redan registrerad/);
});
test('dated position prices and dated cash FX are required; present GAV is not used', () => {
    const state=replayPerformanceLedger(baseline(),[],'2026-10-05');
    assert.throws(()=>valuePerformanceLedger(state,'2026-10-05',price('2026-10-04'),fx('2026-10-05')),/pris/);
    assert.throws(()=>valuePerformanceLedger(state,'2026-10-05',price('2026-10-05'),fx('2026-10-04')),/valutakurs/);
});
test('cash-only portfolio has zero price return; verified interest increases its return', () => {
    const base={...baseline(),positions:[],cash:[{accountId:'a',currency:'SEK',amount:1000}]};
    const state=replayPerformanceLedger(base,[],'2026-10-05');
    assert.equal(valuePerformanceLedger(state,'2026-10-05',[],[]),1000);
    close(modifiedDietz(1000,1000,'2026-10-04T21:30:00Z','2026-10-05T21:30:00Z',[]),0);
    close(modifiedDietz(1000,1010,'2026-10-04T21:30:00Z','2026-10-05T21:30:00Z',[]),0.01);
});
test('Modified Dietz agrees with CFA handbook example, using time-weighted flows', () => {
    const r=modifiedDietz(100000,135000,'2026-05-31T00:00:00Z','2026-06-30T00:00:00Z',[
        {occurredAt:'2026-06-06T00:00:00Z',amountSek:-2000},{occurredAt:'2026-06-11T00:00:00Z',amountSek:20000}]);
    close(r,17000/(100000-2000*(24/30)+20000*(19/30)));
});
test('flow-only deposits and withdrawals produce zero return, not portfolio-value growth', () => {
    for(const amountSek of [500,-500]) {
        close(modifiedDietz(2000,2000+amountSek,'2026-10-04T21:30:00Z','2026-10-05T21:30:00Z',[
            {occurredAt:'2026-10-05T09:30:00Z',amountSek}]),0);
    }
});
test('exact TWR geometrically links pre/post-flow valuations and rejects mismatched flows', () => {
    const flows=[{amountSek:500,valueBeforeSek:2200,valueAfterSek:2700,valuationVerified:true}];
    close(exactTimeWeightedReturn(2000,2970,flows),0.21);
    assert.throws(()=>exactTimeWeightedReturn(2000,2970,[{...flows[0],valueAfterSek:2701}]),/värdering/);
});
test('daily performance starts at zero, chains exact no-flow returns and labels Dietz honestly', () => {
    const data=input(), result=buildPortfolioPerformance(data,now);
    assert.equal(result.available,true);assert.equal(result.method,'TWR');assert.equal(result.points[0].value,100);
    close(result.points[1].value,110);
    data.flows=[{id:'deposit',verified:true,source:'broker',occurredAt:'2026-10-05T09:30:00Z',amountSek:500}];
    data.observations[0].valueSek=2500;
    const estimated=buildPortfolioPerformance(data,now);
    assert.equal(estimated.method,'DAILY_MODIFIED_DIETZ');assert.equal(estimated.quality,'estimated');close(estimated.points[1].value,100);
    assert.match(estimated.methodLabel,/uppskattad/);
});
test('full event valuations select exact TWR; no partial exact claim when flow timing is missing', () => {
    const data=input();data.flows=[{id:'dep',verified:true,source:'broker',occurredAt:'2026-10-05T09:30:00Z',amountSek:500,
        valueBeforeSek:2200,valueAfterSek:2700,valuationVerified:true}];data.observations[0].valueSek=2970;
    const result=buildPortfolioPerformance(data,now);assert.equal(result.method,'TWR');close(result.points[1].value,121);
    delete data.flows[0].occurredAt;assert.equal(buildPortfolioPerformance(data,now).available,false);
});
test('missing coverage, stale revisions, gaps and live observations never become return history', () => {
    for(const override of [{cashFlowCoverage:'unknown'},{costCoverage:'unknown'},{revision:2},{convention:'live'},
        {observations:[{...input().observations[0],finalized:false}]},{observations:[{...input().observations[0],date:'2026-10-06'}]},
        {observations:[{...input().observations[0],date:'2026-10-10',asOf:'2026-10-10T21:30:00Z'}]}]) {
        assert.equal(buildPortfolioPerformance({...input(),...override},now).available,false);
    }
    assert.equal(buildPortfolioPerformance(null,now).available,false);
    assert.equal(buildPortfolioPerformance({...input(),baseline:{...baseline(),valueSek:0}},now).available,false);
});
test('return calculation refuses corrupt flow valuations, duplicate ids and date-only instants', () => {
    const data=input();const flow={id:'d',verified:true,source:'broker',occurredAt:'2026-10-05T09:30:00Z',amountSek:500};
    for(const flows of [[flow,flow],[{...flow,occurredAt:'2026-10-05'}],[{...flow,valuationVerified:true,valueBeforeSek:2000,valueAfterSek:2400}]]) {
        assert.equal(buildPortfolioPerformance({...data,flows},now).available,false);
    }
});
test('trade draft infers account/currency from holding but never invents funding or zero fees', () => {
    const args={position:{accountId:'a',instrumentId:'stock',currency:'USD'},kind:'BUY',quantity:5,price:10,date:'2026-10-05',funding:'existing_cash'};
    const draft=prepareLedgerTradeDraft(args);assert.equal(draft.currency,'USD');assert.equal(draft.amount,50);
    assert.equal(draft.fee,null);assert.deepEqual(draft.missing,['fee']);assert.equal(draft.verified,false);
    assert.deepEqual(prepareLedgerTradeDraft({...args,feeAmount:0,funding:'external_money'}).missing,['external_deposit']);
    assert.throws(()=>prepareLedgerTradeDraft({...args,funding:undefined}),/Välj/);
});
test('read gate performs no RPC before setup; failed server read is explicit and never fabricates history', async () => {
    const client={rpc:()=>assert.fail('unexpected database request')};
    assert.equal((await readPortfolioPerformance(client,false,now)).available,false);
    assert.equal((await readPortfolioPerformance({rpc:async()=>({error:{message:'missing'}})},true,now)).available,false);
    assert.equal(performanceFromStoredInput(null,now).available,false);
    const stored={...input(),events:[]};delete stored.flows;
    assert.equal(performanceFromStoredInput(stored,now).available,true);
});

test('explicit date-only flow policy uses end-of-day Dietz and never creates a factual timestamp', () => {
    const data=input();const flow={id:'d',date:'2026-10-05',verified:true,source:'statement',amountSek:500,timingPolicy:'end_of_day_assumption'};
    data.flows=[flow];data.observations[0].valueSek=2600;
    const result=buildPortfolioPerformance(data,now);
    assert.equal(result.available,true);assert.equal(result.method,'DAILY_MODIFIED_DIETZ');close(result.points[1].value,105);
    assert.equal(flow.occurredAt,undefined);
    delete flow.timingPolicy;assert.equal(buildPortfolioPerformance(data,now).available,false);
});
test('completed daily valuation keeps real quote dates and requires explicit calendar carry policy', () => {
    const args={baseline:baseline(),events:[],date:'2026-10-05',asOf:'2026-10-05T21:30:00Z',revision:1,source:'worker',
        journalCoverage:'complete',costCoverage:'complete',prices:price('2026-10-05'),rates:fx('2026-10-05')};
    assert.equal(calculatePerformanceObservation(args,now).valueSek,2000);
    const carried=price('2026-10-04').map(p=>({...p,valuationDate:'2026-10-05',carryPolicy:'last_published',calendarVerified:true}));
    const result=calculatePerformanceObservation({...args,prices:carried},now);
    assert.equal(result.priceSources[0].date,'2026-10-04');assert.equal(result.valueSek,2000);
    assert.throws(()=>calculatePerformanceObservation({...args,prices:price('2026-10-04')},now),/pris/);
    assert.throws(()=>calculatePerformanceObservation({...args,asOf:'2026-10-05T18:00:00Z'},now),/23:30/);
    assert.throws(()=>calculatePerformanceObservation({...args,journalCoverage:'unknown'},now),/journal/);
});
test('flow-only net funding, backdated trades and explicit fee reconciliation reach stored read adapter correctly', () => {
    const stored={...input(),events:[event({kind:'DEPOSIT',amount:500,fxRateToSek:1,fee:undefined,
        occurredAt:'2026-10-05T09:30:00Z'})]};delete stored.flows;stored.observations[0].valueSek=2500;
    const result=performanceFromStoredInput(stored,now);assert.equal(result.available,true);close(result.points[1].value,100);
    stored.events[0].occurredAt='2026-10-06T09:30:00Z';assert.equal(performanceFromStoredInput(stored,now).available,false);
});

test('explicit source-date carry preserves holiday FX and rejects stale/uncertified NAV', () => {
    const state=replayPerformanceLedger(baseline(),[],'2026-10-05');
    const rates=fx('2026-10-02').map(p=>({...p,valuationDate:'2026-10-05',carryPolicy:'last_published',calendarVerified:true}));
    assert.equal(valuePerformanceLedger(state,'2026-10-05',price('2026-10-05'),rates),2000);
    const old=price('2026-09-20').map(p=>({...p,valuationDate:'2026-10-05',carryPolicy:'last_published',calendarVerified:true}));
    assert.throws(()=>valuePerformanceLedger(state,'2026-10-05',old,rates));
    const wrong=price('2026-10-04').map(p=>({...p,valuationDate:'2026-10-05',carryPolicy:'last_published',calendarVerified:false}));
    assert.throws(()=>valuePerformanceLedger(state,'2026-10-05',wrong,rates));
});

test('cash/instrument weights follow real holdings after a historical buy and actual fee', () => {
    const before=replayPerformanceLedger(baseline(),[],'2026-10-05');
    const after=replayPerformanceLedger(baseline(),[event({fee:{amount:10,currency:'SEK'}})],'2026-10-05');
    assert.equal(value(before,'2026-10-05',110),2100);
    assert.equal(value(after,'2026-10-05',110),2140);
    // 15 units × 110 + 490 cash, with all costs retained in the value.
    close(exactTimeWeightedReturn(2000,2140,[]),0.07);
});
