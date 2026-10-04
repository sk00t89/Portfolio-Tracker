import test from "node:test";
import assert from "node:assert/strict";
import { providerHttpError } from "../supabase/functions/_shared/providerDiagnostics.js";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
const now = Date.parse("2026-10-05T21:30:00Z");
const holding = { name: "Example stock", ticker: "EXAMPLE", instrumentId: "42", provider: "Avanza", assetType: "STOCK",
    exchange: "XSAT", market: "XSAT", country: "SE", isin: "SE-EXAMPLE", quantity: 1 };
const response = (body, status = 404) => new Response(body, { status });
test("provider HTTP 404 reaches dry-run and log with instrument, actual symbol and safe endpoint", async () => {
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }), save: async () => assert.fail("Must not save") },
        providers: createSnapshotProviders({ fetcher: async () => response(JSON.stringify({ chart: { error: { code: "Not Found", description: "No data found" } } })) }),
        logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "Market provider HTTP 404");
    assert.deepEqual(result.diagnostics.instrument, { name: "Example stock", ticker: "EXAMPLE", instrumentId: "42", provider: "Avanza",
        assetType: "STOCK", market: "XSAT", country: "SE", isin: "SE-EXAMPLE", exchange: "XSAT" });
    assert.equal(result.diagnostics.marketProvider, "Yahoo");
    assert.equal(result.diagnostics.normalizedSymbol, "EXAMPLE.ST");
    assert.equal(result.diagnostics.listingCode, "XSAT");
    assert.equal(result.diagnostics.httpStatus, 404);
    assert.equal(result.diagnostics.endpoint, "https://query1.finance.yahoo.com/v8/finance/chart/EXAMPLE.ST");
    assert.equal(result.diagnostics.responseBody, '{"code":"Not Found","description":"No data found"}');
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
});
test("URLs never expose query parameters, credentials or fragments", async () => {
    const error = await providerHttpError(response("Not found"), "https://username:password@query1.finance.yahoo.com/v8/finance/chart/EXAMPLE.ST?api_token=secret-query&period1=123#secret-fragment", {});
    assert.equal(error.diagnostics.endpoint, "https://query1.finance.yahoo.com/v8/finance/chart/EXAMPLE.ST");
    const serialized = JSON.stringify(error.diagnostics);
    for (const forbidden of ["secret-query", "secret-fragment", "username", "password", "period1", "api_token"]) assert.equal(serialized.includes(forbidden), false);
});
test("secret-bearing or encoded response bodies are omitted from diagnostics", async () => {
    for (const body of ['{"message":"api_key=hidden"}', 'Bearer hidden-token',
        '{"message":"actual-secret-value"}', '{"message":"%61ctual-secret-value"}',
        '{"access_token":"hidden","message":"Not found"}']) {
        const error = await providerHttpError(response(body), "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin", { "x-cg-demo-api-key": "actual-secret-value" });
        assert.equal(error.diagnostics.responseBody, undefined);
        assert.equal(error.diagnostics.responseBodyOmitted, "potential_secrets");
        assert.equal(JSON.stringify(error.diagnostics).includes("actual-secret-value"), false);
    }
});
test("body is bounded, safe long messages are truncated, HTML is omitted", async () => {
    const long = await providerHttpError(response(JSON.stringify({ message: "x".repeat(1000) })), "https://api.lysa.se/funds", {});
    assert.equal(long.diagnostics.responseBody.length, 512);
    assert.equal(long.diagnostics.responseBodyTruncated, true);
    const oversized = await providerHttpError(response("x".repeat(5000)), "https://api.lysa.se/funds", {});
    assert.equal(oversized.diagnostics.responseBodyOmitted, "too_large");
    const html = await providerHttpError(response("<html>Upstream failure</html>"), "https://api.lysa.se/funds", {});
    assert.equal(html.diagnostics.responseBody, undefined);
});
test("unavailable error body preserves status and the original HTTP failure", async () => {
    const error = await providerHttpError({ status: 503, text: async () => { throw new Error("Read failed"); } }, "https://api.lysa.se/funds", {});
    assert.equal(error.message, "Market provider HTTP 503");
    assert.equal(error.diagnostics.httpStatus, 503);
    assert.equal(error.diagnostics.responseBodyOmitted, "unavailable");
});
test("fund fallback keeps every provider HTTP failure and full instrument metadata", async () => {
    const fund = { ...holding, assetType: "FUND", market: "FUND", exchange: "FUND" };
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [fund], manual_assets: [], lysa_transactions: [] }) },
        providers: createSnapshotProviders({ fetcher: async () => response('{"message":"Not found"}') }), logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.diagnostics.code, "FUND_NAV_UNAVAILABLE");
    assert.equal(result.diagnostics.instrument.assetType, "FUND");
    assert.equal(result.diagnostics.instrument.country, "SE");
    assert.deepEqual(result.diagnostics.httpErrors.map((item) => item.marketProvider), ["Avanza", "Avanza", "Nordnet"]);
    assert.ok(result.diagnostics.httpErrors.every((item) => item.httpStatus === 404 && !item.endpoint.includes("?")));
    assert.equal(logs.length, 1);
});
test("FX HTTP failure identifies the holding whose valuation needed that currency", async () => {
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) },
        providers: { close: async (h, session) => ({ kind: "session_close", date: session.date, price: 10, currency: "USD" }),
            fx: (currency) => createSnapshotProviders({ fetcher: async () => response("Unavailable", 503) }).fx(currency) }, logger: { warn: () => {} } });
    assert.equal(result.diagnostics.marketProvider, "Frankfurter");
    assert.equal(result.diagnostics.normalizedSymbol, "USD-SEK");
    assert.equal(result.diagnostics.instrument.ticker, "EXAMPLE");
});
test("cached HTTP errors identify the current consumer rather than another holding", async () => {
    const api = createSnapshotProviders({ fetcher: async () => response("Not found") });
    await assert.rejects(api.close({ ...holding, name: "Previous holding" }, { market: "STOCKHOLM", date: "2026-10-05", zone: "Europe/Stockholm" }));
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) },
        providers: api, logger: { warn: () => {} } });
    assert.equal(result.diagnostics.instrument.name, "Example stock");
});
test("CoinGecko HTTP diagnostics retain public coin ID while omitting an echoed server API key", async () => {
    const apiKey = "server-only-coin-gecko-key";
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [{ ...holding, assetType: "CRYPTO", isin: null, coinId: "bitcoin" }], manual_assets: [], lysa_transactions: [] }) },
        providers: createSnapshotProviders({ coinGeckoKey: apiKey, fetcher: async () => response(JSON.stringify({ message: encodeURIComponent(apiKey) })) }),
        logger: { warn: () => {} } });
    assert.equal(result.diagnostics.marketProvider, "CoinGecko");
    assert.equal(result.diagnostics.normalizedSymbol, "bitcoin");
    assert.equal(result.diagnostics.responseBodyOmitted, "potential_secrets");
    assert.equal(JSON.stringify(result).includes(apiKey), false);
});
