import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";

const now = Date.parse("2026-10-05T21:30:00Z");
const holding = { id: "fund", name: "Ordinary fund", quantity: 2, assetType: "FUND", market: "FUND", country: "LU",
    provider: "Avanza", instrumentId: "avanza-123", isin: "LU-FUND" };
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
const avanzaQuote = (overrides = {}) => ({ orderbookId: "avanza-123", isin: "LU-FUND", type: "FUND", currency: "SEK", nav: 10, navDate: "2026-10-02", ...overrides });
const nordnetQuote = (overrides = {}) => ({ results: [{ instrument_info: { instrument_id: "nn-456", isin: "LU-FUND", currency: "SEK" },
    price_info: { last: { price: 12 }, tick_timestamp: "2026-10-02" }, ...overrides }] });
function provider(fetcher) { return createSnapshotProviders({ fetcher, clock: () => now }); }

test("Avanza fund uses its own NAV endpoint first, with no Nordnet lookup", async () => {
    const calls = [];
    const quote = await provider(async (url) => { calls.push(url); return response(avanzaQuote()); }).fund(holding, now);
    assert.equal(quote.provider, "Avanza");
    assert.equal(quote.price, 10);
    assert.deepEqual(quote.attemptedProviders, ["Avanza"]);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /avanza.se\/_api\/market-guide\/fund\/avanza-123/);
});
test("Avanza fund-guide NAV format works when market-guide is unavailable", async () => {
    const calls = [];
    const quote = await provider(async (url) => {
        calls.push(url);
        return url.includes("market-guide") ? response({}, 404) : response(avanzaQuote({ nav: { value: "1 234,50", currency: "SEK", date: "2026-10-02" }, navDate: undefined }));
    }).fund(holding, now);
    assert.equal(quote.price, 1234.5);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /fund-guide\/guide\/avanza-123/);
});
test("Nordnet fund uses its own identifier first even if platform is Avanza", async () => {
    const calls = [];
    const quote = await provider(async (url) => { calls.push(url); return response(nordnetQuote()); }).fund({ ...holding, provider: "Nordnet", platform: "Avanza", instrumentId: "nn-456" }, now);
    assert.equal(quote.provider, "Nordnet");
    assert.deepEqual(quote.attemptedProviders, ["Nordnet"]);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /nordnet.se.*instrument_id%3Dnn-456/);
});
test("verified Nordnet fallback resolves by ISIN, never by the Avanza identifier", async () => {
    const calls = [];
    const quote = await provider(async (url) => {
        calls.push(url);
        if (url.includes("avanza.se")) return response({}, 404);
        if (url.includes("query/instrument?")) return response({ results: [{ instrument_info: { instrument_id: "nn-456", isin: "LU-FUND" } }] });
        return response(nordnetQuote());
    }).fund(holding, now);
    assert.equal(quote.provider, "Nordnet");
    assert.deepEqual(quote.attemptedProviders, ["Avanza", "Nordnet"]);
    assert.equal(calls.filter((url) => url.includes("nordnet.se")).some((url) => url.includes("avanza-123")), false);
});
test("verified Avanza fallback searches by ISIN and verifies details even if search has no ISIN", async () => {
    const calls = [];
    const quote = await provider(async (url, options) => {
        calls.push(url);
        if (url.includes("nordnet.se")) return response({}, 404);
        if (url.includes("filtered-search")) {
            assert.equal(options.method, "POST");
            assert.equal(JSON.parse(options.body).query, "LU-FUND");
            return response({ hits: [{ type: "FUND", orderBookId: "avanza-123" }] });
        }
        return response(avanzaQuote());
    }).fund({ ...holding, provider: "Nordnet", instrumentId: "nn-456" }, now);
    assert.equal(quote.provider, "Avanza");
    assert.deepEqual(quote.attemptedProviders, ["Nordnet", "Avanza"]);
    assert.equal(calls.filter((url) => url.includes("avanza.se")).some((url) => url.includes("nn-456")), false);
});
test("own-provider ID without ISIN is allowed only if the returned ID matches", async () => {
    const quote = await provider(async () => response(avanzaQuote({ isin: undefined }))).fund({ ...holding, isin: null }, now);
    assert.equal(quote.price, 10);
    await assert.rejects(provider(async () => response(avanzaQuote({ orderbookId: "wrong" }))).fund({ ...holding, isin: null }, now), (error) => {
        assert.deepEqual(error.diagnostics.attemptedProviders, ["Avanza"]);
        assert.equal(error.diagnostics.attempts[0].reason, "Unverified Avanza fund identity");
        return true;
    });
});
test("failed primary without ISIN cannot invoke a cross-provider lookup", async () => {
    const calls = [];
    await assert.rejects(provider(async (url) => { calls.push(url); return response({}, 404); }).fund({ ...holding, isin: null }, now),
        (error) => error.diagnostics.attemptedProviders.join(",") === "Avanza");
    assert.equal(calls.every((url) => url.includes("avanza.se")), true);
});
test("wrong ISIN, wrong returned ID, ETF and missing source date all fail closed", async () => {
    for (const invalid of [avanzaQuote({ isin: "OTHER" }), avanzaQuote({ orderbookId: "wrong" }),
        avanzaQuote({ type: "ETF" }), avanzaQuote({ navDate: undefined })]) {
        await assert.rejects(provider(async (url) => url.includes("avanza.se") ? response(invalid) : response({ results: [] })).fund(holding, now),
            (error) => error.diagnostics.code === "FUND_NAV_UNAVAILABLE");
    }
});
test("stale primary NAV tries a verified fallback; both stale or future NAVs fail", async () => {
    const fetcher = async (url) => {
        if (url.includes("avanza.se")) return response(avanzaQuote({ navDate: "2026-09-27" }));
        if (url.includes("query/instrument?")) return response({ results: [{ instrument_info: { instrument_id: "nn-456", isin: "LU-FUND" } }] });
        return response(nordnetQuote());
    };
    assert.equal((await provider(fetcher).fund(holding, now)).provider, "Nordnet");
    for (const date of ["2026-09-27", "2026-10-06"]) {
        await assert.rejects(provider(async (url) => {
            if (url.includes("avanza.se")) return response(avanzaQuote({ navDate: date }));
            if (url.includes("query/instrument?")) return response({ results: [{ instrument_info: { instrument_id: "nn-456", isin: "LU-FUND" } }] });
            return response(nordnetQuote({ price_info: { last: { price: 12 }, tick_timestamp: date } }));
        }).fund(holding, now), (error) => error.diagnostics.attempts.every((attempt) => /Stale\/invalid/.test(attempt.reason)));
    }
});
test("failure diagnostics reach dry-run and log with original and attempted providers", async () => {
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }), save: async () => assert.fail("Must not save") },
        providers: provider(async () => response({}, 404)), logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed");
    assert.equal(result.diagnostics.provider, "Avanza");
    assert.deepEqual(result.diagnostics.attemptedProviders, ["Avanza", "Nordnet"]);
    assert.equal(result.diagnostics.instrument.name, "Ordinary fund");
    assert.equal(result.diagnostics.attempts.length, 2);
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
});
test("successful dry-run sources expose selected and attempted providers", async () => {
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) },
        providers: provider(async () => response(avanzaQuote())) });
    assert.equal(result.status, "dry_run");
    assert.equal(result.sources[0].provider, "Avanza");
    assert.deepEqual(result.sources[0].attemptedProviders, ["Avanza"]);
});
test("unknown provider IDs are not treated as platform IDs or sent to either provider", async () => {
    let calls = 0;
    for (const fund of [{ ...holding, provider: "UnknownSource", platform: "Avanza", isin: null },
        { ...holding, provider: null, platform: "Avanza", isin: null }]) {
        await assert.rejects(provider(async () => { calls++; return response(avanzaQuote()); }).fund(fund, now),
            (error) => error.diagnostics.attemptedProviders.length === 0);
    }
    assert.equal(calls, 0);
});
test("fund cache respects source-provider and identifier namespaces for identical ISINs", async () => {
    const calls = [];
    const api = provider(async (url) => { calls.push(url); return response(url.includes("avanza.se") ? avanzaQuote() : nordnetQuote()); });
    const avanza = await api.fund(holding, now);
    const nordnet = await api.fund({ ...holding, provider: "Nordnet", instrumentId: "nn-456" }, now);
    assert.equal(avanza.provider, "Avanza");
    assert.equal(nordnet.provider, "Nordnet");
    assert.equal(calls.length, 2);
});
