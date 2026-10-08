import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLiveValuation, livePortfolioPoint, mergeLiveHistory, buildPortfolioPeriod, availableBenchmarkIds } from '../src/utils/portfolioPeriod.js';
import { quoteValuationKey } from '../src/utils/valuationFreshness.js';

const now = Date.parse('2026-10-08T12:00:00Z'), today = '2026-10-08';
const history = [{ date:'2026-10-01',valueSek:1000 }, { date:today,valueSek:1100 }];
function inputs(overrides = {}) {
    const holding = { id:'h',name:'Investor B',market:'XSTO',assetType:'STOCK',platform:'Avanza',currency:'SEK',
        quantity:10,currentPrice:120,currentValueSek:1200,priceUpdatedAt:now - 60_000 };
    return { userId:'u',holdings:[holding],checks:{ h:{userId:'u',success:true,checkedAt:now-500,
        valueKey:quoteValuationKey(holding), ...overrides} } };
}
const publication = { userId:'u',observedAt:now-100 };
function live(valueSek = 1200, options = {}) {
    return livePortfolioPoint({publication,verified:true,userId:'u',valueSek,today,now,...options});
}

test('a live endpoint needs an actual published batch and the same strict valuation checks as history', () => {
    const evaluation = evaluateLiveValuation({publication,inputs:inputs(),ready:true},now);
    assert.equal(evaluation.verified,true);
    const point = livePortfolioPoint({...evaluation,valueSek:1200,today,now});
    assert.equal(point.observedAt,publication.observedAt);
    assert.notEqual(point.observedAt,inputs().holdings[0].priceUpdatedAt,'completion time never replaces quote source time');
    for (const overrides of [{success:false},{userId:'other'},{valueKey:'edited'},{checkedAt:now-21*60_000}]) {
        const failed = evaluateLiveValuation({publication,inputs:inputs(overrides),ready:true},now);
        assert.equal(livePortfolioPoint({...failed,valueSek:1200,today,now}),null);
    }
    assert.equal(live(1200,{publication:null}),null);
    assert.equal(live(1200,{userId:'another-user'}),null);
    assert.equal(live(1200,{verified:false}),null);
    assert.equal(live(1200,{publication:{...publication,observedAt:now+1}}),null);
    assert.equal(live(1200,{now:now+21*60_000}),null);
    assert.equal(live(1200,{today:'2026-10-09'}),null);
    assert.equal(live(NaN),null);
});

test('today is a single live endpoint, and subsequent snapshot rereads cannot make it jump', () => {
    const before = structuredClone(history);
    const point = live();
    const view = buildPortfolioPeriod({points:history,livePoint:point,period:'1V',today,now});
    assert.equal(view.available,true);
    assert.equal(view.points.length,2);
    assert.equal(view.last.valueSek,1200);
    assert.equal(view.last.live,true);
    assert.equal(view.changeSek,200);
    const reread = buildPortfolioPeriod({points:[history[0],{date:today,valueSek:1150}],livePoint:point,period:'1V',today,now});
    assert.deepEqual(reread.points,view.points);
    assert.equal(reread.changeSek,view.changeSek);
    assert.deepEqual(history,before,'original snapshots must never be edited');
    assert.equal(mergeLiveHistory(history,live(1250),today).filter(p=>p.date===today).length,1);
    assert.equal(mergeLiveHistory(history,null,today).at(-1).valueSek,1100,'failed refresh retains actual saved history');
});

test('append today without waiting for a snapshot, but never manufacture a start point or intraday curve', () => {
    const past = [{date:'2026-10-01',valueSek:1000}];
    const view = buildPortfolioPeriod({points:past,livePoint:live(),period:'1V',today,now});
    assert.deepEqual(view.points.map(p=>p.date),['2026-10-01',today]);
    assert.deepEqual(past,[{date:'2026-10-01',valueSek:1000}]);
    const loneLive = buildPortfolioPeriod({points:[],livePoint:live(),today,now});
    assert.equal(loneLive.available,true);
    assert.equal(loneLive.points.length,1);
    assert.equal(loneLive.periodCovered,false);
    const daily = buildPortfolioPeriod({points:[],period:'1D',livePoint:live(),today,now,
        dailyChange:{complete:true,changeSek:75,changePercent:6.67}});
    assert.equal(daily.dailyAvailable,true);
    assert.equal(daily.changeSek,75);
    assert.deepEqual(daily.points,[]);
    assert.equal(daily.available,false);
    assert.equal(buildPortfolioPeriod({points:history,period:'1D',today,now,
        dailyChange:{complete:false,changeSek:75,changePercent:6.67}}).changeSek,null);
});

test('no connected index source means no active choice; stale close series cannot be compared to live value', () => {
    assert.deepEqual(availableBenchmarkIds({},now),[]);
    const data = {id:'OMXS30',verified:true,source:'trusted adapter',currency:'SEK',cadence:'daily_close',returnBasis:'price_return',
        points:[{date:'2026-10-01',value:100,asOf:'2026-10-01T10:00:00Z'},{date:today,value:101,asOf:'2026-10-08T10:00:00Z'}]};
    assert.deepEqual(availableBenchmarkIds({OMXS30:data},now),['OMXS30']);
    assert.deepEqual(availableBenchmarkIds({OMXS30:{...data,verified:false}},now),[]);
    assert.deepEqual(availableBenchmarkIds({OMXS30:{...data,currency:'USD'}},now),[]);
    assert.deepEqual(availableBenchmarkIds({OMXS30:{...data,points:[data.points[0],{...data.points[1],asOf:'2026-10-08T14:00:00Z'}]}},now),[]);
    const view = buildPortfolioPeriod({points:history,livePoint:live(),today,now,benchmark:data,
        portfolioReturns:{...data,method:'TWR',cashFlowCoverage:'complete'}});
    assert.equal(view.comparison.available,false,'a daily close is not a verified intraday comparison');
    assert.match(view.comparison.reason,/liveindexdata/);
});
