import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDailyReferenceRefresh, dailyReferenceTargets, watchDailyReferences } from '../src/services/dailyReferenceRefresh.js';
import { calculatePortfolioDailyChange } from '../src/utils/portfolioDailyChange.js';
import { referenceFx, navPair, REFERENCE_DATA_VERSION } from '../supabase/functions/_shared/referenceData.js';

const start = Date.parse('2026-10-08T14:00:00Z');
const stock = overrides => ({id:'s',name:'Stock',quantity:2,currentPrice:110,previousClose:100,currentValueSek:220,
    currency:'SEK',market:'XSTO',assetType:'STOCK',priceUpdatedAt:start,...overrides});
const fund = overrides => ({id:'f',name:'Fund',isin:'SE0001718388',currency:'SEK',assetType:'FUND',market:'FUND',
    platform:'Avanza',provider:'Avanza',instrumentId:'41567',quantity:2,currentPrice:110,currentValueSek:220,priceUpdatedAt:'2026-10-08',...overrides});
const nav = now => navPair([{date:'2026-10-07',price:100},{date:'2026-10-08',price:110}],
    {isin:'SE0001718388',currency:'SEK',provider:'Avanza',checkedAt:now});
const fx = now => referenceFx([{base:'USD',quote:'SEK',date:'2026-10-07',rate:10},{base:'USD',quote:'SEK',date:'2026-10-08',rate:11}],
    'USD','SEK','2026-10-08',now);
const response = data => ({ok:true,status:200,json:async()=>data});

test('historical NAV and FX observations survive the polling interval without relabelled checks or dates', () => {
    const time=start+21*60_000;
    const h=fund({dailyReference:{nav:nav(start)}});
    const before=structuredClone(h);
    const result=calculatePortfolioDailyChange({holdings:[h]},time);
    assert.equal(result.sekCoveragePercent,100);
    assert.ok(Math.abs(result.positions[0].navChange.percent-10)<1e-10);
    assert.equal(result.positions[0].diagnostic.referenceCheckedAt,start);
    assert.equal(result.today.complete,false,'NAV is always separate from IDAG');
    assert.equal(result.today.subset,null);
    assert.deepEqual(h,before);
    const dollar=stock({currency:'USD',market:'XNAS',priceUpdatedAt:time,dailyReference:{fx:fx(start)}});
    assert.equal(calculatePortfolioDailyChange({holdings:[dollar]},time).today.complete,true);
    const wrong=structuredClone(dollar);wrong.dailyReference.fx.observations[0].sourceDate='2026-10-06';
    assert.equal(calculatePortfolioDailyChange({holdings:[wrong]},time).today.complete,false);
});

test('IDAG resets at Stockholm midnight while prior-session comparison stays explicitly dated; opening requires new quotes', () => {
    const h=stock({priceUpdatedAt:Date.parse('2026-10-08T15:30:00Z')});
    const before=calculatePortfolioDailyChange({holdings:[h]},Date.parse('2026-10-08T21:59:00Z'));
    assert.equal(before.today.complete,true);
    for(const instant of ['2026-10-08T22:01:00Z','2026-10-09T06:59:00Z']) {
        const data=calculatePortfolioDailyChange({holdings:[h]},Date.parse(instant));
        assert.equal(data.today.complete,false);assert.equal(data.today.subset,null);
        assert.equal(data.latestSessionSubsets[0].currentDate,'2026-10-08');
        assert.equal(data.positions[0].instrumentCovered,true);
    }
    const opening=Date.parse('2026-10-09T07:01:00Z');
    assert.equal(calculatePortfolioDailyChange({holdings:[h]},opening).today.subset,null);
    assert.equal(calculatePortfolioDailyChange({holdings:[{...h,priceUpdatedAt:opening}]},opening).today.complete,true);
});

test('today and older market groups stay separate and all flow protections remain active', () => {
    const monday=Date.parse('2026-10-05T12:00:00Z');
    const sw=stock({priceUpdatedAt:monday});
    const us=stock({id:'us',market:'XNAS',priceUpdatedAt:Date.parse('2026-10-02T20:00:00Z')});
    const data=calculatePortfolioDailyChange({holdings:[sw,us]},monday);
    assert.equal(data.today.complete,false);assert.deepEqual(data.today.subset.positionIds,['s']);
    assert.deepEqual(data.latestSessionSubsets[0].positionIds,['us']);
    assert.equal(data.today.subset.coveragePercent,50);
    const blocked=calculatePortfolioDailyChange({holdings:[sw,us],transactions:[{date:'2026-10-05',type:'BUY'}]},monday);
    assert.equal(blocked.today.subset,null);assert.deepEqual(blocked.latestSessionSubsets,[]);
});

test('reference polling deduplicates positions and returns retain valid observations on failed or invalid refresh', async () => {
    let clock=start,calls=0,mode='ok';
    const reader=createDailyReferenceRefresh({clock:()=>clock,request:async path=>{
        assert.match(path,/^\/api\/(nav-comparison|reference-fx)/);calls++;
        if(mode==='fail')throw new Error('provider failed');
        const data=path.includes('reference-fx')?fx(clock):{apiVersion:REFERENCE_DATA_VERSION,...nav(clock)};
        if(mode==='invalid' && data.current)data.current={...data.current,isin:'OTHER'};
        return response(data);
    }});
    const targets=dailyReferenceTargets([fund(),fund({id:'f2'}),stock({currency:'USD'})]);
    const first=await reader.refresh(targets,'u');assert.equal(calls,2);
    await reader.refresh(targets,'u');assert.equal(calls,2);
    clock+=21*60_000;mode='fail';
    const failed=await reader.refresh(targets,'u');assert.equal(calls,4);
    assert.equal(failed.f.nav.current.checkedAt,start);assert.equal(failed.s.fx.current.checkedAt,start);
    assert.match(failed.f.refreshError,/misslyckades/);
    clock+=3*60_000;mode='invalid';
    const invalid=await reader.refresh(targets,'u');
    assert.equal(invalid.f.nav.current.isin,first.f.nav.current.isin);
    assert.equal(invalid.f.nav.current.checkedAt,start);
    assert.match(invalid.f.refreshError,/NAV_IDENTITY_INVALID/);
});

