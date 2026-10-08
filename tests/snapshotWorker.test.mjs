import test from "node:test";
import assert from "node:assert/strict";
import { valuePortfolio, checkPublishedDate, snapshotHoldingFromDatabase, isMutualFund } from "../supabase/functions/_shared/snapshotEngine.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
const now = Date.parse("2026-10-05T21:30:00Z"); // Stockholm 23:30, both exchanges closed
const stock = { id: "stock", quantity: 2, assetType: "STOCK", ticker: "AAPL", market: "US" };
const coin = { id: "crypto", quantity: 3, assetType: "CRYPTO", ticker: "BTC", coinId: "bitcoin" };
const input = (overrides = {}) => ({ ready: true, revision: "1", holdings: [stock, coin], manual_assets: [{ value_sek: 50 }],
    lysa_transactions: [{ fundName: "Lysa Global Equity Broad C", type: "Buy", volume: 2 }], ...overrides });
const providers = (overrides = {}) => ({
    fund: async () => ({ kind: "published_nav", price: 10, currency: "SEK", timestamp: "2026-10-02" }),
    close: async (holding, session) => ({ kind: "session_close", date: session.date, price: 100, currency: "USD" }),
    crypto: async () => ({ price: 20, currency: "SEK", timestamp: now / 1000 }),
    fx: async () => ({ rate: 10, date: "2026-10-05" }),
    lysa: async () => ({ price: 5, date: "2026-10-02", currency: "SEK", kind: "published_nav" }), ...overrides,
});
const mutualFund = { id: "fund", name: "Kavaljer Quality Focus A SEK", ticker: null, instrumentId: "123",
    isin: "LU-FIXTURE", provider: "Nordnet", assetType: "FUND", productType: "FUND", market: "FUND", exchange: "FUND", country: "LU", quantity: 2 };
