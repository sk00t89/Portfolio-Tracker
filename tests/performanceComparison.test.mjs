import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioPerformance, PERFORMANCE_VERSION } from '../src/utils/portfolioPerformance.js';
import { PERFORMANCE_CONVENTION } from '../src/utils/performanceLedger.js';
import { buildPortfolioPeriod } from '../src/utils/portfolioPeriod.js';
import { buildDailyPerformanceView, COMPARISON_VERSION } from '../src/utils/performanceComparison.js';
import { convertPerformanceBenchmark } from '../src/services/performanceBenchmarks.js';
import { INDEXES, INDEX_HISTORY_VERSION, indexPeriodStart } from '../supabase/functions/_shared/indexHistory.js';
import { parseHistoricalIndexFx, createHistoricalIndexFxRoute, INDEX_FX_VERSION } from '../supabase/functions/_shared/historicalIndexFx.js';
import { createMarketQuoteRoutes } from '../supabase/functions/_shared/marketQuoteRoutes.js';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const now=Date.parse('2026-10-10T12:00:00Z'),today='2026-10-10';
const dates=['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'];
const performance=()=>buildPortfolioPerformance({apiVersion:PERFORMANCE_VERSION,revision:1,returnBasis:'net_total_return',
    convention:PERFORMANCE_CONVENTION,cashFlowCoverage:'complete',costCoverage:'complete',flows:[],
    baseline:{date:dates[0],asOf:`${dates[0]}T21:30:00Z`,valueSek:1000,verified:true,source:'broker',coverage:'complete',positions:[],cash:[{accountId:'a',currency:'SEK',amount:1000}],finalized:true},
    observations:dates.slice(1).map((date,i)=>({date,asOf:`${date}T21:30:00Z`,valueSek:1010+i*10,verified:true,source:'certified close',coverage:'complete',revision:1,finalized:true}))},now);
const benchmark=()=>({apiVersion:COMPARISON_VERSION,verified:true,id:'OMXS30',currency:'SEK',returnBasis:'price_return',
    convention:PERFORMANCE_CONVENTION,source:'Yahoo Finance',fxLabel:'Index i SEK',points:dates.slice(1).map((date,i)=>({date,value:100+i}))});
const index=(id='SP500',period='All')=>({apiVersion:INDEX_HISTORY_VERSION,id,...INDEXES[id],source:'Yahoo Finance',returnBasis:'price_return',period,
    requestedStart:indexPeriodStart(period,today),requestedEnd:today,missing:0,
    points:['2026-10-05','2026-10-06'].map((date,i)=>({date,value:100+i*10,barTimestamp:`${date}T13:30:00Z`}))});
const rawFx=()=>[{base:'USD',quote:'SEK',date:'2026-10-05',rate:10,providers:['ecb']},{base:'USD',quote:'SEK',date:'2026-10-06',rate:11,providers:['ecb']}];

