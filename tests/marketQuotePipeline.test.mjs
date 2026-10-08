import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { createMarketQuoteRoutes, MARKET_QUOTE_VERSION } from "../supabase/functions/_shared/marketQuoteRoutes.js";
import { createMarketQuoteMiddleware } from "../server/marketQuoteMiddleware.js";
import { createMarketApiFetch } from "../src/services/marketApiFetch.js";
import { getVerifiedHoldingQuote, createVerifiedQuoteBatch } from "../src/services/verifiedHoldingQuote.js";
import { quoteValuationKey, validateValuationFreshness } from "../src/utils/valuationFreshness.js";
import { normalizeYahooSymbol } from "../supabase/functions/_shared/yahooSymbol.js";
import { safeQuoteDiagnostics } from "../supabase/functions/_shared/quoteDiagnostics.js";
import { createInFlightRequests } from "../src/utils/requestDeduplication.js";
import { appHoldingToDatabase, databaseHoldingToApp } from "../src/utils/holdingDatabaseMapper.js";
import { calculateDailyMovers } from "../src/utils/dashboardHistory.js";

const now = Date.parse("2026-10-08T12:00:00Z");
const usClose = Date.parse("2026-10-07T20:00:00Z");
// Public instrument identities; prices, quantities and times are isolated test fixtures.
const holdings = [
    { name: "AbCellera Biologics", ticker: "ABCL", isin: "CA00288U1066", instrumentId: "1166171", quantity: 10, currency: "USD", market: "XNAS" },
    { name: "Alibaba Group ADR", ticker: "BABA", isin: "US01609W1027", instrumentId: "506278", quantity: 5, currency: "USD", market: "XNAS" },
    { name: "Avanza Zero", ticker: "Avanza Zero", isin: "SE0001718388", instrumentId: "41567", quantity: 20, currency: "SEK", market: "FUND", assetType: "FUND" },
    { name: "Berkshire Hathaway B", ticker: "BRK.B", isin: "US0846707026", instrumentId: "4109", quantity: 3, currency: "USD", market: "XNAS" },
    { name: "Investor B", ticker: "INVE B", isin: null, instrumentId: "5247", quantity: 15, currency: "SEK", market: "Stockholmsbörsen" },
    { name: "Palantir Technologies", ticker: "PLTR", isin: "US69608A1088", instrumentId: "1138439", quantity: 8, currency: "USD", market: "XNAS" },
].map((item) => ({ provider: "Avanza", assetType: "STOCK", currentPrice: 10, priceUpdatedAt: null, ...item }));
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const quiet = { warn() {} };
const edgeSource = stripTypeScriptTypes(await readFile(new URL("../supabase/functions/market-api/index.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "");
const frontendSource = (await readFile(new URL("../src/services/marketData.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "").replace(/export /g, "");
function edge(fetcher) {
    let handler;
    new Function("Deno", "createMarketQuoteRoutes", "fetch", edgeSource)({ serve(fn) { handler = fn; }, env: { get() {} } },
        () => createMarketQuoteRoutes({ fetcher, clock: () => now, sleep: async () => {}, logger: quiet }), fetcher);
    return handler;
}
function frontend(handler, getSession = async () => ({ data: { session: { user: { id: "u" }, access_token: "fixture-secret-token" } } })) {
    const apiFetch = createMarketApiFetch({ baseUrl: "https://example.test/functions/v1/market-api", apiKey: "fixture-secret-api-key",
        getSession, fetcher: (url) => handler(new Request(url)) });
    return new Function("apiFetch", frontendSource + "\nreturn {getYahooPrice,getAvanzaPriceByInstrumentId,getAvanzaPriceByIsin,getNordnetPriceByIsin,getNordnetPriceByInstrumentId,getFundNav};")(apiFetch);
}
function fixtureProvider(calls) {
    return async (rawUrl, options) => {
        const url = new URL(rawUrl);
        calls.push(url.href);
        if (url.pathname.includes("market-guide/fund/41567")) return response({}, 404);
        if (url.pathname.includes("fund-guide/guide/41567")) return response({ orderbookId: "41567", isin: "SE0001718388", type: "FUND", nav: 559.22, currency: "SEK", navDate: "2026-10-07T00:00:00" });
        if (url.pathname.includes("market-guide/stock/")) {
            const h = holdings.find((item) => item.instrumentId === url.pathname.split("/").at(-1));
            return response({ orderbookId: h.instrumentId, isin: h.isin, quote: { last: 999, currency: h.currency, timestamp: null } });
        }
        if (url.pathname.includes("filtered-search")) {
            const h = holdings.find((item) => item.isin === JSON.parse(options.body).query);
            return response({ hits: [{ type: "STOCK", orderBookId: h.instrumentId, price: { last: "998" } }] });
        }
        if (url.hostname === "www.nordnet.se") {
            const isin = url.searchParams.get("apply_filters").split("=")[1];
            const h = holdings.find((item) => item.isin === isin);
            return response({ results: [{ instrument_info: { isin, instrument_id: "nn-" + h.instrumentId, currency: h.currency }, price_info: { last: { price: 997 }, tick_timestamp: null } }] });
        }
        const symbol = url.pathname.split("/").at(-1);
        assert.notEqual(symbol, "BRK.B");
        return response({ chart: { result: [{ meta: { symbol, currency: symbol === "INVE-B.ST" ? "SEK" : "USD",
            exchangeName: symbol === "INVE-B.ST" ? "STO" : symbol === "ABCL" || symbol === "PLTR" ? "NMS" : "NYQ",
            regularMarketPrice: 20, regularMarketTime: (symbol === "INVE-B.ST" ? now : usClose) / 1000 } }] } });
    };
}

test("the six supplied holdings run through the real frontend functions and Edge handler with strict history validation", async () => {
    const calls = [];
    const providers = frontend(edge(fixtureProvider(calls)));
    const verified = [];
    const checks = {};
    for (const h of holdings) {
        let trace;
        const quote = await getVerifiedHoldingQuote(h, providers, () => now, (value) => { trace = value; });
        assert.ok(quote, h.name);
        assert.equal(quote.apiVersion, MARKET_QUOTE_VERSION);
        assert.ok(trace.some((item) => item.outcome === "accepted"));
        assert.ok(!JSON.stringify(trace).includes("fixture-secret"));
        if (h.name !== "Avanza Zero") {
            assert.equal(quote.price, 20);
            assert.ok(trace.some((item) => item.reasonCode === "QUOTE_SOURCE_TIME_INVALID"));
            assert.equal(trace.at(-1).provider, "Yahoo");
        } else {
            assert.equal(quote.kind, "published_nav");
            assert.equal(quote.price, 559.22);
            assert.ok(!calls.some((url) => url.includes("stock/41567")));
        }
        const position = { ...h, id: h.instrumentId, currentPrice: quote.price, priceUpdatedAt: quote.timestamp, currentValueSek: h.quantity * quote.price };
        verified.push(position);
        checks[position.id] = { userId: "u", success: true, checkedAt: now, valueKey: quoteValuationKey(position) };
    }
    assert.equal(validateValuationFreshness({ userId: "u", holdings: verified, checks }, now).ready, true);
    verified[0].priceUpdatedAt = null;
    checks[verified[0].id].valueKey = quoteValuationKey(verified[0]);
    assert.equal(validateValuationFreshness({ userId: "u", holdings: verified, checks }, now).ready, false);
});

test("Express and Edge use the same contract, normalization and genuine Yahoo source time", async () => {
    const fetcher = async (url) => {
        assert.ok(url.includes("/BRK-B?"));
        return response({ chart: { result: [{ meta: { symbol: "BRK-B", regularMarketPrice: 100, regularMarketTime: usClose / 1000, currency: "USD", exchangeName: "NYQ" } }] } });
    };
    const edgeResult = await edge(fetcher)(new Request("https://example.test/functions/v1/market-api/api/yahoo-price/BRK.B"));
    let expressBody, expressStatus;
    await createMarketQuoteMiddleware({ fetcher, clock: () => now, logger: quiet })({ originalUrl: "/api/yahoo-price/BRK.B" }, {
        status(value) { expressStatus = value; return this; }, json(value) { expressBody = value; },
    }, () => assert.fail("quote route must not reach legacy handlers"));
    assert.equal(expressStatus, edgeResult.status);
    assert.deepEqual(expressBody, await edgeResult.json());
    assert.equal(expressBody.timestamp, usClose / 1000);
});

test("provider 403 falls back to query2, 429 retries once, and 404 is preserved without retries", async () => {
    for (const status of [403, 429, 404]) {
        const calls = [], sleeps = [];
        const route = createMarketQuoteRoutes({ clock: () => now, logger: quiet, sleep: async (ms) => sleeps.push(ms), fetcher: async (url) => {
            calls.push(url);
            if (url.includes("query1")) return response({ chart: { error: { code: "Error", description: "fixture-secret-token" } } }, status, { "retry-after": "1" });
            return response({ chart: { result: [{ meta: { symbol: "ABCL", regularMarketTime: usClose / 1000 } }] } });
        } });
        const result = await route(new URL("https://example.test/api/yahoo-price/ABCL"));
        assert.equal(result.status, status === 404 ? 404 : 200);
        assert.equal(calls.length, status === 404 ? 1 : status === 429 ? 3 : 2);
        assert.equal(sleeps.length, status === 429 ? 1 : 0);
        assert.ok(result.body.diagnostics.some((item) => item.httpStatus === status));
        assert.ok(!JSON.stringify(result).includes("fixture-secret"));
    }
});

test("wrong returned symbol, invalid JSON and transport errors are safe and cannot invent source time", async () => {
    for (const fetcher of [async () => response({ chart: { result: [{ meta: { symbol: "OTHER" } }] } }),
        async () => new Response("not json"), async () => { throw new Error("Authorization Bearer fixture-secret-token"); }]) {
        const result = await createMarketQuoteRoutes({ fetcher, logger: quiet })(new URL("https://example.test/api/yahoo-price/ABCL"));
        assert.equal(result.status, 502);
        assert.equal(result.body.timestamp, undefined);
        assert.ok(!JSON.stringify(result).includes("fixture-secret"));
    }
});

test("ordinary FUND market uses NAV; stale, future or wrong-identity NAV cannot verify a fund", async () => {
    const fund = holdings[2];
    for (const change of [{ navDate: "2026-09-29" }, { navDate: "2026-10-09" }, { isin: "OTHER" }, { type: "ETF" }, { navDate: null }]) {
        const providers = frontend(edge(async (url) => url.includes("avanza.se") ? response({ orderbookId: "41567", isin: fund.isin, type: "FUND", nav: 559.22, currency: "SEK", navDate: "2026-10-07", ...change }) : response({ results: [] })));
        assert.equal(await getVerifiedHoldingQuote(fund, providers, () => now), null);
    }
});

test("GET requests share one in-flight response per user; consumers have separate streams and failures retry", async () => {
    let userId = "u", calls = 0, release;
    let gate = new Promise((resolve) => { release = resolve; });
    const api = createMarketApiFetch({ baseUrl: "https://example.test", apiKey: "secret", getSession: async () => ({ data: { session: { user: { id: userId } } } }),
        fetcher: async () => { calls++; await gate; return response({ apiVersion: MARKET_QUOTE_VERSION, symbol: "ABCL" }); } });
    const first = api("/api/yahoo-price/ABCL"), second = api("/api/yahoo-price/ABCL");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    userId = "other";
    const third = api("/api/yahoo-price/ABCL");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    release();
    assert.deepEqual(await (await first).json(), await (await second).json());
    await third;
    gate = Promise.resolve();
    await api("/api/yahoo-price/ABCL");
    assert.equal(calls, 3);
    await assert.rejects(createMarketApiFetch({ baseUrl: "https://example.test", getSession: async () => ({ data: {} }), fetcher: async () => response({ price: 1 }) })("/api/yahoo-price/ABCL"), /MARKET_API_VERSION_MISMATCH/);
});

test("a user-scoped batch reuses one verified pair across positions and repeated sequential loads", async () => {
    let calls = 0;
    const providers = { getAvanzaPriceByInstrumentId: async () => { calls++; return { instrumentId: holdings[0].instrumentId, price: 20, currency: "USD", timestamp: usClose }; } };
    const batch = createVerifiedQuoteBatch("u", providers, () => now);
    const first = await batch(holdings[0]);
    const second = await batch({ ...holdings[0], quantity: 1 });
    assert.equal(calls, 1);
    assert.equal(first, second);
    await createVerifiedQuoteBatch("other", providers, () => now)(holdings[0]);
    assert.equal(calls, 2);
});

test("reusing a cached completed-session price does not fabricate a new checkedAt", async () => {
    let time = now;
    const batch = createVerifiedQuoteBatch("u", { getAvanzaPriceByInstrumentId: async () => ({ instrumentId: holdings[0].instrumentId,
        price: 20, currency: "USD", timestamp: usClose }) }, () => time);
    const quote = await batch(holdings[0]);
    assert.equal(quote.checkedAt, now);
    time += 21 * 60000;
    const reused = await batch(holdings[0]);
    assert.equal(reused.checkedAt, now);
    const position = { ...holdings[0], id: "h", currentPrice: reused.price, priceUpdatedAt: reused.timestamp, currentValueSek: 100 };
    const inputs = { userId: "u", holdings: [position], checks: { h: { userId: "u", success: true, checkedAt: reused.checkedAt,
        valueKey: quoteValuationKey(position) } } };
    assert.equal(validateValuationFreshness(inputs, time).ready, false);
});

test("overlapping refreshes share a promise and release their lock after failure", async () => {
    const once = createInFlightRequests();
    let calls = 0, release;
    const gate = new Promise((resolve) => { release = resolve; });
    const operation = async () => { calls++; await gate; throw new Error("failed"); };
    const first = once("u", operation), second = once("u", operation);
    assert.equal(first, second);
    release();
    await Promise.allSettled([first, second]);
    assert.equal(calls, 1);
    assert.equal(await once("u", async () => "retry"), "retry");
});

test("diagnostic allowlist strips headers, arbitrary messages, request URLs and unexpected fields", () => {
    const safe = safeQuoteDiagnostics([{ provider: "Yahoo", stage: "chart", outcome: "rejected", reasonCode: "MARKET_API_REQUEST_FAILED", httpStatus: 502,
        Authorization: "fixture-secret", message: "fixture-secret", body: "fixture-secret", endpoint: "https://example.test?token=fixture-secret" }]);
    assert.deepEqual(safe, [{ provider: "Yahoo", stage: "chart", outcome: "rejected", reasonCode: "MARKET_API_REQUEST_FAILED", httpStatus: 502 }]);
    assert.equal(normalizeYahooSymbol("BRK.B", "XNAS"), "BRK-B");
    assert.equal(normalizeYahooSymbol("INVE B", "Stockholmsbörsen"), "INVE-B.ST");
    assert.equal(normalizeYahooSymbol("INVE-B.ST", "XSTO"), "INVE-B.ST");
});

test("Avanza stock listing currency and timeOfLast are supported; updated never becomes a source timestamp", async () => {
    for (const sourceTime of [usClose, null]) {
        const result = await createMarketQuoteRoutes({ fetcher: async () => response({ orderbookId: "1166171", isin: holdings[0].isin,
            listing: { currency: "USD", marketPlaceCode: "XNAS" }, quote: { last: 12.83, timeOfLast: sourceTime, updated: now } }), logger: quiet })
            (new URL("https://example.test/api/avanza-price/1166171"));
        assert.equal(result.body.currency, "USD");
        assert.equal(result.body.timestamp, sourceTime);
    }
    const quote = await getVerifiedHoldingQuote(holdings[0], { getAvanzaPriceByInstrumentId: async () => ({ instrumentId: "1166171", price: 12.83, currency: "USD", timestamp: now }) }, () => now);
    assert.equal(quote, null, "a provider refresh on the current pre-open date cannot stand in for yesterday's US close");
});

test("metadata enrichment cannot overwrite saved quote fields or fetch a second price", async () => {
    const source = (await readFile(new URL("../src/services/holdingEnrichment.js", import.meta.url), "utf8"))
        .replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/export /g, "");
    const candidate = { name: "Investor B", isin: "SE-FIXTURE", instrumentId: "5247", provider: "Avanza", price: 999, currency: "SEK", assetType: "STOCK" };
    const enrich = new Function("searchAvanzaInstruments", "searchNordnetInstruments", "getNordnetInstrumentById", source + "\nreturn enrichImportedHolding;")
        (async () => [candidate], async () => [], async () => { assert.fail("unnecessary metadata fetch"); });
    const holding = { ...holdings[4], currentPrice: 405.05, currentValueSek: 6075.75, priceUpdatedAt: now, previousClose: 404 };
    const result = await enrich(holding);
    for (const key of ["currentPrice", "currentValueSek", "priceUpdatedAt", "previousClose"]) assert.equal(result[key], holding[key]);
    const empty = await enrich({ name: "Investor B" });
    assert.equal(empty.currentPrice, undefined);
    assert.equal(empty.priceUpdatedAt, undefined);
});

test("quote writes preserve canonical inputs and guard concurrent quantity/identity changes atomically", async () => {
    const source = (await readFile(new URL("../src/services/database.js", import.meta.url), "utf8"))
        .replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/export /g, "");
    let payload;
    const guards = [];
    const query = { update(value) { payload = value; return this; },
        eq(key, value) { guards.push([key, value]); return this; }, is(key, value) { guards.push([key, value]); return this; },
        select() { return this; }, single: async () => ({ data: null, error: { code: "PGRST116", message: "inputs changed" } }) };
    const update = new Function("supabase", "appHoldingToDatabase", "databaseHoldingToApp", source + "\nreturn updateHoldingQuote;")
        ({ from: () => query }, appHoldingToDatabase, databaseHoldingToApp);
    const original = { ...holdings[0], currentValueSek: 1000, priceUpdatedAt: usClose };
    const result = await update("holding-id", { ...original, currentPrice: 20, priceUpdatedAt: usClose }, original, "u");
    assert.equal(result.data, null);
    assert.deepEqual(Object.keys(payload).sort(), ["current_price", "current_value_sek", "previous_close", "price_updated_at", "currency", "updated_at"].sort());
    assert.ok(guards.some(([key, value]) => key === "quantity" && value === 10));
    assert.ok(guards.some(([key, value]) => key === "user_id" && value === "u"));
    assert.ok(guards.some(([key, value]) => key === "isin" && value === original.isin));
    assert.equal(original.currentPrice, 10);
});

test("the actual Edge crypto route returns the genuine provider timestamp", async () => {
    const result = await edge(async (url) => {
        assert.ok(url.includes("include_last_updated_at=true"));
        return response({ bitcoin: { sek: 100, last_updated_at: now / 1000 } });
    })(new Request("https://example.test/functions/v1/market-api/api/crypto-price/bitcoin"));
    assert.equal((await result.json()).timestamp, now / 1000);
});

test("visible winners and losers survive sequential refresh and database row replacement when primary quotes omit previous close", async () => {
    const positions = [
        { id: "winner", name: "Winner", ticker: "WIN", isin: "SE-WIN", instrumentId: "1", currentPrice: 120 },
        { id: "loser", name: "Loser", ticker: "LOSE", isin: "SE-LOSE", instrumentId: "2", currentPrice: 80 },
    ].map((h) => ({ provider: "Avanza", market: "XSTO", assetType: "STOCK", currency: "SEK", quantity: 10,
        priceUpdatedAt: now - 1000, previousClose: 100, currentValueSek: h.currentPrice * 10, ...h }));
    const providers = frontend(edge(async (rawUrl) => {
        const url = new URL(rawUrl);
        if (url.hostname === "www.avanza.se") {
            const h = positions.find((item) => url.pathname.endsWith("/" + item.instrumentId));
            return response({ orderbookId: h.instrumentId, isin: h.isin, listing: { currency: "SEK" },
                quote: { last: h.id === "winner" ? 111 : 89, timeOfLast: now } });
        }
        assert.equal(url.hostname, "www.nordnet.se");
        const isin = url.searchParams.get("apply_filters").split("=")[1];
        const h = positions.find((item) => item.isin === isin);
        return response({ results: [{ instrument_info: { isin, instrument_id: "nn-" + h.instrumentId, currency: "SEK" },
            price_info: { last: { price: h.id === "winner" ? 110 : 90 }, close: { price: 100 }, tick_timestamp: now - 500 } }] });
    }));
    const source = (await readFile(new URL("../src/services/database.js", import.meta.url), "utf8"))
        .replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/export /g, "");
    const rows = new Map(positions.map((h) => [h.id, appHoldingToDatabase(h)]));
    let target, payload;
    const query = { update(value) { payload = value; return this; },
        eq(key, value) { if (key === "id") target = value; return this; }, is() { return this; }, select() { return this; },
        async single() { const row = { ...rows.get(target), ...payload }; rows.set(target, row); return { data: row, error: null }; } };
    const save = new Function("supabase", "appHoldingToDatabase", "databaseHoldingToApp", source + "\nreturn updateHoldingQuote;")
        ({ from: () => query }, appHoldingToDatabase, databaseHoldingToApp);
    let state = positions;
    const assertVisible = () => {
        const movers = calculateDailyMovers(state, now);
        assert.equal(movers.best.length, 1);
        assert.equal(movers.worst.length, 1);
        assert.equal(movers.excluded, 0);
    };
    assertVisible();
    // Reproduce the old price-only acceptance -> persisted null close -> empty-list transition.
    const broken = positions.map((h) => databaseHoldingToApp(appHoldingToDatabase({ ...h, previousClose: null })));
    assert.equal(calculateDailyMovers(broken, now).excluded, 2);
    for (const h of positions) {
        const quote = await getVerifiedHoldingQuote(h, providers, () => now);
        assert.equal(quote.previousClose, 100);
        assert.equal(quote.timestamp, now - 500);
        assert.equal(quote.price, h.id === "winner" ? 110 : 90); // Never mix Avanza's price with Nordnet's close.
        const updated = { ...h, currentPrice: quote.price, previousClose: quote.previousClose,
            priceUpdatedAt: quote.timestamp, currentValueSek: quote.price * h.quantity };
        const { data, error } = await save(h.id, updated, h, "u");
        assert.equal(error, null);
        state = state.map((item) => item.id === h.id ? data : item);
        assertVisible(); // During refresh and after its final row replacement.
    }
    state = [...rows.values()].map(databaseHoldingToApp);
    assertVisible(); // Reload sees the same complete fields.
});