test("Kavaljer-like FUND uses published NAV without a stock calendar or close request", async () => {
    const result = await valuePortfolio(input({ holdings: [mutualFund], manual_assets: [], lysa_transactions: [] }),
        providers({ close: async () => assert.fail("Mutual funds must not request a stock close") }), now);
    assert.equal(result.totalValueSek, 20);
    assert.deepEqual(result.sources, [{ id: "fund", kind: "published_nav", date: "2026-10-02", timestamp: "2026-10-02" }]);
    assert.equal(isMutualFund({ ...mutualFund, market: null, exchange: null, country: "SE" }), true);
});
test("fund NAV requires source freshness, verified kind, price and currency; no partial save", async () => {
    for (const overrides of [{ timestamp: null }, { timestamp: "2026-09-27" }, { timestamp: "2026-10-06" },
        { price: null }, { price: 0 }, { currency: null }, { kind: "intraday" }]) {
        let saved = false;
        const result = await runUserSnapshot({ userId: "u", dryRun: false, clock: () => now,
            database: { input: async () => input({ holdings: [mutualFund] }), save: async () => { saved = true; }, outcome: async () => {} },
            providers: providers({ fund: async () => ({ kind: "published_nav", price: 10, currency: "SEK", timestamp: "2026-10-02", ...overrides }) }) });
        assert.equal(result.status, "failed");
        assert.equal(saved, false);
        assert.notEqual(result.diagnostics?.code, "UNSUPPORTED_TRADING_CALENDAR");
    }
    await valuePortfolio(input({ holdings: [mutualFund] }), providers({ fund: async () => ({ kind: "published_nav", price: 10, currency: "USD", date: "2026-09-28" }) }), now);
});
test("normalized FUND on a known exchange still uses the verified closing session", async () => {
    const etf = { ...mutualFund, ticker: "ETF", market: "US", exchange: "US" };
    assert.equal(isMutualFund(etf), false);
    const result = await valuePortfolio(input({ holdings: [etf], manual_assets: [], lysa_transactions: [] }),
        providers({ fund: async () => assert.fail("Listed FUND must not request NAV") }), now);
    assert.equal(result.sources[0].kind, "session_close");
    assert.equal(result.totalValueSek, 2000);
});
test("unknown listed funds, ETFs, certificates and conflicting exchanges still block", async () => {
    for (const holding of [{ ...mutualFund, market: "LSE", exchange: "LSE" },
        { ...mutualFund, exchange: "UNKNOWN_EXCHANGE" }, { ...mutualFund, productType: "ETF" },
        { ...mutualFund, productType: "ETP" }, { ...mutualFund, assetType: "CERTIFICATE" },
        { ...mutualFund, assetType: "STOCK" }]) {
        assert.equal(isMutualFund(holding), false);
        await assert.rejects(valuePortfolio(input({ holdings: [holding] }), providers(), now), (error) => error.diagnostics?.code === "UNSUPPORTED_TRADING_CALENDAR");
    }
});
test("fund NAV provider verifies Nordnet fundlist identity and keeps the real source timestamp", async () => {
    let calls = 0;
    const provider = createSnapshotProviders({ fetcher: async (url) => {
        calls++;
        assert.match(url, /query\/fundlist\?apply_filters=instrument_id%3D123/);
        return { ok: true, json: async () => ({ results: [{ instrument_info: { instrument_id: 123, isin: "LU-FIXTURE", currency: "SEK" }, price_info: { last: { price: 10 }, tick_timestamp: now / 1000 } }] }) };
    } });
    const quote = await provider.fund(mutualFund, now);
    assert.deepEqual(quote, { price: 10, currency: "SEK", timestamp: now / 1000, isin: "LU-FIXTURE", instrumentId: 123,
        date: "2026-10-05", kind: "published_nav", provider: "Nordnet", attemptedProviders: ["Nordnet"] });
    await provider.fund(mutualFund, now);
    assert.equal(calls, 1);
});
test("Nordnet funds without a local provider ID resolve by exact ISIN before requesting NAV", async () => {
    const urls = [];
    const provider = createSnapshotProviders({ fetcher: async (url) => {
        urls.push(url);
        return { ok: true, json: async () => ({ results: url.includes("query/instrument?") ? [
            { instrument_info: { instrument_id: "wrong", isin: "OTHER" } },
            { instrument_info: { instrument_id: "resolved", isin: "LU-FIXTURE" } },
        ] : [{ instrument_info: { instrument_id: "resolved", isin: "LU-FIXTURE", currency: "SEK" }, price_info: { last: { price: 10 }, tick_timestamp: now } }] }) };
    } });
    assert.equal((await provider.fund({ ...mutualFund, instrumentId: null }, now)).price, 10);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /isin%3DLU-FIXTURE/);
    assert.match(urls[1], /instrument_id%3Dresolved/);
    assert.equal(urls.some((url) => url.includes("avanza-id")), false);
});
test("fund provider blocks missing identifiers, wrong identity and missing fundlist results", async () => {
    await assert.rejects(createSnapshotProviders().fund({ provider: "Unknown", instrumentId: "123" }, now), /identifier/);
    for (const results of [[], [{ instrument_info: { instrument_id: "wrong", isin: "LU-FIXTURE" } }],
        [{ instrument_info: { instrument_id: "123", isin: "OTHER" } }],
        [{ instrument_info: { instrument_id: "123", isin: "LU-FIXTURE", instrument_type: "ETF" } }]]) {
        await assert.rejects(createSnapshotProviders({ fetcher: async () => ({ ok: true, json: async () => ({ results }) }) }).fund(mutualFund, now),
            (error) => error.diagnostics.code === "FUND_NAV_UNAVAILABLE" && /Unverified mutual fund identity|exchange-traded/.test(error.diagnostics.attempts[0].reason));
    }
});
test("calendar failure identifies the actual blocking database instrument in result and log", async () => {
    const holding = snapshotHoldingFromDatabase({ id: "bad", name: "Unsupported listing", ticker: "TEST", instrument_id: "12345",
        exchange: "London", market: "lse", country: "GB", asset_type: "STOCK", quantity: 1 });
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => input({ holdings: [stock, holding] }), save: async () => assert.fail("Must not save"), outcome: async () => assert.fail("Dry-run must not record") },
        providers: providers(), logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.reason, "Unsupported or unknown trading calendar");
    assert.equal(result.status, "failed");
    assert.deepEqual(result.diagnostics, { code: "UNSUPPORTED_TRADING_CALENDAR", instrument: {
        name: "Unsupported listing", ticker: "TEST", instrumentId: "12345", exchange: "London",
        market: "lse", country: "GB", exchangeCode: "LSE", calendarCode: null,
    } });
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
    assert.equal(logs.length, 1);
});
test("unknown calendar year reports the mapped calendar and missing instrument fields as null", async () => {
    await assert.rejects(valuePortfolio(input({ holdings: [{ ...stock, name: undefined }] }), providers(), Date.parse("2028-10-05T21:30:00Z")), (error) => {
        assert.equal(error.diagnostics.instrument.calendarCode, "USA");
        assert.equal(error.diagnostics.instrument.exchangeCode, "US");
        assert.equal(error.diagnostics.instrument.exchange, "US");
        assert.equal(error.diagnostics.instrument.name, null);
        assert.equal(error.diagnostics.instrument.instrumentId, null);
        return true;
    });
});
test("snapshot sums manual, verified securities, snapshot crypto and net Lysa units", async () => {
    const result = await valuePortfolio(input(), providers(), now);
    assert.equal(result.totalValueSek, 2120);
    assert.deepEqual(result.sources.map((source) => source.kind), ["session_close", "crypto", "published_nav"]);
    const sold = input({ lysa_transactions: [...input().lysa_transactions, { fundName: "Lysa Global Equity Broad C", type: "Sell", volume: 1 }] });
    assert.equal((await valuePortfolio(sold, providers(), now)).totalValueSek, 2115);
});
test("missing readiness, inputs or one failed quote never produce a partial snapshot", async () => {
    for (const invalid of [input({ ready: false }), input({ holdings: null }), input({ manual_assets: [{ value_sek: null }] }), input({ holdings: [{ ...stock, quantity: -1 }] })]) await assert.rejects(valuePortfolio(invalid, providers(), now));
    await assert.rejects(valuePortfolio(input(), providers({ crypto: async () => { throw new Error("Unavailable"); } }), now));
    await assert.rejects(valuePortfolio(input(), providers({ fx: async () => ({ rate: null, date: "2026-10-05" }) }), now));
});
test("only the latest completed session is accepted, never current intraday or older bars", async () => {
    for (const quote of [{ kind: "intraday", date: "2026-10-05", price: 100, currency: "USD" },
        { kind: "session_close", date: "2026-10-02", price: 100, currency: "USD" }]) await assert.rejects(valuePortfolio(input(), providers({ close: async () => quote }), now));
    const beforeUSClose = Date.parse("2026-10-05T18:00:00Z");
    let date;
    await valuePortfolio(input({ holdings: [stock] }), providers({ close: async (h, session) => { date = session.date; return { kind: "session_close", date, price: 1, currency: "SEK" }; } }), beforeUSClose);
    assert.equal(date, "2026-10-02");
});
test("crypto source time must be real and at most thirty minutes old", async () => {
    for (const timestamp of [null, "invalid", now - 30 * 60000 - 1, now + 60001]) await assert.rejects(valuePortfolio(input(), providers({ crypto: async () => ({ price: 20, currency: "SEK", timestamp }) }), now));
    await valuePortfolio(input(), providers({ crypto: async () => ({ price: 20, currency: "SEK", timestamp: now - 30 * 60000 }) }), now);
});
test("Lysa and FX use at most seven calendar days, with valid published dates", async () => {
    assert.equal(checkPublishedDate("2026-09-28", now, 7, "NAV"), "2026-09-28");
    for (const date of ["2026-09-27", "2026-10-06", null, "2026-02-30"]) assert.throws(() => checkPublishedDate(date, now, 7, "NAV"));
    await assert.rejects(valuePortfolio(input(), providers({ lysa: async () => ({ price: 5, date: "2026-09-27", kind: "published_nav", currency: "SEK" }) }), now));
    await assert.rejects(valuePortfolio(input(), providers({ fx: async () => ({ rate: 10, date: "2026-09-27" }) }), now));
    await assert.rejects(valuePortfolio(input({ lysa_transactions: [{ type: "Buy", volume: "bad", fundName: "Lysa" }] }), providers(), now));
});
test("unsupported markets and missing currencies block the complete portfolio", async () => {
    await assert.rejects(valuePortfolio(input({ holdings: [{ ...stock, market: "LSE" }] }), providers(), now));
    await assert.rejects(valuePortfolio(input(), providers({ close: async (h, session) => ({ kind: "session_close", date: session.date, price: 1, currency: "GBp" }) }), now));
});
test("dry-run never calls save or outcome and failed valuation never calls save", async () => {
    let writes = 0;
    const database = { input: async () => input(), save: async () => { writes++; return true; }, outcome: async () => { writes++; } };
    assert.equal((await runUserSnapshot({ userId: "u", database, providers: providers(), clock: () => now })).status, "dry_run");
    assert.equal(writes, 0);
    assert.equal((await runUserSnapshot({ userId: "u", database, providers: providers({ crypto: async () => { throw new Error("No crypto quote"); } }), dryRun: false, clock: () => now })).status, "failed");
    assert.equal(writes, 1); // failure outcome only
});
test("worker uses pre-fetch observed_at and revision, accepts atomic superseded result", async () => {
    let saved;
    let status;
    const database = { input: async () => input(), save: async (value) => { saved = value; return false; }, outcome: async (u, date, started, result) => { status = result; } };
    const result = await runUserSnapshot({ userId: "u", database, providers: providers(), dryRun: false, clock: () => now });
    assert.equal(result.status, "superseded");
    assert.equal(status, "superseded");
    assert.equal(saved.observedAt, new Date(now).toISOString());
    assert.equal(saved.revision, "1");
});
test("a changed-input rejection, midnight crossing or expired valuation never reports success", async () => {
    const database = { input: async () => input(), save: async () => { throw new Error("Portfolio inputs changed"); }, outcome: async () => {} };
    assert.equal((await runUserSnapshot({ userId: "u", database, providers: providers(), dryRun: false, clock: () => now })).status, "failed");
    let calls = 0;
    database.save = async () => { throw new Error("Must not write"); };
    for (const later of [now + 21 * 60000, now + 31 * 60000]) {
        calls = 0;
        const result = await runUserSnapshot({ userId: "u", database, providers: providers(), dryRun: false, clock: () => calls++ ? later : now });
        assert.equal(result.status, "failed");
        assert.match(result.reason, /expired/);
    }
});
test("provider reads actual Yahoo close and rejects wrong listing, date or exchange", async () => {
    const response = (result) => ({ ok: true, json: async () => ({ chart: { result: [result] } }) });
    const bar = { meta: { symbol: "AAPL", exchangeName: "NMS", exchangeTimezoneName: "America/New_York", currency: "USD", regularMarketPrice: 999 }, timestamp: [Date.parse("2026-10-05T13:30:00Z") / 1000], indicators: { quote: [{ close: [101] }] } };
    const session = { date: "2026-10-05", market: "USA", zone: "America/New_York" };
    assert.equal((await createSnapshotProviders({ fetcher: async () => response(bar) }).close(stock, session)).price, 101);
    for (const invalid of [{ ...bar, meta: { ...bar.meta, symbol: "OTHER" } }, { ...bar, meta: { ...bar.meta, exchangeName: "LSE" } }, { ...bar, timestamp: [] }]) await assert.rejects(createSnapshotProviders({ fetcher: async () => response(invalid) }).close(stock, session));
});
test("FNSE subscription options and ordinary First North stocks remain exchange-traded", async () => {
    for (const [name, ticker, assetType] of [["DICOT PHARMA AB TO7", "DICOT TO7", "SUBSCRIPTION_OPTION"],
        ["Example First North company", "EXAMPLE", "STOCK"]]) {
        const holding = { id: "fnse", name, ticker, assetType, market: "FNSE", exchange: "FNSE", country: "SE", quantity: 2 };
        assert.equal(isMutualFund(holding), false);
        const symbol = `${ticker.replaceAll(" ", "-")}.ST`;
        const api = createSnapshotProviders({ fetcher: async (url) => {
            assert.match(url, new RegExp(`/chart/${symbol.replaceAll(".", "\\.")}\\?`));
            return { ok: true, json: async () => ({ chart: { result: [{
                meta: { symbol, exchangeName: "STO", exchangeTimezoneName: "Europe/Stockholm", currency: "SEK" },
                timestamp: [Date.parse("2026-10-05T07:00:00Z") / 1000], indicators: { quote: [{ close: [3] }] },
            }] } }) };
        } });
        const result = await valuePortfolio(input({ holdings: [holding], manual_assets: [], lysa_transactions: [] }), api, now);
        assert.equal(result.totalValueSek, 6);
        assert.equal(result.sources[0].kind, "session_close");
        assert.equal(result.sources[0].date, "2026-10-05");
    }
});
test("FNSE still requires a ticker, and unknown Swedish listing codes remain blocked", () => {
    const api = createSnapshotProviders({ fetcher: async () => assert.fail("Invalid listing must not fetch") });
    const session = { market: "STOCKHOLM" };
    assert.throws(() => api.close({ market: "FNSE", country: "SE", assetType: "SUBSCRIPTION_OPTION", ticker: null }, session),
        (error) => error.diagnostics.listing.issues[0].field === "ticker");
    for (const market of [null, "UNKNOWN_SWEDISH_MARKET"]) {
        assert.throws(() => api.close({ market, country: "SE", assetType: "SUBSCRIPTION_OPTION", ticker: "EXAMPLE" }, session),
            (error) => error.diagnostics.listing.issues.some((issue) => issue.field === "market"));
    }
});
test("XSAT stocks use verified Swedish session closes without instrument-name special cases", async () => {
    for (const [name, ticker] of [["Plejd", "PLEJD"], ["Example Spotlight company", "EXAMPLE"]]) {
        const holding = { id: "xsat", name, ticker, assetType: "STOCK", market: "XSAT", exchange: "XSAT", country: "SE", quantity: 2 };
        assert.equal(isMutualFund(holding), false);
        const api = createSnapshotProviders({ fetcher: async (url) => {
            assert.ok(url.includes(`/chart/${ticker}.ST?`));
            return { ok: true, json: async () => ({ chart: { result: [{
                meta: { symbol: `${ticker}.ST`, exchangeName: "STO", exchangeTimezoneName: "Europe/Stockholm", currency: "SEK" },
                timestamp: [Date.parse("2026-10-05T07:00:00Z") / 1000], indicators: { quote: [{ close: [3] }] },
            }] } }) };
        } });
        const result = await valuePortfolio(input({ holdings: [holding], manual_assets: [], lysa_transactions: [] }), api, now);
        assert.equal(result.totalValueSek, 6);
        assert.equal(result.sources[0].kind, "session_close");
        assert.equal(result.sources[0].date, "2026-10-05");
    }
});
test("XSAT still requires ticker and market, and unknown listing codes remain blocked", () => {
    const api = createSnapshotProviders({ fetcher: async () => assert.fail("Invalid listing must not fetch") });
    const session = { market: "STOCKHOLM" };
    assert.throws(() => api.close({ market: "XSAT", country: "SE", assetType: "STOCK", ticker: null }, session),
        (error) => error.diagnostics.listing.issues[0].field === "ticker");
    for (const market of [null, "UNKNOWN_SWEDISH_MARKET"]) {
        assert.throws(() => api.close({ market, exchange: "XSAT", country: "SE", assetType: "STOCK", ticker: "EXAMPLE" }, session),
            (error) => error.diagnostics.listing.issues.some((issue) => issue.field === "market"));
    }
});
test("listing diagnostics distinguish missing ticker, missing market and unsupported market without fetching", () => {
    const api = createSnapshotProviders({ fetcher: async () => assert.fail("Invalid listing must not fetch") });
    const session = { market: "STOCKHOLM" };
    for (const [holding, expected] of [
        [{ ...stock, ticker: null }, [["ticker", "missing"]]],
        [{ ...stock, market: null }, [["market", "missing"]]],
        [{ ...stock, market: "UNKNOWN_SWEDISH_MARKET" }, [["market", "unsupported"]]],
        [{ ...stock, ticker: "", market: "UNKNOWN" }, [["ticker", "missing"], ["market", "unsupported"]]],
    ]) {
        assert.throws(() => api.close(holding, session), (error) => {
            assert.equal(error.message, "Unsupported/missing listing identifier");
            assert.equal(error.diagnostics.code, "UNSUPPORTED_LISTING_IDENTIFIER");
            assert.deepEqual(error.diagnostics.listing.issues.map((issue) => [issue.field, issue.issue]), expected);
            assert.equal(error.diagnostics.listing.calendarCode, "STOCKHOLM");
            return true;
        });
    }
});
test("listing failure exposes the actual instrument and exact attempted code in dry-run and log", async () => {
    const holding = snapshotHoldingFromDatabase({ id: "listed", name: "Example certificate", ticker: "EXAMPLE", instrument_id: "42",
        provider: "Avanza", asset_type: "CERTIFICATE", exchange: "Unknown exchange", market: "UNKNOWN_SWEDISH_MARKET", country: "SE", isin: "SE-EXAMPLE", quantity: 1 });
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        database: { input: async () => input({ holdings: [holding] }), save: async () => assert.fail("Must not save"), outcome: async () => assert.fail("Dry-run must not record") },
        providers: createSnapshotProviders({ fetcher: async () => assert.fail("Must not fetch") }), logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "Unsupported/missing listing identifier");
    assert.deepEqual(result.diagnostics.instrument, { name: "Example certificate", ticker: "EXAMPLE", instrumentId: "42", provider: "Avanza",
        assetType: "CERTIFICATE", exchange: "Unknown exchange", market: "UNKNOWN_SWEDISH_MARKET", country: "SE", isin: "SE-EXAMPLE" });
    assert.equal(result.diagnostics.listing.issues[0].attemptedCode, "UNKNOWN_SWEDISH_MARKET");
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
});
test("provider crypto ID, timestamp and request deduplication are retained", async () => {
    let calls = 0;
    const provider = createSnapshotProviders({ fetcher: async (url) => {
        calls++;
        assert.match(url, /include_last_updated_at=true/);
        return { ok: true, json: async () => ({ bitcoin: { sek: 20, last_updated_at: now / 1000 } }) };
    } });
    assert.equal((await provider.crypto(coin)).timestamp, now / 1000);
    await provider.crypto(coin);
    assert.equal(calls, 1);
    assert.throws(() => provider.crypto({ ticker: "UNKNOWN" }));
});
test("provider rejects unknown Lysa fund, FX base mismatch and transport errors without leaking URLs", async () => {
    const provider = createSnapshotProviders({ fetcher: async () => { throw new Error("URL with secret"); } });
    await assert.rejects(provider.crypto(coin), { message: "Market provider unavailable or timed out" });
    await assert.rejects(provider.lysa("Unknown fund"));
    await assert.rejects(createSnapshotProviders({ fetcher: async () => ({ ok: true, json: async () => ({ base: "EUR", date: "2026-10-05", rates: { SEK: 10 } }) }) }).fx("USD"));
});
test("provider budget stops large portfolios instead of exceeding the Edge runtime", async () => {
    let time = 0;
    const provider = createSnapshotProviders({ clock: () => time, budgetMs: 10, fetcher: async () => { throw new Error("Should never fetch"); } });
    time = 11;
    await assert.rejects(provider.crypto(coin), /budget exhausted/);
});
