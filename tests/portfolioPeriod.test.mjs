import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioPeriod, compareVerifiedBenchmark, nearestHistoryPoint, PORTFOLIO_PERIODS } from '../src/utils/portfolioPeriod.js';

const today = '2026-10-08';
const now = Date.parse('2026-10-08T22:00:00Z');
const history = [{ date: '2026-10-04', valueSek: 100000 }, { date: today, valueSek: 125000 }];
const build = (options = {}) => buildPortfolioPeriod({ points: history, today, now, ...options });

test('all seven controls use actual observations and do not mutate history', () => {
    assert.deepEqual(PORTFOLIO_PERIODS.map(p => p.label), ['1D', '1V', '1M', '3M', 'i år', '1Å', 'ALL']);
    const before = structuredClone(history);
    const view = build();
    assert.equal(view.available, true);
    assert.deepEqual(view.points, history);
    assert.equal(view.changeSek, 25000);
    assert.equal(view.changePercent, 25);
    assert.deepEqual(history, before);
    assert.equal(view.comparison.available, false, 'value increase cannot prove investment return');
});

test('insufficient periods never silently show ALL or fabricate anchors', () => {
    for (const period of ['1D', '1V', '1M', '3M', 'YTD', '1Å']) {
        const view = build({ period });
        assert.equal(view.available, false, period);
        assert.deepEqual(view.points, []);
        assert.equal(view.changeSek, null);
        assert.equal(view.changePercent, null);
        assert.equal(view.latestObservation.date, today);
    }
});

test('period anchors cannot shorten a calendar period, and a valid earlier anchor wins', () => {
    const points = [{ date: '2026-09-30', valueSek: 90 }, { date: '2026-10-02', valueSek: 95 }, ...history];
    const view = build({ points, period: '1V' });
    assert.equal(view.first.date, '2026-09-30');
    assert.equal(view.changeSek, 124910);
    assert.equal(view.last.date, today);
});

test('1D requires today and yesterday and uses their identical graph/metric endpoints', () => {
    const points = [...history, { date: '2026-10-07', valueSek: 120000 }];
    const view = build({ points, period: '1D' });
    assert.equal(view.available, true);
    assert.deepEqual(view.points.map(p => p.date), ['2026-10-07', today]);
    assert.equal(view.changeSek, view.last.valueSek - view.first.valueSek);
    assert.equal(build({ points: points.slice(0, 1), period: '1D' }).available, false);
});

test('3M respects month-end calendar boundaries and one actual anchor', () => {
    const points = [{ date: '2026-05-01', valueSek: 70 }, { date: '2026-06-30', valueSek: 100 }, { date: '2026-09-30', valueSek: 90 }];
    const view = build({ points, period: '3M', today: '2026-09-30' });
    assert.equal(view.available, true);
    assert.equal(view.first.date, '2026-06-30');
    assert.equal(view.changeSek, -10);
    assert.equal(view.changePercent, -10);
});

test('reject future, conflicting, impossible and invalid history without inserting data', () => {
    const view = build({ points: [...history,
        { date: '2026-10-09', valueSek: 10 }, { date: '2026-02-30', valueSek: 10 },
        { date: '2026-10-06', valueSek: 10 }, { date: '2026-10-06', valueSek: 20 },
        { date: '2026-10-05', valueSek: NaN }, { date: '2026-10-03', valueSek: '100' },
        { date: '2026-10-02', valueSek: -1 }] });
    assert.deepEqual(view.points, history);
});

test('zero starting value has no fabricated percentage; empty and single point stay unavailable', () => {
    assert.equal(build({ points: [{ date: '2026-10-04', valueSek: 0 }, history[1]] }).changePercent, null);
    assert.equal(build({ points: [] }).available, false);
    assert.equal(build({ points: [history[1]] }).available, false);
});

function returns(last, extra = {}) {
    return { verified: true, source: 'test verified source', currency: 'SEK', cadence: 'daily_close', returnBasis: 'gross_total_return',
        points: history.map((p, i) => ({ date: p.date, value: i ? last : 100, asOf: `${p.date}T15:30:00Z` })), ...extra };
}
const portfolio = () => returns(110, { method: 'TWR', cashFlowCoverage: 'complete' });
const benchmark = () => returns(105, { id: 'OMXS30' });
const compare = (p = portfolio(), b = benchmark()) => compareVerifiedBenchmark(history, p, b, now);

test('only verified cash-flow-neutral return series can show comparable index/excess lines', () => {
    const view = compare();
    assert.equal(view.available, true);
    assert.ok(Math.abs(view.portfolioPercent - 10) < 1e-10);
    assert.ok(Math.abs(view.benchmarkPercent - 5) < 1e-10);
    assert.ok(Math.abs(view.excessPercentagePoints - 5) < 1e-10);
    assert.equal(view.series[0].value, 0);
    assert.equal(view.series[0].benchmark, 0);
    assert.equal(compare(portfolio(), returns(120, { id: 'SIXRX' })).excessPercentagePoints < 0, true);
    const period = build({ portfolioReturns: portfolio(), benchmark: benchmark() });
    assert.equal(period.changePercent, 25, 'deposits remain in value change, not TWR');
    assert.ok(Math.abs(period.comparison.portfolioPercent - 10) < 1e-10);
});

test('reject incomplete flows, unverified returns, mixed currencies and distribution bases', () => {
    for (const override of [{ method: 'value_change' }, { cashFlowCoverage: 'partial' }, { verified: false },
        { source: '' }, { currency: 'USD' }, { cadence: 'intraday' }]) {
        assert.equal(compare({ ...portfolio(), ...override }).available, false);
    }
    for (const override of [{ verified: false }, { currency: 'USD' }, { returnBasis: 'price_return' }, { id: 'UNKNOWN' }]) {
        assert.equal(compare(portfolio(), { ...benchmark(), ...override }).available, false);
    }
});

test('index dates and source times must match exactly; no interpolation or fabricated FX', () => {
    for (const change of [p => p.slice(1), p => p.toReversed(),
        p => [p[0], { ...p[1], asOf: '2026-10-08T16:00:00Z' }],
        p => [p[0], { ...p[1], asOf: '2026-10-09T15:30:00Z' }],
        p => [p[0], { ...p[1], asOf: today }],
        p => [p[0], { ...p[1], value: 0 }]]) {
        const index = benchmark();
        index.points = change(index.points);
        assert.equal(compare(portfolio(), index).available, false);
    }
});

test('hover/touch/keyboard snap to real observations across gaps, never intermediate prices', () => {
    assert.equal(nearestHistoryPoint(history, 0).date, '2026-10-04');
    assert.equal(nearestHistoryPoint(history, 0.9).date, today);
    assert.equal(nearestHistoryPoint(history, 3).date, today);
    assert.equal(nearestHistoryPoint(history, -1).date, '2026-10-04');
    assert.equal(nearestHistoryPoint([], 0.5), null);
});
