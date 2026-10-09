import test from 'node:test';
import assert from 'node:assert/strict';
import { INDEXES, createIndexHistoryRoute, parseIndexHistory, indexPeriodStart } from '../supabase/functions/_shared/indexHistory.js';
import { validateIndexResponse, standaloneIndexView, fetchIndexHistory } from '../src/services/indexHistory.js';
import { createMarketQuoteMiddleware } from '../server/marketQuoteMiddleware.js';
import { createMarketApiFetch } from '../src/services/marketApiFetch.js';
const now = Date.parse('2026-10-09T14:00:00Z');
function fixture(id = 'OMXS30') {
    const c = INDEXES[id];
    return {chart:{result:[{meta:{symbol:c.symbol,currency:c.currency,exchangeTimezoneName:c.zone,
        exchangeName:c.exchange,instrumentType:'INDEX',dataGranularity:'1d'},
        timestamp:['2026-10-05T14:00:00Z','2026-10-06T14:00:00Z','2026-10-08T14:00:00Z','2026-10-09T13:00:00Z','2026-10-12T14:00:00Z'].map(x=>Date.parse(x)/1000),
        indicators:{quote:[{close:[100,105,110,111,120]}]}}]}};
}
test('both indices retain identity, native currency, local dates and real bar timestamps; unfinished and future bars excluded', () => {
    for (const id of Object.keys(INDEXES)) {
        const data = parseIndexHistory(fixture(id),id,'1V',now);
        assert.equal(data.currency,INDEXES[id].currency);
        assert.deepEqual(data.points.map(x=>x.date),['2026-10-05','2026-10-06','2026-10-08']);
        assert.equal(validateIndexResponse(data,id,'1V',now),data);
        const view = standaloneIndexView(data);
        assert.equal(view.points[0].valueSek,0);
        assert.ok(Math.abs(view.last.valueSek-10)<1e-9);
        assert.equal(view.comparison.available,false);
        assert.equal(data.points[0].value,100);
    }
});
test('wrong identity, currency, timezone, type, interval or venue fail closed', () => {
    for (const [field,value] of Object.entries({symbol:'^OTHER',currency:'EUR',exchangeTimezoneName:'UTC',instrumentType:'ETF',dataGranularity:'1h',exchangeName:'NYQ'})) {
        const f = fixture(); f.chart.result[0].meta[field]=value;
        assert.throws(()=>parseIndexHistory(f,'OMXS30','1V',now),/INDEX_IDENTITY_MISMATCH/);
    }
});
test('missing closes remain missing; invalid prices and conflicting observations are rejected', () => {
    const f = fixture(); f.chart.result[0].indicators.quote[0].close[1]=null;
    const data = parseIndexHistory(f,'OMXS30','1V',now);
    assert.equal(data.missing,1); assert.equal(data.points.length,2);
    for (const value of [0,-1,'100',Infinity]) {
        const bad=fixture(); bad.chart.result[0].indicators.quote[0].close[0]=value;
        assert.throws(()=>parseIndexHistory(bad,'OMXS30','1V',now),/INDEX_INVALID_DATA/);
    }
    const bad=fixture(); bad.chart.result[0].timestamp[1]=bad.chart.result[0].timestamp[0];
    assert.throws(()=>parseIndexHistory(bad,'OMXS30','1V',now),/INDEX_INVALID_DATA/);
});
test('period boundaries clamp leap dates, ALL is ten years and 1D is unsupported', () => {
    assert.equal(indexPeriodStart('All','2026-10-09'),'2016-10-09');
    assert.equal(indexPeriodStart('1Å','2024-02-29'),'2023-02-28');
    assert.equal(indexPeriodStart('1M','2026-03-31'),'2026-02-28');
    assert.equal(indexPeriodStart('YTD','2026-10-09'),'2026-01-01');
    assert.throws(()=>indexPeriodStart('1D','2026-10-09'));
});
test('local market dates work across midnight and DST without using Stockholm for US bars', () => {
    const f=fixture('SP500'); f.chart.result[0].timestamp=[Date.parse('2026-10-08T23:30:00Z')/1000];
    f.chart.result[0].indicators.quote[0].close=[100];
    const data=parseIndexHistory(f,'SP500','1V',Date.parse('2026-10-09T05:00:00Z'));
    assert.equal(data.points[0].date,'2026-10-08');
    const winter=fixture('SP500'); winter.chart.result[0].timestamp=[Date.parse('2026-11-02T14:30:00Z')/1000];
    winter.chart.result[0].indicators.quote[0].close=[100];
    assert.equal(parseIndexHistory(winter,'SP500','1V',Date.parse('2026-11-03T05:00:00Z')).points[0].date,'2026-11-02');
});
test('shared route handles provider failure, invalid JSON and unsupported choices without invented data', async () => {
    const url=new URL('https://example.com/functions/v1/market-api/api/index-history?id=OMXS30&period=1V');
    for (const fetcher of [async()=>{throw new Error('secret');},async()=>new Response('no',{status:429}),async()=>new Response('bad json')]) {
        const result=await createIndexHistoryRoute({fetcher,clock:()=>now})(url);
        assert.equal(result.status,502); assert.equal(result.body.points,undefined); assert.doesNotMatch(JSON.stringify(result),/secret/);
    }
    let calls=0;
    const route=createIndexHistoryRoute({fetcher:async()=>{calls++;return Response.json(fixture());},clock:()=>now});
    assert.equal((await route(url)).status,200);
    assert.equal((await route(new URL('https://x/api/index-history?id=SIXRX&period=All'))).status,400);
    assert.equal((await route(new URL('https://x/api/index-history?id=OMXS30&period=1D'))).status,400);
    assert.equal(calls,1);
});
test('Express delegates to the same index adapter used by Supabase', async () => {
    const middleware=createMarketQuoteMiddleware({fetcher:async()=>Response.json(fixture()),clock:()=>now});
    let status,body;
    const response={status(value){status=value;return this;},json(value){body=value;return this;}};
    await middleware({method:'GET',originalUrl:'/api/index-history?id=OMXS30&period=1V'},response,()=>assert.fail('unexpected next'));
    assert.equal(status,200);assert.equal(body.id,'OMXS30');
});
test('client rejects wrong period and future observations, reports HTTP errors and passes cancellation', async () => {
    const data=parseIndexHistory(fixture(),'OMXS30','1V',now);
    assert.throws(()=>validateIndexResponse({...data,period:'All'},'OMXS30','1V',now));
    assert.throws(()=>validateIndexResponse({...data,points:[{date:'2026-10-12',value:100,barTimestamp:'2026-10-12T14:00:00Z'}]},'OMXS30','1V',now));
    const controller=new AbortController();
    await assert.rejects(fetchIndexHistory(async(path,options)=>{
        assert.equal(options.signal,controller.signal);assert.match(path,/id=OMXS30/);
        throw Object.assign(new Error('failed'),{httpStatus:502});
    },'OMXS30','1V',controller.signal),/HTTP 502/);
});

