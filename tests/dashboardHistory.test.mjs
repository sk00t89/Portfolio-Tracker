import test from "node:test";
import assert from "node:assert/strict";
import { calculateDailyMovers, availableHistoryPeriods, createValueSeries, stockholmDate, quoteDate } from "../src/utils/dashboardHistory.js";

const today = "2026-10-04";
const position = (overrides = {}) => ({ name: "Investor B", isin: "SE000INVESTOR",
    quantity: 100, currentPrice: 110, previousClose: 100, currentValueSek: 11000,
    priceUpdatedAt: Date.parse(`${today}T12:00:00Z`), ...overrides });

test("SEK impact outranks percentage and combines all accounts", () => {
    const result = calculateDailyMovers([
        position({ currentValueSek: 88000, platform: "Avanza" }),
        position({ currentValueSek: 88000, platform: "Nordnet" }),
        position({ name: "AVAX", isin: "AVAX", currentPrice: 150, previousClose: 100, currentValueSek: 6000 }),
    ], today);
    assert.equal(result.best[0].name, "Investor B");
    assert.equal(result.best[0].changeSek, 16000);
    assert.ok(Math.abs(result.best[0].changePercent - 10) < 1e-9);
    assert.equal(result.best[0].positions.length, 2);
    assert.equal(result.best[1].changeSek, 2000);
    assert.equal(result.best[1].changePercent, 50);
});

test("percentage is weighted by previous SEK value", () => {
    const result = calculateDailyMovers([position(), position({ currentPrice: 120, currentValueSek: 24000 })], today);
    assert.ok(Math.abs(result.best[0].changePercent - 100 / 6) < 1e-9);
    assert.equal(result.best[0].changeSek, 5000);
});

test("worst is sorted by negative SEK contribution", () => {
    const result = calculateDailyMovers([position({ isin: "A", currentPrice: 90, currentValueSek: 9000 }),
        position({ isin: "B", currentPrice: 50, currentValueSek: 500 })], today);
    assert.deepEqual(result.worst.map((item) => item.changeSek), [-1000, -500]);
    assert.equal(result.best.length, 0);
});

test("missing or stale quotes exclude the whole instrument", () => {
    for (const invalid of [{ previousClose: null }, { previousClose: 0 }, { currentValueSek: null },
        { priceUpdatedAt: Date.parse("2026-10-03T12:00:00Z") }, { quantity: 0 }]) {
        const result = calculateDailyMovers([position(), position(invalid)], today);
        assert.equal(result.best.length, 0);
        assert.equal(result.excluded, 1);
    }
});

test("case and whitespace identifiers group across platforms", () => {
    const result = calculateDailyMovers([position({ isin: "abc" }), position({ isin: " ABC " })], today);
    assert.equal(result.best.length, 1);
});

test("a missing ISIN bridges through a unique ticker, without merging conflicting ISINs", () => {
    const result = calculateDailyMovers([position({ ticker: "INVE-B" }),
        position({ isin: null, ticker: "inve-b" })], today);
    assert.equal(result.best.length, 1);
    assert.equal(result.best[0].positions.length, 2);
    const ambiguous = calculateDailyMovers([position({ isin: "A", ticker: "SAME" }),
        position({ isin: "B", ticker: "SAME" }), position({ isin: null, ticker: "SAME" })], today);
    assert.equal(ambiguous.best.length, 3);
});

test("no history and one day expose no periods", () => {
    assert.deepEqual(availableHistoryPeriods([], today), []);
    assert.deepEqual(availableHistoryPeriods([{ date: today, valueSek: 1 }], today), []);
});

test("only fully covered periods are available", () => {
    const points = ["2026-09-27", "2026-10-03", today].map((date) => ({ date, valueSek: 100 }));
    assert.deepEqual(availableHistoryPeriods(points, today), ["1V", "All"]);
    const years = ["2025-10-04", "2026-01-01", "2026-09-04", "2026-09-27", today].map((date) => ({ date, valueSek: 100 }));
    assert.deepEqual(availableHistoryPeriods(years, today), ["1V", "1M", "YTD", "1Å", "All"]);
});

test("calendar month and leap year boundaries", () => {
    const points = ["2026-02-28", "2026-03-30", "2026-03-31"].map((date) => ({ date, valueSek: 1 }));
    assert.ok(availableHistoryPeriods(points, "2026-03-31").includes("1M"));
    assert.ok(availableHistoryPeriods([{ date: "2023-02-28" }, { date: "2024-02-28" }, { date: "2024-02-29" }], "2024-02-29").includes("1Å"));
});

test("series preserves real gaps and SEK values", () => {
    const series = createValueSeries([{ date: "2026-09-26", valueSek: 20 },
        { date: "2026-09-28", valueSek: 50 }, { date: today, valueSek: 90 }], "1V", today);
    assert.deepEqual(series.points, [{ date: "2026-09-26", value: 20 }, { date: "2026-09-28", value: 50 }, { date: today, value: 90 }]);
    assert.equal(series.currency, "SEK");
});

