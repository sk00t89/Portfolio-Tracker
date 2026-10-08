import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioDailyChange } from '../src/utils/portfolioDailyChange.js';
import { buildPortfolioPeriod } from '../src/utils/portfolioPeriod.js';
import { referenceFx, navPair } from '../supabase/functions/_shared/referenceData.js';
import { getVerifiedHoldingQuote, createVerifiedQuoteBatch } from '../src/services/verifiedHoldingQuote.js';
const now=Date.parse('2026-10-08T14:00:00Z');
const stock=overrides=>({id:'stock',name:'Stock',quantity:2,currentPrice:110,previousClose:100,currentValueSek:220,
    currency:'SEK',market:'XSTO',assetType:'STOCK',priceUpdatedAt:now,...overrides});
const fund=()=>({id:'fund',name:'Delayed fund',quantity:3,currentPrice:100,currentValueSek:300,currency:'SEK',isin:'SE0001718388',
    assetType:'FUND',market:'FUND',priceUpdatedAt:'2026-10-07',dailyReference:{nav:navPair([{price:90,date:'2026-10-06'},{price:100,date:'2026-10-07'}],
        {isin:'SE0001718388',currency:'SEK',provider:'Avanza',checkedAt:now})}});
test('delayed NAV allows a verified SEK subset while total stays null and shares are value-weighted',()=>{
    const holdings=[stock(),fund()];const before=structuredClone(holdings);
    const daily=calculatePortfolioDailyChange({holdings},now);
    assert.equal(daily.complete,false);assert.equal(daily.changeSek,null);assert.equal(daily.changePercent,null);
    assert.equal(daily.subset.scope,'subset');assert.equal(daily.subset.changeSek,20);assert.ok(Math.abs(daily.subset.changePercent-10)<1e-10);
    assert.equal(daily.subset.positionCount,1);assert.equal(daily.subset.portfolioValueSek,220);
    assert.ok(Math.abs(daily.subset.coveragePercent-220/520*100)<1e-10);assert.notEqual(daily.subset.coveragePercent,50);
    assert.equal(daily.positions[1].navObservation.date,'2026-10-07');assert.equal(daily.positions[1].navChange.previousDate,'2026-10-06');
    assert.deepEqual(holdings,before);
    const view=buildPortfolioPeriod({period:'1D',points:[{date:'2026-10-04',valueSek:100},{date:'2026-10-08',valueSek:520}],now,dailyChange:daily});
    assert.equal(view.dailySubsetAvailable,true);assert.equal(view.dailyAvailable,false);assert.equal(view.changeSek,null);assert.equal(view.points.length,0);
    assert.match(view.reason,/DELMÄNGD/);assert.match(view.reason,/Ingen intradagskurva/);
});
test('subset excludes bad previous close, failed checks, direct crypto and unavailable FX',()=>{
    for(const bad of [{previousClose:null},{quoteStale:true},{currency:'USD',market:'XNAS'},
        {assetType:'CRYPTO',market:'CRYPTO',isin:null},{priceUpdatedAt:now-31*60_000}]) {
        const daily=calculatePortfolioDailyChange({holdings:[stock(),stock({id:'bad',...bad}),fund()]},now);
        assert.deepEqual(daily.subset.positionIds,['stock']);assert.equal(daily.subset.changeSek,20);assert.equal(daily.complete,false);
    }
    assert.equal(calculatePortfolioDailyChange({holdings:[fund()]},now).subset,null);
    const unknown=calculatePortfolioDailyChange({holdings:[stock(),stock({id:'bad',currentValueSek:null})]},now);
    assert.equal(unknown.subset.changeSek,20);assert.equal(unknown.subset.coveragePercent,null);
});
test('subset includes reference FX on both correct dates without using saved SEK values as prior prices',()=>{
    const fx=referenceFx([{base:'USD',quote:'SEK',date:'2026-10-07',rate:10},{base:'USD',quote:'SEK',date:'2026-10-08',rate:11}],
        'USD','SEK','2026-10-08',now);
    const h=stock({currency:'USD',market:'XNAS',currentValueSek:2420,dailyReference:{fx}});
    const result=calculatePortfolioDailyChange({holdings:[h,fund()]},now);
    assert.equal(result.subset.changeSek,420);assert.ok(Math.abs(result.subset.changePercent-21)<1e-10);
    assert.equal(result.subset.portfolioValueSek,2420);assert.equal(result.changeSek,null);assert.equal(result.referenceFx,true);
});
test('relevant trades, flows and undated ledger entries block even a subset; complete input enables only the real total',()=>{
    for(const extra of [{transactions:[{date:'2026-10-08',type:'BUY'}]},{lysaTransactions:[{date:'2026-10-08',type:'Deposit'}]},
        {transactions:[{date:'not-a-date',type:'SELL'}]},{transactions:[{date:null,type:'SELL'}]}]) {
        const daily=calculatePortfolioDailyChange({holdings:[stock(),fund()],...extra},now);
        assert.equal(daily.subset,null);assert.deepEqual(daily.subsets,[]);assert.equal(daily.changeSek,null);
    }
    const full=calculatePortfolioDailyChange({holdings:[stock(),stock({id:'b',currentPrice:90,currentValueSek:180})]},now);
    assert.equal(full.complete,true);assert.equal(full.changeSek,0);assert.equal(full.subset.coveragePercent,100);
});
test('different market sessions yield separate subsets and never a sum of unrelated daily changes',()=>{
    const monday=Date.parse('2026-10-05T12:00:00Z');
    const us=stock({id:'us',market:'XNAS',priceUpdatedAt:Date.parse('2026-10-02T20:00:00Z')});
    const sw=stock({id:'sw',priceUpdatedAt:monday});
    const daily=calculatePortfolioDailyChange({holdings:[us,sw]},monday);
    assert.equal(daily.complete,false);assert.equal(daily.subsets.length,2);assert.equal(daily.subset.currentDate,'2026-10-05');
    assert.equal(daily.subset.changeSek,20);assert.deepEqual(daily.subset.positionIds,['sw']);assert.equal(daily.subset.coveragePercent,50);
});
const unavailable=[['VIRAVAX','SE0022050092'],['VIRLINK','SE0021149259'],['VIRALT','SE0023260716'],['VIRADA','SE0021630449'],
    ['VIRSETHS','SE0020541639'],['VIRDOT','SE0021148129'],['VIRSOL','SE0021309754'],['VIRXRP','SE0021486156']];