test('index diagnostics survive shared authenticated API and provide actionable errors', async () => {
    for (const [status,code,expected] of [[502,'INDEX_IDENTITY_MISMATCH',/indexidentitet/],
        [502,'INDEX_INVALID_DATA',/ogiltiga historiska/],[502,'INDEX_DATA_UNAVAILABLE',/saknar slutkurser/],
        [404,undefined,/driftsättas/]]) {
        const api=createMarketApiFetch({baseUrl:'https://example.com',apiKey:'key',getSession:async()=>({data:{session:null}}),
            fetcher:async()=>Response.json({code},{status})});
        await assert.rejects(fetchIndexHistory(api,'OMXS30','1V',new AbortController().signal),expected);
    }
});

test('a historical day is accepted only on the next local day, including after-close hours', () => {
    const f=fixture();f.chart.result[0].timestamp=[Date.parse('2026-10-08T07:00:00Z')/1000];
    f.chart.result[0].indicators.quote[0].close=[100];
    assert.throws(()=>parseIndexHistory(f,'OMXS30','1V',Date.parse('2026-10-08T21:59:00Z')),/INDEX_DATA_UNAVAILABLE/);
    assert.equal(parseIndexHistory(f,'OMXS30','1V',Date.parse('2026-10-08T22:01:00Z')).points.length,1);
});