test('refresh is scheduled at date and session changes even with a fresh cache, not on every clock tick', async () => {
    let clock=Date.parse('2026-10-08T21:59:00Z'),calls=0;
    const reader=createDailyReferenceRefresh({clock:()=>clock,request:async()=>{calls++;return response(fx(start));}});
    const targets=dailyReferenceTargets([stock({currency:'USD'})]);
    await reader.refresh(targets,'u');assert.equal(calls,1);
    clock+=30_000;await reader.refresh(targets,'u');assert.equal(calls,1);
    clock=Date.parse('2026-10-08T22:01:00Z');await reader.refresh(targets,'u');assert.equal(calls,2);
    clock=Date.parse('2026-10-09T06:59:00Z');await reader.refresh(targets,'u');
    const before=calls;clock=Date.parse('2026-10-09T07:01:00Z');await reader.refresh(targets,'u');assert.equal(calls,before+1);
    await reader.refresh(targets,'u');assert.equal(calls,before+1);
});

test('visibility return rechecks references, hidden ticks are skipped, and unmount removes subscriptions', async () => {
    let clock=start,calls=0,tick,listener;
    const document={visibilityState:'visible',addEventListener(name,fn){assert.equal(name,'visibilitychange');listener=fn;},
        removeEventListener(name,fn){assert.equal(name,'visibilitychange');assert.equal(fn,listener);listener=null;}};
    const reader=createDailyReferenceRefresh({clock:()=>clock,request:async()=>{calls++;return response({apiVersion:REFERENCE_DATA_VERSION,...nav(clock)});}});
    const targets=dailyReferenceTargets([fund()]);
    const pending=[];
    const stop=watchDailyReferences({clock:()=>clock,eventTarget:document,refresh:time=>pending.push(reader.refresh(targets,'u',time)),
        schedule(fn,ms){assert.equal(ms,30000);tick=fn;return 42;},unschedule(id){assert.equal(id,42);tick=null;}});
    await Promise.all(pending);assert.equal(calls,1);
    listener();await Promise.all(pending);assert.equal(calls,1,'fresh return must not call provider again');
    document.visibilityState='hidden';clock+=21*60_000;tick();assert.equal(calls,1);
    document.visibilityState='visible';listener();await Promise.all(pending);assert.equal(calls,2);
    stop();assert.equal(tick,null);assert.equal(listener,null);
});

test('read-only references never call quote writes, and quote publication never waits for reference requests', () => {
    const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
    const body=app.slice(app.indexOf('    const performHoldingPriceUpdate ='),app.indexOf('    const updateAllHoldingPrices ='));
    assert.doesNotMatch(body,/getHoldingDailyReference|dailyReference: await/);
    const module=readFileSync(new URL('../src/services/dailyReferenceRefresh.js',import.meta.url),'utf8');
    assert.doesNotMatch(module,/updateDatabase|savePortfolio|from\s*["'].*database|method:\s*["'](?:POST|PUT|PATCH)/);
});

test('Lysa references share a bulk GET and cached comparisons stay isolated by user', async () => {
    let calls=0;
    const lysaNav={...navPair([{date:'2026-10-07',price:100},{date:'2026-10-08',price:110}],
        {isin:'SE0009268584',currency:'SEK',provider:'Lysa',checkedAt:start})};
    const reader=createDailyReferenceRefresh({clock:()=>start,request:async path=>{
        assert.equal(path,'/api/lysa-nav-comparisons');calls++;
        return response({apiVersion:REFERENCE_DATA_VERSION,comparisons:{SE0009268584:lysaNav}});
    }});
    const targets=dailyReferenceTargets([fund({platform:'Lysa',isin:'SE0009268584'}),fund({id:'f2',platform:'Lysa',isin:'SE0009268584'})]);
    const first=await reader.refresh(targets,'user-one');assert.equal(calls,1);
    assert.deepEqual(first.f.nav,first.f2.nav);
    await reader.refresh(targets,'user-one');assert.equal(calls,1);
    await reader.refresh(targets,'user-two');assert.equal(calls,2,'new user must not consume another user cache');
});

test('an old pending response cannot replace a newer session reference', async () => {
    let clock=Date.parse('2026-10-08T21:59:00Z');
    const resolve=[];
    const reader=createDailyReferenceRefresh({clock:()=>clock,request:()=>new Promise(done=>resolve.push(done))});
    const targets=dailyReferenceTargets([stock({currency:'USD'})]);
    const older=reader.refresh(targets,'u');assert.equal(resolve.length,1);
    clock=Date.parse('2026-10-08T22:01:00Z');
    const newer=reader.refresh(targets,'u');assert.equal(resolve.length,2);
    const newestFx=fx(clock);
    resolve[1](response(newestFx));const current=await newer;
    resolve[0](response(fx(start)));const obsolete=await older;
    assert.equal(current.s.fx.current.checkedAt,clock);
    assert.equal(obsolete.s.fx.current.checkedAt,clock);
    assert.equal((await reader.refresh(targets,'u')).s.fx.current.checkedAt,clock);
});
