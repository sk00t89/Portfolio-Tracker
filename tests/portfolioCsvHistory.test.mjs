import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePortfolioCsvImport,reconcileManualImportTrades} from '../src/services/portfolioCsvImport.js';
import {syntheticFiles,syntheticCatalog,syntheticImportAnswers,assertSyntheticFiles} from '../scripts/syntheticPortfolioFixtures.mjs';
import {csvObjects,csvNumber} from '../src/parsers/delimitedCsv.js';
import {sharedHistoricalMarket,updatePerformanceHistory,certifyFlowValuations} from '../supabase/functions/_shared/performanceHistoryWorker.js';
import {syntheticHistoricalProvider} from '../scripts/localHistoryRuntime.mjs';
import {createHistoricalPortfolioMarket} from '../supabase/functions/_shared/historicalPortfolioMarket.js';
const files=syntheticFiles.slice(0,4);
test('later broker import asks before matching a manually entered trade and preserves the link on retry',()=>{
    const plan=preparePortfolioCsvImport([syntheticFiles[4]],{},syntheticCatalog),manual={...plan.events[0],id:'manual-id',externalReference:null};
    const input={events:[manual]};
    assert.equal(reconcileManualImportTrades(plan,input).ready,false);
    const linked=reconcileManualImportTrades(plan,input,{'match:synthetic-trade-001':'manual-id'});
    assert.equal(linked.ready,true);assert.equal(linked.events[0].matchEventId,'manual-id');
    assert.equal(reconcileManualImportTrades(plan,{events:[{...manual,externalReference:'synthetic-trade-001',manualImportReference:'synthetic-trade-001'}]}).events[0].matchEventId,'manual-id');
    assert.equal(reconcileManualImportTrades(plan,input,{'match:synthetic-trade-001':'new_trade'}).events[0].matchPolicy,'new_trade');
});
test('CSV import reuses holdings parsers, reconciles accounts, instruments, complete Lysa and separate cash',()=>{
    const missing=preparePortfolioCsvImport(files,{},syntheticCatalog);assert.equal(missing.ready,false);
    assert.ok(missing.questions.some(q=>q.key==='scopeConfirmed'));
    const plan=preparePortfolioCsvImport(files,syntheticImportAnswers,syntheticCatalog);
    assert.equal(plan.ready,true);assert.equal(plan.positions.length,5);assert.equal(plan.cash.length,4);
    assert.equal(plan.date,'2026-10-04');assert.equal(plan.positions[0].averagePrice,75);
    assert.equal(plan.positions[0].price,undefined); // GAV never supplies the opening valuation.
});
test('exact flow evidence needs actual instant prices and unambiguous event order; otherwise Dietz',async()=>{
    const baseline={verified:true,coverage:'complete',source:'synthetic_test',date:'2026-10-04',positions:[{accountId:'a',instrumentId:'stock',currency:'SEK',quantity:10}],cash:[{accountId:'a',currency:'SEK',amount:1000}]};
    const flow={id:'flow',date:'2026-10-05',sequence:0,source:'synthetic_test',verified:true,kind:'DEPOSIT',accountId:'a',currency:'SEK',amount:1000,fxRateToSek:1,occurredAt:'2026-10-05T12:00:00Z'};
    const input={baseline,events:[flow]},point={date:flow.date,instrumentId:'stock',currency:'SEK',price:110,verified:true,source:'explicit_instant_fixture',observedAt:flow.occurredAt};
    const market={source:'explicit_instant_fixture',instant:async()=>({prices:[point],rates:[]})};
    const certificates=await certifyFlowValuations(input,flow.date,market);
    assert.equal(certificates[0].valueBeforeSek,2100);assert.equal(certificates[0].valueAfterSek,3100);
    assert.deepEqual(await certifyFlowValuations(input,flow.date,{...market,instant:async()=>({prices:[{...point,observedAt:'2026-10-05T15:30:00Z'}],rates:[]})}),[]);
    assert.deepEqual(await certifyFlowValuations({...input,events:[flow,{...flow,id:'other',sequence:1}]},flow.date,market),[]);
});
test('prepared actual-data adapter refuses unknown listing identity, missing historical NAV and future/mismatched FX',async()=>{
    const listing={instrumentId:'fund',currency:'SEK',assetType:'FUND',identityVerified:true};
    const market=createHistoricalPortfolioMarket({catalog:[listing],fetcher:async()=>({ok:true,json:async()=>[{base:'USD',quote:'SEK',date:'2026-10-06',rate:10,providers:[{key:'ECB',date:'2026-10-06',rate:10}]}]})});
    await assert.rejects(market.price({instrumentId:'unknown',currency:'SEK'},'2026-10-05'),/identitet/);
    await assert.rejects(market.price(listing,'2026-10-05'),/fond-NAV saknas/);
    await assert.rejects(market.fx('USD','2026-10-05'),/verifieras/);
    const nav=createHistoricalPortfolioMarket({catalog:[listing],historicalNav:async()=>({...listing,verified:true,price:100,date:'2026-10-02',source:'verified historical NAV',calendarVerified:true})});
    assert.equal((await nav.price(listing,'2026-10-04')).date,'2026-10-02');
});
test('CSV quoted decimal commas and names survive and blank numeric fields remain unknown',()=>{
    assert.deepEqual(csvObjects('Namn;Saldo\n"Fond, \"\"Global\"\"";"1 234,50"',';'),[{Namn:'Fond, "Global"',Saldo:'1 234,50'}]);
    assert.equal(csvNumber('1 234,50'),1234.5);assert.equal(csvNumber(''),null);assert.ok(Number.isNaN(csvNumber('saknas')));
    assert.throws(()=>csvObjects('A;B\nx;y;z',';'));
});
test('missing cash and fees ask for explicit reconciliation; holdings are not converted to guessed trades',()=>{
    const plan=preparePortfolioCsvImport([files[0]],{scopeConfirmed:true},syntheticCatalog);
    assert.equal(plan.ready,false);assert.equal(plan.questions.filter(q=>q.key.startsWith('cash:')).length,2);
    const trades={...syntheticFiles[4],text:syntheticFiles[4].text.replace(';0;synthetic-trade-001',';;synthetic-trade-001')};
    assert.equal(preparePortfolioCsvImport([trades],{},syntheticCatalog).ready,false);
    assert.equal(preparePortfolioCsvImport([trades],{'fee:synthetic-trade-001':0},syntheticCatalog).ready,true);
    assert.throws(()=>preparePortfolioCsvImport([files[0],syntheticFiles[4]],{},syntheticCatalog));
    assert.throws(()=>assertSyntheticFiles([{name:'my-real-portfolio.csv',text:files[0].text}]));
});
test('cash-only accounts need an explicit scope decision and can form a cash opening balance',()=>{
    const onlyCash={name:'Cash.csv',text:'Konto;Valuta;Saldo;Datum\nCash-ISK;SEK;1000;2026-10-04\n'};
    const unknown=preparePortfolioCsvImport([onlyCash],{scopeConfirmed:true},syntheticCatalog);assert.equal(unknown.ready,false);
    const included=preparePortfolioCsvImport([onlyCash],{scopeConfirmed:true,'cashAccount:Cash-ISK':'cash_only'},syntheticCatalog);
    assert.equal(included.ready,true);assert.equal(included.positions.length,0);assert.equal(included.cash[0].amount,1000);
});
test('shared market cache reuses evidence across users, coalesces simultaneous calls, retries failures',async()=>{
    let calls=0,fail=true;const values=new Map();
    const market=sharedHistoricalMarket({source:'verified_provider',price:async()=>{calls++;if(fail)throw new Error('unavailable');return {verified:true,source:'verified_provider',price:100};}},
        {read:async k=>values.get(k),write:async(k,v)=>values.set(k,v)});
    const p={instrumentId:'stock',currency:'SEK'};
    await assert.rejects(market.price(p,'2026-10-05'));fail=false;
    await Promise.all([market.price(p,'2026-10-05'),market.price(p,'2026-10-05')]);
    await market.price(p,'2026-10-05');assert.equal(calls,2);
});
test('server worker publishes one complete batch without user session and records missing NAV without invented history',async()=>{
    const provider=syntheticHistoricalProvider();const opening=preparePortfolioCsvImport(files,syntheticImportAnswers,syntheticCatalog);
    const prices=await Promise.all(opening.positions.map(p=>provider.price(p,opening.date)));
    const baseline={...opening,verified:true,coverage:'complete',positions:opening.positions.map(p=>({...p,price:prices.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:p.currency==='USD'?10:1})),valueSek:7000};
    let published=[],failures=[];const input={baseline,events:[],observations:[],revision:0,cashFlowCoverage:'complete',costCoverage:'complete'};
    const database={input:async()=>input,publish:async(_u,_r,batch)=>{published=batch;input.observations=batch;},failure:async(...args)=>failures.push(args)};
    const result=await updatePerformanceHistory({userId:'synthetic',database,market:provider,now:Date.parse('2026-10-10T08:00:00Z')});
    assert.equal(result.published,5);assert.equal(published[0].date,'2026-10-05');assert.equal((await updatePerformanceHistory({userId:'synthetic',database,market:provider,now:Date.parse('2026-10-10T08:00:00Z')})).published,0);
    await assert.rejects(updatePerformanceHistory({userId:'synthetic',database,market:{...provider,price:async()=>{throw new Error('NAV saknas');}},now:Date.parse('2026-10-11T08:00:00Z')}));
    assert.equal(failures.length,1);assert.equal(input.observations.length,5);
    const sunday=await provider.price(opening.positions[0],'2026-10-04');assert.equal(sunday.date,'2026-10-02');assert.equal(sunday.calendarVerified,true);
});