test('the eight unverified Virtune listings skip Yahoo without replacing their broker quote or inventing previousClose',async()=>{
    for(const [ticker,isin]of unavailable){let diagnostics;
        const h=stock({ticker,isin,instrumentId:'broker-id',provider:'Avanza',assetType:'CERTIFICATE'});
        const result=await getVerifiedHoldingQuote(h,{getAvanzaPriceByInstrumentId:async()=>({instrumentId:h.instrumentId,isin,price:110,currency:'SEK',timestamp:now}),
            getNordnetPriceByIsin:async()=>{throw new Error('unavailable');},getYahooPrice:async()=>assert.fail('unverified Yahoo listing was requested')},()=>now,d=>diagnostics=d);
        assert.equal(result.price,110);assert.equal(result.previousClose,undefined);assert.equal(result.timestamp,now);
        assert.ok(diagnostics.some(d=>d.reasonCode==='YAHOO_LISTING_UNVERIFIED'));assert.ok(diagnostics.some(d=>d.reasonCode==='VALUATION_ONLY'));
    }
});
test('actual errors, unknown listing pairs and supported certificate fallback remain visible and strictly validated',async()=>{
    for(const h of [stock({ticker:'VIRAVAX',isin:'OTHER',assetType:'CERTIFICATE'}),stock({ticker:'VALOUR BTC 0 SEK',isin:'VALID',assetType:'CERTIFICATE'}),
        stock({ticker:'VIRAVAX',isin:'SE0022050092',assetType:'STOCK'})]){
        let calls=0,diagnostics;
        const result=await getVerifiedHoldingQuote(h,{getYahooPrice:async()=>{calls++;throw Object.assign(new Error('404'),{code:'MARKET_API_REQUEST_FAILED',httpStatus:404});}},()=>now,d=>diagnostics=d);
        assert.equal(calls,1);assert.equal(result,null);assert.ok(diagnostics.some(d=>d.httpStatus===404));
    }
    const h=stock({ticker:'VALOUR BTC 0 SEK',isin:'VALID',assetType:'CERTIFICATE'});
    const q=await getVerifiedHoldingQuote(h,{getYahooPrice:async symbol=>({symbol,exchangeName:'STO',price:110,previousClose:100,currency:'SEK',timestamp:now})},()=>now);
    assert.equal(q.previousClose,100);
});
test('a batch deduplicates equivalent market and symbol forms while preserving currency and user boundaries',async()=>{
    let calls=0;
    const providers={getYahooPrice:async symbol=>{calls++;return {symbol,exchangeName:'STO',price:110,previousClose:100,currency:'SEK',timestamp:now};}};
    const batch=createVerifiedQuoteBatch('u',providers,()=>now);
    const a=stock({ticker:'INVE B',isin:'same'});
    const q=await batch(a);const q2=await batch({...a,id:'b',market:'Stockholmsbörsen',ticker:'INVE-B.ST',quantity:20});
    assert.equal(calls,1);assert.equal(q.price,q2.price);assert.equal(q.checkedAt,q2.checkedAt);
    assert.equal(await batch({...a,currency:'USD'}),null);assert.equal(calls,2);
    await createVerifiedQuoteBatch('other',providers,()=>now)(a);assert.equal(calls,3);
});
