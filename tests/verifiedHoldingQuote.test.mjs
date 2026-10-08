import test from "node:test";
import assert from "node:assert/strict";
import { getVerifiedHoldingQuote } from "../src/services/verifiedHoldingQuote.js";
import { fetchAvanzaQuote } from "../server/avanzaQuote.js";
import { normalizeQuoteTimestamp, quoteFreshnessReason, quoteValuationKey, validateValuationFreshness } from "../src/utils/valuationFreshness.js";
import { appHoldingToDatabase, databaseHoldingToApp } from "../src/utils/holdingDatabaseMapper.js";
import { writeVerifiedHistory } from "../src/utils/verifiedHistoryWrite.js";

const now = Date.parse("2026-10-08T12:00:00Z"); // Before US opening: Wednesday close is relevant.
const close = Date.parse("2026-10-07T20:00:00Z");
const holding = { id: "abcl", name: "AbCellera", ticker: "ABCL", isin: "CA00288U1066", market: "XNAS",
    assetType: "STOCK", currency: "USD", provider: "Avanza", instrumentId: "42", quantity: 10 };
const valid = { price: 4, currency: "USD", timestamp: close, instrumentId: "42", isin: holding.isin };
const yahoo = { ...valid, symbol: "ABCL", exchangeName: "NMS" };

test("AbCellera falls back past missing, invalid, future and stale source times without mixing prices", async () => {
    for (const timestamp of [undefined, null, "bad", now + 360000, close - 86400000]) {
        const calls = [];
        const quote = await getVerifiedHoldingQuote(holding, {
            getAvanzaPriceByInstrumentId: async () => { calls.push("avanza-id"); return { ...valid, price: 999, timestamp }; },
            getAvanzaPriceByIsin: async () => { calls.push("avanza-isin"); return { ...valid, price: 998, timestamp: null }; },
            getNordnetPriceByIsin: async () => { calls.push("nordnet"); throw new Error("offline"); },
            getYahooPrice: async () => { calls.push("yahoo"); return { ...yahoo, timestamp: close / 1000 }; },
        }, () => now);
        assert.equal(quote.price, 4);
        assert.equal(quote.timestamp, close);
        assert.deepEqual(calls, ["avanza-id", "nordnet", "yahoo"]);
    }
});

test("wrong identity, market, currency and absent source time cannot yield a verified quote", async () => {
    for (const overrides of [{ symbol: "OTHER" }, { exchangeName: "STO" }, { currency: "SEK" },
        { isin: "OTHER" }, { timestamp: null }, { price: Infinity }]) {
        assert.equal(await getVerifiedHoldingQuote({ ...holding, provider: null }, {
            getYahooPrice: async () => ({ ...yahoo, ...overrides }),
        }, () => now), null);
    }
});

test("valid primary response stops fallback and unavailable providers return no invented quote", async () => {
    assert.equal((await getVerifiedHoldingQuote(holding, {
        getAvanzaPriceByInstrumentId: async () => valid,
        getAvanzaPriceByIsin: async () => { assert.fail("unnecessary fallback"); },
    }, () => now)).timestamp, close);
    assert.equal(await getVerifiedHoldingQuote(holding, {}, () => now), null);
});

test("Avanza search resolution fetches price and time from the same identity-checked detail response", async () => {
    let url;
    const quote = await fetchAvanzaQuote("42", holding.isin, async (requestUrl) => {
        url = requestUrl;
        return new Response(JSON.stringify({ isin: holding.isin, quote: { last: 4, currency: "USD", timestamp: close } }));
    });
    assert.ok(url.endsWith("/stock/42"));
    assert.equal(quote.price, 4);
    assert.equal(quote.timestamp, close);
    await assert.rejects(fetchAvanzaQuote("42", holding.isin, async () => new Response(JSON.stringify({ isin: "OTHER" }))));
    const missingTime = await fetchAvanzaQuote("42", null, async () => new Response(JSON.stringify({ quote: { last: 4 } })));
    assert.equal(missingTime.timestamp, null);
});

test("source time survives Supabase mapper roundtrip independently from the fresh check time", () => {
    const saved = databaseHoldingToApp(appHoldingToDatabase({ ...holding, currentPrice: 4, currentValueSek: 400, priceUpdatedAt: close }));
    const inputs = { userId: "u", holdings: [saved], checks: { abcl: { userId: "u", success: true,
        checkedAt: now, valueKey: quoteValuationKey(saved) } } };
    assert.equal(saved.priceUpdatedAt, close);
    assert.equal(validateValuationFreshness(inputs, now).ready, true);
    inputs.holdings.push({ ...saved, id: "bad", priceUpdatedAt: null });
    inputs.checks.bad = { ...inputs.checks.abcl, valueKey: quoteValuationKey(inputs.holdings[1]) };
    assert.equal(validateValuationFreshness(inputs, now).ready, false);
});

test("strict normalization rejects implicit timezones, invalid dates, coercions and out-of-range numbers", () => {
    for (const value of [true, false, {}, [], " ", "2026-02-30", "2026-02-30T12:00:00Z", "2026-10-08T12:00:00", "2026-10-08T24:00:00Z", 1e20]) {
        assert.equal(normalizeQuoteTimestamp(value), null, String(value));
    }
    assert.equal(normalizeQuoteTimestamp("2026-10-08T14:00:00+02:00"), now);
    assert.equal(normalizeQuoteTimestamp(String(close / 1000)), close);
});