test("two recent points and an old point do not cover the period start", () => {
    const points = ["2025-01-01", "2026-10-03", today].map((date) => ({ date, valueSek: 100 }));
    assert.deepEqual(availableHistoryPeriods(points, today), ["All"]);
    assert.deepEqual(createValueSeries(points, "1V", today).points, []);
});

test("start anchor permits three calendar days on either side, not four", () => {
    for (const [anchor, allowed] of [["2026-09-24", true], ["2026-09-23", false],
        ["2026-09-28", true], ["2026-09-30", true], ["2026-10-01", false]]) {
        const points = [anchor, "2026-10-03", today].map((date) => ({ date, valueSek: 100 }));
        assert.equal(availableHistoryPeriods(points, today).includes("1V"), allowed);
        if (allowed) assert.equal(createValueSeries(points, "1V", today).points[0].date, anchor);
    }
});

test("YTD can use January 2 as its actual start and comparison base", () => {
    const points = [{ date: "2026-01-02", valueSek: 100 }, { date: today, valueSek: 150 }];
    assert.ok(availableHistoryPeriods(points, today).includes("YTD"));
    const series = createValueSeries(points, "YTD", today);
    assert.deepEqual(series.points, [{ date: "2026-01-02", value: 100 }, { date: today, value: 150 }]);
    assert.equal(series.points.at(-1).value - series.points[0].value, 50);
    assert.equal((series.points.at(-1).value / series.points[0].value - 1) * 100, 50);
});

test("the nearest point wins across the start, even when input is unsorted", () => {
    for (const [before, after, expected] of [["2026-09-25", "2026-09-28", "2026-09-28"],
        ["2026-09-26", "2026-09-29", "2026-09-26"], ["2026-09-26", "2026-09-28", "2026-09-26"]]) {
        const points = [today, after, before].map((date, index) => ({ date, valueSek: 100 + index }));
        const series = createValueSeries(points, "1V", today);
        assert.equal(series.points[0].date, expected);
        assert.equal(new Set(series.points.map((point) => point.date)).size, series.points.length);
        assert.ok(series.points.every((point) => point.date >= expected));
        assert.ok(availableHistoryPeriods(points, today).includes("1V"));
    }
});

test("an exact start date wins over both nearby alternatives", () => {
    const points = ["2026-09-26", "2026-09-27", "2026-09-28", today].map((date) => ({ date, valueSek: 100 }));
    assert.equal(createValueSeries(points, "1V", today).points[0].date, "2026-09-27");
});

test("all fixed periods support a start point one day after theoretical start", () => {
    for (const [period, start] of [["1V", "2026-09-28"], ["1M", "2026-09-05"],
        ["YTD", "2026-01-02"], ["1Å", "2025-10-05"]]) {
        const points = [{ date: start, valueSek: 100 }, { date: today, valueSek: 120 }];
        assert.ok(availableHistoryPeriods(points, today).includes(period));
        assert.equal(createValueSeries(points, period, today).points[0].date, start);
    }
});

test("a lone eligible anchor cannot serve as both start and end", () => {
    const points = [{ date: "2025-01-01", valueSek: 100 }, { date: "2026-01-02", valueSek: 120 }];
    assert.ok(!availableHistoryPeriods(points, "2026-01-02").includes("YTD"));
    assert.deepEqual(createValueSeries(points, "YTD", "2026-01-02").points, []);
});

test("latest point must be today or yesterday; future points cannot satisfy coverage", () => {
    for (const [end, allowed] of [["2026-10-03", true], ["2026-10-02", false], ["2026-10-05", false]]) {
        const points = [{ date: "2026-09-27", valueSek: 100 }, { date: end, valueSek: 150 }];
        assert.equal(availableHistoryPeriods(points, today).includes("1V"), allowed);
    }
});

test("YTD uses the valid pre-January-1 anchor consistently", () => {
    const points = [{ date: "2025-12-31", valueSek: 100 }, { date: "2026-01-03", valueSek: 110 }, { date: today, valueSek: 150 }];
    assert.ok(availableHistoryPeriods(points, today).includes("YTD"));
    assert.equal(createValueSeries(points, "YTD", today).points[0].value, 100);
});

test("daily dates use Stockholm and accept seconds/milliseconds", () => {
    assert.equal(stockholmDate("2026-10-03T22:30:00Z"), today);
    assert.equal(quoteDate(Date.parse("2026-10-03T22:30:00Z") / 1000), today);
    assert.equal(quoteDate(Date.parse("2026-10-03T22:30:00Z")), today);
    assert.equal(quoteDate(null), null);
});
