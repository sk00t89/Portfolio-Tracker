import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceFx, navPair } from '../supabase/functions/_shared/referenceData.js';
import { createReferenceDataRoutes } from '../supabase/functions/_shared/referenceDataRoutes.js';
import { createReferenceFxClient } from '../src/services/referenceFxClient.js';
import { calculatePortfolioDailyChange } from '../src/utils/portfolioDailyChange.js';
import { dailyHoldingCoverage } from '../src/utils/dailyChangeCoverage.js';
import { mergeQuoteRefresh, attachDailyReferences } from '../src/utils/atomicQuoteRefresh.js';
import { appHoldingToDatabase } from '../src/utils/holdingDatabaseMapper.js';
const now = Date.parse('2026-10-08T14:00:00Z');
const rows = [{base:'USD',quote:'SEK',date:'2026-10-07',rate:10},{base:'USD',quote:'SEK',date:'2026-10-08',rate:11}];
const fx = () => referenceFx(rows,'USD','SEK','2026-10-08',now);
const stock = overrides => ({id:'a',name:'A',quantity:2,currentPrice:110,previousClose:100,currentValueSek:2420,
    currency:'USD',market:'XNAS',assetType:'STOCK',priceUpdatedAt:now,dailyReference:{fx:fx()},...overrides});
const fund = overrides => ({id:'f',name:'Fund',quantity:2,currentPrice:110,currentValueSek:220,
    currency:'SEK',isin:'SE0001718388',assetType:'FUND',market:'FUND',priceUpdatedAt:'2026-10-07',
    dailyReference:{nav:navPair([{date:'2026-10-06',price:100},{date:'2026-10-07',price:110}],
        {isin:'SE0001718388',currency:'SEK',provider:'Avanza',checkedAt:now})},...overrides});