test("only fully verified observations reach the RPC; failed refreshes preserve the real saved history", async () => {
    const position = { ...holding, currentPrice: 4, currentValueSek: 400, priceUpdatedAt: close };
    const inputs = { userId: "u", holdings: [position], checks: { abcl: { userId: "u", success: true,
        checkedAt: now, valueKey: quoteValuationKey(position) } } };
    const points = [{ date: "2026-10-07", valueSek: 390 }];
    const save = async (date, valueSek) => points.push({ date, valueSek });
    const observation = { inputs, valueSek: 400, observedAt: new Date(now).toISOString() };
    assert.equal((await writeVerifiedHistory(observation, save, now)).ready, true);
    assert.deepEqual(points, [{ date: "2026-10-07", valueSek: 390 }, { date: "2026-10-08", valueSek: 400 }]);
    inputs.checks.abcl.success = false;
    assert.equal((await writeVerifiedHistory(observation, save, now)).ready, false);
    inputs.checks.abcl.success = true;
    position.priceUpdatedAt = null;
    inputs.checks.abcl.valueKey = quoteValuationKey(position);
    assert.equal((await writeVerifiedHistory(observation, save, now)).ready, false);
    assert.equal(points.length, 2);
    position.priceUpdatedAt = close;
    inputs.checks.abcl.valueKey = quoteValuationKey(position);
    assert.equal((await writeVerifiedHistory({ ...observation, observedAt: "2026-10-07T12:00:00Z" }, save, now)).ready, false);
    await assert.rejects(writeVerifiedHistory(observation, async () => { throw new Error("offline"); }, now));
    assert.equal(points.length, 2);
});

test("date-only NAV remains today's publication date after bigint storage even before noon", () => {
    const morning = Date.parse("2026-10-08T05:00:00Z");
    const saved = databaseHoldingToApp(appHoldingToDatabase({ ...holding, assetType: "FUND", market: null,
        priceUpdatedAt: "2026-10-08" }));
    assert.equal(quoteFreshnessReason(saved, morning), null);
    assert.notEqual(quoteFreshnessReason({ ...saved, priceUpdatedAt: normalizeQuoteTimestamp("2026-10-09") }, morning), null);
});

test("direct crypto verifies provider ID and real timestamp without stock-provider fallback", async () => {
    const coin = { assetType: "CRYPTO", coinId: "bitcoin", currency: "SEK" };
    const quote = await getVerifiedHoldingQuote(coin, {
        getCryptoPrice: async () => ({ coinId: "bitcoin", price: 100, currency: "SEK", timestamp: now / 1000 }),
    }, () => now);
    assert.equal(quote.timestamp, now);
    assert.equal(await getVerifiedHoldingQuote(coin, {
        getCryptoPrice: async () => ({ coinId: "other", price: 100, currency: "SEK", timestamp: now }),
    }, () => now), null);
});

test("weekends, holidays, half days and DST use the latest market session; ETFs use exchange rules", () => {
    const reason = (time, timestamp, overrides = {}) => quoteFreshnessReason({ ...holding, priceUpdatedAt: timestamp, ...overrides }, Date.parse(time));
    assert.equal(reason("2026-10-04T12:00:00Z", "2026-10-02T20:00:00Z"), null);
    assert.notEqual(reason("2026-10-04T12:00:00Z", "2026-10-01T20:00:00Z"), null);
    assert.equal(reason("2026-07-05T12:00:00Z", "2026-07-02T20:00:00Z"), null);
    assert.equal(reason("2026-11-28T12:00:00Z", "2026-11-27T18:00:00Z"), null);
    assert.equal(reason("2026-10-26T13:00:00Z", "2026-10-23T20:00:00Z"), null);
    assert.equal(reason("2026-10-08T12:00:00Z", "2026-10-08T11:40:00Z", { market: "XSTO", assetType: "FUND" }), null);
    assert.notEqual(reason("2026-10-08T12:00:00Z", "2026-10-07T15:30:00Z", { market: "XSTO" }), null);
    assert.notEqual(reason("2026-10-08T12:00:00Z", close, { market: "UNKNOWN", country: "US" }), null);
    assert.notEqual(reason("2026-10-08T12:00:00Z", close, { market: "UNKNOWN", assetType: "FUND" }), null);
    assert.notEqual(reason("2026-10-08T12:00:00Z", close, { market: null, assetType: "FUND", productType: "ETF" }), null);
    assert.notEqual(reason("2028-10-08T12:00:00Z", "2028-10-06T20:00:00Z"), null);
});

test("wrong own-provider ID and missing cross-provider ISIN never stop verified fallback", async () => {
    for (const primary of [{ ...valid, instrumentId: "OTHER" }, { ...valid, isin: "OTHER" }]) {
        const result = await getVerifiedHoldingQuote(holding, {
            getAvanzaPriceByInstrumentId: async () => ({ ...primary, price: 999 }),
            getAvanzaPriceByIsin: async () => ({ ...valid, isin: undefined, price: 998 }),
            getNordnetPriceByIsin: async () => ({ ...valid, isin: "OTHER", price: 997 }),
            getYahooPrice: async () => yahoo,
        }, () => now);
        assert.equal(result.price, 4);
    }
});

test("open and closed sessions enforce the source-time boundary independently of checkedAt", () => {
    const stock = { ...holding, market: "XSTO" };
    assert.equal(quoteFreshnessReason({ ...stock, priceUpdatedAt: now - 30 * 60000 }, now), null);
    assert.notEqual(quoteFreshnessReason({ ...stock, priceUpdatedAt: now - 30 * 60000 - 1 }, now), null);
    const afterClose = Date.parse("2026-10-08T18:00:00Z");
    const end = Date.parse("2026-10-08T15:30:00Z");
    assert.equal(quoteFreshnessReason({ ...stock, priceUpdatedAt: end - 30 * 60000 }, afterClose), null);
    assert.notEqual(quoteFreshnessReason({ ...stock, priceUpdatedAt: end - 30 * 60000 - 1 }, afterClose), null);
});
