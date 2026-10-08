import test from "node:test";
import assert from "node:assert/strict";
import { getVerifiedHoldingQuote } from "../src/services/verifiedHoldingQuote.js";
import { hasCompleteDailyQuote } from "../src/utils/dailyQuote.js";
import { calculateDailyMovers } from "../src/utils/dashboardHistory.js";
import { quoteFreshnessReason } from "../src/utils/valuationFreshness.js";

const now = Date.parse("2026-10-08T12:00:00Z");
const holding = { id: "a", name: "A", provider: "Avanza", instrumentId: "1", isin: "SE-A", ticker: "A",
    market: "XSTO", assetType: "STOCK", currency: "SEK", quantity: 10 };
const quote = { instrumentId: "1", isin: "SE-A", price: 110, previousClose: 100, currency: "SEK", timestamp: now };
const position = (q) => ({ ...holding, currentPrice: q.price, previousClose: q.previousClose,
    priceUpdatedAt: q.timestamp, currentValueSek: 10 * q.price });

test("complete primary quote stops fallback; missing close continues without borrowing old fields", async () => {
    const providers = { getAvanzaPriceByInstrumentId: async () => quote,
        getNordnetPriceByIsin: async () => { assert.fail("complete primary should stop"); } };
    assert.equal((await getVerifiedHoldingQuote(holding, providers, () => now)).previousClose, 100);
    const trace = [];
    const incomplete = { ...quote, previousClose: null };
    const result = await getVerifiedHoldingQuote({ ...holding, previousClose: 50 }, {
        getAvanzaPriceByInstrumentId: async () => incomplete,
        getNordnetPriceByIsin: async () => { trace.push("fallback"); return { ...quote, isin: "OTHER" }; },
        getYahooPrice: async () => { throw new Error("offline"); },
    }, () => now);
    assert.deepEqual(trace, ["fallback"]);
    assert.equal(result.previousClose, null);
    assert.equal(result.timestamp, now);
    assert.equal(quoteFreshnessReason(position(result), now), null);
    assert.equal(calculateDailyMovers([position(result)], now).excluded, 1);
});

test("old, future, pre-open, missing and malformed source times cannot appear as today's movement", () => {
    for (const timestamp of [null, "bad", "2026-10-08T12:00:00", now + 1000,
        now - 31 * 60_000, Date.parse("2026-10-07T15:30:00Z"), Date.parse("2026-10-08T06:30:00Z")]) {
        assert.equal(hasCompleteDailyQuote(holding, { ...quote, timestamp }, now), false, String(timestamp));
    }
    for (const previousClose of [null, 0, -1, Infinity, "bad"]) {
        assert.equal(hasCompleteDailyQuote(holding, { ...quote, previousClose }, now), false);
    }
    assert.equal(hasCompleteDailyQuote(holding, { ...quote, timestamp: now / 1000 }, now), true);
    assert.equal(hasCompleteDailyQuote(holding, { ...quote, timestamp: new Date(now).toISOString() }, now), true);
});

test("last US session remains a valid valuation before opening but is not today's movement", () => {
    const us = { ...holding, market: "XNAS", currency: "USD" };
    const prior = { ...quote, timestamp: Date.parse("2026-10-07T20:00:00Z") };
    assert.equal(quoteFreshnessReason({ ...us, priceUpdatedAt: prior.timestamp }, now), null);
    assert.equal(hasCompleteDailyQuote(us, prior, now), false);
    const evening = Date.parse("2026-10-08T21:00:00Z");
    assert.equal(hasCompleteDailyQuote(us, { ...quote, timestamp: Date.parse("2026-10-08T20:02:00Z") }, evening), true);
    assert.equal(hasCompleteDailyQuote(us, { ...quote, timestamp: Date.parse("2026-10-08T20:20:00Z") }, evening), false);
});

test("weekend/holiday valuations, undated NAV comparisons and unknown markets are excluded", () => {
    const weekend = Date.parse("2026-10-10T12:00:00Z");
    const friday = Date.parse("2026-10-09T15:30:00Z");
    assert.equal(quoteFreshnessReason({ ...holding, priceUpdatedAt: friday }, weekend), null);
    assert.equal(hasCompleteDailyQuote(holding, { ...quote, timestamp: friday }, weekend), false);
    const holiday = Date.parse("2026-05-14T12:00:00Z");
    const halfClose = Date.parse("2026-05-13T11:00:00Z");
    assert.equal(quoteFreshnessReason({ ...holding, priceUpdatedAt: halfClose }, holiday), null);
    assert.equal(hasCompleteDailyQuote(holding, { ...quote, timestamp: halfClose }, holiday), false);
    assert.equal(hasCompleteDailyQuote({ ...holding, assetType: "FUND", market: "FUND" }, quote, now), false);
    assert.equal(hasCompleteDailyQuote({ ...holding, market: "UNKNOWN" }, quote, now), false);
});

test("one incomplete account excludes the entire instrument without affecting other instruments", () => {
    const good = position(quote);
    const result = calculateDailyMovers([good, { ...good, id: "b", previousClose: null },
        { ...good, id: "c", isin: "SE-C", name: "C" }], now);
    assert.equal(result.excluded, 1);
    assert.deepEqual(result.best.map((item) => item.name), ["C"]);
});