const response = data => ({ok:true,status:200,json:async()=>data});
test('FX retains source dates and null source instant independently of check time', () => {
    const data=fx(); assert.equal(data.current.sourceDate,'2026-10-08');assert.equal(data.previous.sourceDate,'2026-10-07');
    assert.equal(data.current.sourceTimestamp,null); assert.equal(data.current.checkedAt,now);
    for(const change of [{rate:0},{rate:Infinity},{date:'2026-02-30'},{date:'2026-10-09'},{base:'EUR'}])
        assert.throws(()=>referenceFx([rows[0],{...rows[1],...change}],'USD','SEK','2026-10-08',now));
    assert.throws(()=>referenceFx([rows[0],rows[0]],'USD','SEK','2026-10-08',now));
});
test('FX uses real previous observations across weekend and missing publication, not synthetic dates', () => {
    const data=referenceFx([{...rows[0],date:'2026-10-02'},{...rows[1],date:'2026-10-05'}],'USD','SEK','2026-10-05',now);
    assert.equal(data.previous.sourceDate,'2026-10-02');
    const result=calculatePortfolioDailyChange({holdings:[stock({dailyReference:{fx:{...fx(),observations:[fx().previous]}}})]},now);
    assert.equal(result.complete,false); assert.equal(result.changeSek,null);assert.equal(result.instrumentCoveragePercent,100);assert.equal(result.sekCoveragePercent,0);
});
test('FX client ignores legacy numbers, deduplicates, validates and expires objects without relabelling source time',async()=>{
    const cache=new Map([['exchangeRate_USD_SEK',JSON.stringify({rate:999,fetchedAt:now})]]);
    let calls=0,clock=now;
    const client=createReferenceFxClient({clock:()=>clock,storage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},
        request:async()=>{calls++;return response(referenceFx(rows,'USD','SEK','2026-10-08',clock));}});
    const [a,b]=await Promise.all([client('USD','SEK'),client('USD','SEK')]);assert.equal(calls,1);assert.deepEqual(a,b);
    await client('USD','SEK');assert.equal(calls,1);clock+=11*60_000;const c=await client('USD','SEK');assert.equal(calls,2);
    assert.equal(c.current.sourceTimestamp,null);assert.equal(c.current.sourceDate,'2026-10-08');
    cache.set('referenceFx_v1_USD_SEK_2026-10-08','broken');await client('USD','SEK');assert.equal(calls,3);
});
test('SEK movement includes both instrument and reference-FX movement with prior denominator',()=>{
    const result=calculatePortfolioDailyChange({holdings:[stock()]},now);
    assert.equal(result.complete,true);assert.equal(result.changeSek,420);assert.ok(Math.abs(result.changePercent-21)<1e-9);
    assert.equal(result.referenceFx,true);assert.equal(result.sekCoveragePercent,100);
    // Saved valuation may use a different reference vintage; it is not rewritten or treated as the comparison leg.
    const h=stock({currentValueSek:9999}); const copy=structuredClone(h);
    assert.equal(calculatePortfolioDailyChange({holdings:[h]},now).changeSek,420);assert.deepEqual(h,copy);
    assert.equal(calculatePortfolioDailyChange({holdings:[stock({quantity:1e308})]},now).complete,false);
});
test('missing, wrong-pair, future-check and fabricated timestamp FX never produce exact SEK return',()=>{
    for(const bad of [{...fx(),observations:[]},{...fx(),observations:fx().observations.map(x=>({...x,from:'EUR'}))},
        {...fx(),observations:fx().observations.map(x=>({...x,checkedAt:now+1}))},
        {...fx(),observations:fx().observations.map(x=>({...x,sourceTimestamp:now}))}]) {
        const result=calculatePortfolioDailyChange({holdings:[stock({dailyReference:{fx:bad}})]},now);
        assert.equal(result.complete,false);assert.equal(result.changeSek,null);assert.equal(result.instrumentCoveragePercent,100);
    }
});
test('NAV compares actual dates, reports yesterday and never turns delayed NAV into zero today',()=>{
    const h=fund(),p=dailyHoldingCoverage(h,now);
    assert.equal(p.instrumentCovered,true);assert.equal(p.covered,false);assert.equal(p.navChange.date,'2026-10-07');
    assert.equal(p.navChange.previousDate,'2026-10-06');assert.ok(Math.abs(p.navChange.percent-10)<1e-9);
    assert.match(p.reasons.join(' '),/Senaste NAV 2026-10-07/);
    const r=calculatePortfolioDailyChange({holdings:[h]},now);assert.equal(r.changeSek,null);assert.equal(r.instrumentCoveragePercent,100);assert.equal(r.sekCoveragePercent,0);
    for(const points of [[{date:'2026-10-09',price:100}],[{date:'2026-10-07',price:0}],
        [{date:'2026-10-07',price:100},{date:'2026-10-07',price:101}]])assert.throws(()=>navPair(points,{isin:h.isin,currency:'SEK',provider:'Avanza',checkedAt:now}));
});
test('NAV can join complete SEK comparison only on the same current and previous sessions',()=>{
    const h=fund({priceUpdatedAt:'2026-10-08',dailyReference:{nav:navPair([{date:'2026-10-07',price:100},{date:'2026-10-08',price:110}],
        {isin:'SE0001718388',currency:'SEK',provider:'Avanza',checkedAt:now})}});
    assert.equal(calculatePortfolioDailyChange({holdings:[h]},now).changeSek,20);
    assert.equal(calculatePortfolioDailyChange({holdings:[{...h,dailyReference:{nav:{...h.dailyReference.nav,previous:{...h.dailyReference.nav.previous,sourceDate:'2026-10-06'}}}}]},now).complete,false);
});
test('last relevant sessions, mixed US/Sweden calendars and weekend flows remain conservative',()=>{
    const monday=Date.parse('2026-10-05T12:00:00Z');
    const us=stock({priceUpdatedAt:Date.parse('2026-10-02T20:00:00Z'),dailyReference:{fx:referenceFx([
        {...rows[0],date:'2026-10-01'},{...rows[1],date:'2026-10-02'}],'USD','SEK','2026-10-05',monday)}});
    const sw=stock({id:'s',currency:'SEK',market:'XSTO',currentValueSek:220,priceUpdatedAt:monday,dailyReference:{}});
    assert.equal(dailyHoldingCoverage(us,monday).currentDate,'2026-10-02');
    assert.equal(calculatePortfolioDailyChange({holdings:[us]},monday).complete,true);
    const mixed=calculatePortfolioDailyChange({holdings:[us,sw]},monday);assert.equal(mixed.complete,false);assert.match(mixed.reasons.join(' '),/Blandade handelskalendrar/);
    assert.equal(calculatePortfolioDailyChange({holdings:[us],transactions:[{date:'2026-10-03',type:'BUY'}]},monday).complete,false);
    assert.equal(dailyHoldingCoverage(stock({previousCloseDate:'2026-10-06'}),now).covered,false);
});
test('listed crypto certificates use their SEK listing while direct crypto cannot borrow 24h data',()=>{
    const certificate=stock({currency:'SEK',market:'XSAT',isin:'SE-CERT',assetType:'CERTIFICATE',productType:'SINGLE_ASSET',dailyReference:{},currentValueSek:220});
    assert.equal(calculatePortfolioDailyChange({holdings:[certificate]},now).complete,true);
    assert.equal(calculatePortfolioDailyChange({holdings:[{...certificate,isin:null,market:'CRYPTO',assetType:'CRYPTO'}]},now).complete,false);
});
test('comparison travels in batch checks and never enters database fields or restores other users data',()=>{
    const h=stock(),reference={fx:fx()};
    const merged=mergeQuoteRefresh([h],[{original:h,holding:h,checkedAt:now,dailyReference:reference}],'u');
    assert.deepEqual(merged.checks.a.dailyReference,reference);assert.equal(merged.checks.a.userId,'u');
    assert.equal(attachDailyReferences([h],merged.checks,'other')[0].dailyReference,null);
    assert.deepEqual(attachDailyReferences([h],merged.checks,'u')[0].dailyReference,reference);
    assert.equal(attachDailyReferences([{...h,currentPrice:999}],merged.checks,'u')[0].dailyReference,null);
    assert.equal('dailyReference' in appHoldingToDatabase(h),false);
    assert.equal(mergeQuoteRefresh([h],[{original:h,holding:null,dailyReference:reference}],'u').checks.a.dailyReference,null);
});
test('shared FX route validates response identities and returns no made-up publication instant',async()=>{
    let url;
    const route=createReferenceDataRoutes({clock:()=>now,fetcher:async u=>{url=u;return response(rows);}});
    const result=await route(new URL('https://test/api/reference-fx/USD/SEK'));assert.equal(result.status,200);
    assert.match(url,/v2\/rates\?/);assert.equal(result.body.current.sourceTimestamp,null);
    const bad=createReferenceDataRoutes({clock:()=>now,fetcher:async()=>response([{...rows[0],base:'EUR'}])});
    assert.equal((await bad(new URL('https://test/api/reference-fx/USD/SEK'))).status,502);
});
test('Avanza NAV uses verified fund detail and two actual graph days; wrong identity or prices fail closed',async()=>{
    const detail={isin:'SE0001718388',currency:'SEK',nav:110,navDate:'2026-10-07T00:00:00'};
    const points=[{timestamp:Date.parse('2026-10-05T22:00:00Z'),close:100},{timestamp:Date.parse('2026-10-06T22:00:00Z'),close:110}];
    const run=async(d=detail,p=points)=>{
        const route=createReferenceDataRoutes({clock:()=>now,fetcher:async url=>url.includes('market-guide')?{ok:false,status:404}:response(url.includes('fund-guide')?d:{ohlc:p})});
        return route(new URL('https://test/api/nav-comparison?provider=Avanza&instrumentId=41567&isin=SE0001718388'));
    };
    const r=await run();assert.equal(r.status,200);assert.equal(r.body.previous.sourceDate,'2026-10-06');assert.equal(r.body.current.sourceTimestamp,null);
    for(const d of [{...detail,isin:'SE0000000000'},{...detail,type:'ETF'},{...detail,orderbookId:'wrong'}])assert.equal((await run(d)).status,502);
    assert.equal((await run(detail,[...points.slice(0,1),{...points[1],close:111}])).status,502);
});
test('Lysa fetches actual dated NAV and never skips an unavailable day as if it had no publication',async()=>{
    const latest=[{isin:'SE0009268584',currency:'SEK',date:'2026-10-07',price:110}];
    let requested=[];
    const route=createReferenceDataRoutes({clock:()=>now,fetcher:async url=>{requested.push(url);return response(url.endsWith('latest')?latest:[{...latest[0],date:'2026-10-06',price:100}]);}});
    const r=await route(new URL('https://test/api/lysa-nav-comparisons'));
    assert.equal(r.body.comparisons.SE0009268584.previous.sourceDate,'2026-10-06');assert.equal(requested.length,2);
    requested=[];
    const failed=createReferenceDataRoutes({clock:()=>now,fetcher:async url=>{requested.push(url);return url.endsWith('latest')?response(latest):{ok:false,status:503};}});
    const f=await failed(new URL('https://test/api/lysa-nav-comparisons'));assert.equal(f.body.comparisons.SE0009268584.previous,null);assert.equal(requested.length,2);
});
test('Lysa as-of weekend response keeps Friday publication date and holiday calendars do not shift NAV',async()=>{
    const monday=Date.parse('2026-10-05T14:00:00Z');
    const current={isin:'SE0009268584',currency:'SEK',date:'2026-10-05',price:110};
    const route=createReferenceDataRoutes({clock:()=>monday,fetcher:async url=>response([url.endsWith('latest')?current:{...current,date:'2026-10-02',price:100}])});
    const r=await route(new URL('https://test/api/lysa-nav-comparisons'));
    assert.equal(r.body.comparisons[current.isin].previous.sourceDate,'2026-10-02');
    const holiday=Date.parse('2026-06-19T12:00:00Z'); // Midsummer Eve: Stockholm closed, USA open later.
    const h=stock({currency:'SEK',market:'XSTO',priceUpdatedAt:Date.parse('2026-06-18T15:30:00Z'),dailyReference:{},currentValueSek:220});
    const result=calculatePortfolioDailyChange({holdings:[h]},holiday);
    assert.equal(result.complete,true);assert.equal(result.currentDate,'2026-06-18');assert.match(result.label,/Senaste handelsdag/);
});