test('live expanded ECB attribution requires matching provider date and rate',()=>{
    const rows=rawFx().map(row=>({...row,providers:[{key:'ECB',date:row.date,rate:row.rate}]}));
    assert.equal(parseHistoricalIndexFx(rows,'2026-10-05','2026-10-06',now).points.length,2);
    for(const provider of [{key:'OTHER',date:rows[0].date,rate:10},{key:'ECB',date:'2026-10-04',rate:10},{key:'ECB',date:rows[0].date,rate:9}]) {
        assert.throws(()=>parseHistoricalIndexFx([{...rows[0],providers:[provider]}],'2026-10-05','2026-10-06',now));
    }
});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('short histories can compare 1M/3M/1Y/ALL at a common actual zero date without claiming full coverage',()=>{
    for(const period of ['1V','1M','3M','1Å','YTD','All']) {
        const result=buildDailyPerformanceView(performance(),benchmark(),period,today,now);
        assert.equal(result.comparison.available,true);assert.equal(result.comparison.start,'2026-10-05');
        assert.equal(result.comparison.series[0].value,0);assert.equal(result.comparison.series[0].benchmark,0);
        assert.equal(result.comparison.partial,true);assert.equal(result.comparison.excessPercentagePoints,null);
        assert.match(result.comparison.disclosure,/utdelningar/);
    }
});
test('comparison uses common finalized dates, skips market holidays and retains its zero point',()=>{
    const b=benchmark();b.points=b.points.filter(p=>p.date!=='2026-10-06');
    const result=buildDailyPerformanceView(performance(),b,'All',today,now);
    assert.deepEqual(result.comparison.omittedDates,['2026-10-04','2026-10-06']);
    assert.equal(result.comparison.series[0].value,0);assert.equal(result.comparison.series[0].date,'2026-10-05');
    assert.equal(result.comparison.series.some(p=>p.date==='2026-10-06'),false);
});
test('live observation cannot suppress completed comparison or appear in its percentage series',()=>{
    const original=[{date:'2026-10-04',valueSek:1000},{date:'2026-10-09',valueSek:1050}],copy=structuredClone(original);
    const view=buildPortfolioPeriod({points:original,portfolioReturns:performance(),benchmark:benchmark(),period:'1M',today,now,
        livePoint:{date:today,valueSek:999999,live:true}});
    assert.equal(view.comparison.available,true);assert.equal(view.comparison.end,'2026-10-09');
    assert.equal(view.comparison.series.some(p=>p.live||p.date===today),false);assert.deepEqual(original,copy);
});
test('different real source times compare by explicit daily convention, not invented timestamps',()=>{
    const b=benchmark();b.points=b.points.map(p=>({...p,barTimestamp:`${p.date}T13:30:00Z`}));
    assert.equal(buildDailyPerformanceView(performance(),b,'All',today,now).comparison.available,true);
    assert.equal(buildDailyPerformanceView(performance(),{...b,convention:'intraday'},'All',today,now).comparison.available,false);
});
test('a midday import is not used as that day market close; baseline is preserved unchanged',()=>{
    const p=performance();p.points[0].finalized=false;
    const copy=structuredClone(p);const result=buildDailyPerformanceView(p,benchmark(),'All',today,now);
    assert.equal(result.points[0].date,'2026-10-05');assert.equal(result.comparison.series[0].value,0);assert.deepEqual(p,copy);
});
test('no fabricated comparison with 1D, future, corrupt, unverified or insufficient data',()=>{
    assert.equal(buildDailyPerformanceView(performance(),benchmark(),'1D',today,now).available,false);
    for(const overrides of [{verified:false},{currency:'USD'},{cashFlowCoverage:'unknown'},{points:[]},
        {points:[...performance().points,{date:today,value:100,finalized:true,asOf:`${today}T21:30:00Z`}]}]) {
        assert.equal(buildDailyPerformanceView({...performance(),...overrides},benchmark(),'All',today,now).available,false);
    }
});
test('S&P conversion multiplies each historical close by SEK per USD before normalization',()=>{
    const data=index(),fx=parseHistoricalIndexFx(rawFx(),'2026-10-05','2026-10-06',now);
    const result=convertPerformanceBenchmark(data,fx,now);
    assert.equal(result.points[0].value,1000);assert.equal(result.points[1].value,1210);
    close((result.points[1].value/result.points[0].value-1)*100,21);
    assert.equal(result.points[0].barTimestamp,data.points[0].barTimestamp);assert.match(result.fxLabel,/dagsreferens/);
});
test('OMXS30 keeps SEK; missing historical FX dates are omitted rather than filled',()=>{
    assert.equal(convertPerformanceBenchmark(index('OMXS30'),null,now).points[1].value,110);
    const fx=parseHistoricalIndexFx(rawFx().slice(0,1),'2026-10-05','2026-10-06',now);
    const result=convertPerformanceBenchmark(index(),fx,now);
    assert.deepEqual(result.missingFxDates,['2026-10-06']);assert.equal(result.points.length,1);
    assert.throws(()=>convertPerformanceBenchmark(index(),null,now),/USD\/SEK/);
});
test('historical FX checks exact pair, dates, order, provider and numeric rates',()=>{
    for(const mutate of [rows=>rows.reverse(),rows=>[rows[0],rows[0]],rows=>[{...rows[0],base:'SEK'}],
        rows=>[{...rows[0],rate:'10'}],rows=>[{...rows[0],rate:0}],rows=>[{...rows[0],providers:['other']}],
        rows=>[{...rows[0],date:'2026-02-30'}]]) {
        assert.throws(()=>parseHistoricalIndexFx(mutate(rawFx()),'2026-10-05','2026-10-06',now));
    }
});
test('new historical FX route pins ECB, caches across users and rejects bad requests or upstream data',async()=>{
    let calls=0;
    const route=createHistoricalIndexFxRoute({clock:()=>now,fetcher:async url=>{
        calls++;assert.match(url,/providers=ecb/);assert.match(url,/base=USD/);assert.match(url,/quotes=SEK/);
        return {ok:true,json:async()=>rawFx()};
    }});
    const url=new URL('https://x/functions/v1/market-api/api/index-fx-history?start=2026-10-05&end=2026-10-06');
    const [a,b]=await Promise.all([route(url),route(url)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(calls,1);
    await route(url);assert.equal(calls,1);
    assert.equal((await route(new URL('https://x/api/index-fx-history?start=2026-02-30&end=2026-10-06'))).status,400);
    assert.equal((await route(new URL(`https://x/api/index-fx-history?start=2026-10-05&end=${today}`))).status,400);
    const bad=createHistoricalIndexFxRoute({clock:()=>now,fetcher:async()=>({ok:true,json:async()=>[]})});
    assert.equal((await bad(url)).status,502);
    const shared=createMarketQuoteRoutes({clock:()=>now,fetcher:async()=>({ok:true,json:async()=>rawFx()})});
    assert.equal((await shared(url)).body.apiVersion,INDEX_FX_VERSION);
});
test('main chart renders two percentage series, estimation and different distribution bases without claiming excess return',async()=>{
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{ssr:'src/components/PortfolioSummary.jsx',write:false,minify:false}});
    const code=bundle.output.find(item=>item.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Summary}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const p={...performance(),method:'DAILY_MODIFIED_DIETZ',methodLabel:'Daglig Modified Dietz · uppskattad',quality:'estimated'};
    const render=(extra={})=>renderToStaticMarkup(createElement(Summary,{portfolioValue:2000,investedCapital:1000,history:{points:[]},
        portfolioReturns:p,benchmarks:{OMXS30:benchmark()},initialIndex:'OMXS30',initialPeriod:'1M',today,now,...extra}));
    const markup=render();assert.match(markup,/portfolio-index-line/);assert.match(markup,/Gemensam period 2026-10-05/);
    assert.match(markup,/uppskattad/);assert.match(markup,/olika utdelningsbas/);assert.doesNotMatch(markup,/procentenheter/);
    assert.match(markup,/basdatum 2026-10-05/);assert.match(render({initialIndex:''}),/Portföljavkastning i SEK/);
});

test('prepared trade form shows three basic fields, inferred currency, historical date and explicit unknown fees',async()=>{
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{ssr:'src/components/LedgerTradeForm.jsx',write:false,minify:false}});
    const code=bundle.output.find(item=>item.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Form}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const markup=renderToStaticMarkup(createElement(Form,{position:{name:'Stock',accountId:'a',instrumentId:'stock',currency:'USD'},today,onReview:()=>{}}));
    assert.match(markup,/Pris per enhet \(USD\)/);assert.match(markup,/<input type="date"[^>]*value="2026-10-10"/);
    assert.match(markup,/<summary>Avancerat/);assert.match(markup,/avgiften är okänd/);assert.match(markup,/Befintlig kassa/);
    assert.doesNotMatch(markup,/Valutakurs|GAV/);
});
