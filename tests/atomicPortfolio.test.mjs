import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveMarketApiUrl } from "../src/services/marketApiFetch.js";
import { runAtomicQuoteRefresh, mergeQuoteRefresh, portfolioDisplayValue } from "../src/utils/atomicQuoteRefresh.js";
import { calculatePortfolioDailyChange } from "../src/utils/portfolioDailyChange.js";
import { calculateDailyMovers } from "../src/utils/dashboardHistory.js";
import { validateValuationFreshness } from "../src/utils/valuationFreshness.js";

const now = Date.parse("2026-10-08T12:00:00Z");
const holding = (id, price = 110) => ({ id, isin: id, name: id, market: "XSTO", assetType: "STOCK", currency: "SEK",
    quantity: 10, currentPrice: price, currentValueSek: price * 10, previousClose: 100, priceUpdatedAt: now });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("production defaults to the configured Supabase project and cannot silently use localhost", () => {
    assert.equal(resolveMarketApiUrl({ development: false, supabaseUrl: "https://project.supabase.co/" }), "https://project.supabase.co/functions/v1/market-api");
    assert.equal(resolveMarketApiUrl({ development: true }), "http://localhost:3001");
    assert.equal(resolveMarketApiUrl({ development: false, configuredUrl: " https://api.example.test/ " }), "https://api.example.test");
    assert.throws(() => resolveMarketApiUrl({ development: false }), /MARKET_API_CONFIGURATION_MISSING/);
});

test("actual App refresh stages Supabase save results and calls setHoldings only once at batch completion", async () => {
    const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("    const performHoldingPriceUpdate ="), source.indexOf("    const enrichHoldingSmart ="));
    const originals = [holding("a"), holding("b")];
    const waits = originals.map(deferred);
    const referenceWaits = originals.map(deferred);
    let writes = 0, state = originals, inProgress = 0, publication = null;
    const context = {
        holdings: originals, userId: "u", session: { user: { id: "u" } }, activeUser: { current: "u" },
        quoteChecks: {}, PRICE_UPDATE_INTERVAL: 1200000, VERIFIED_QUOTE_MAX_AGE: 1200000,
        localStorage: { getItem: () => null, setItem() {} }, quoteProviders: {},
        displayedValueRef: { current: { userId: "u", value: 2200 } }, setRefreshDisplay() {},
        setPriceUpdatesInProgress(fn) { inProgress = fn(inProgress); },
        runPriceRefresh: async (_user, operation) => operation(),
        createVerifiedQuoteBatch: () => async () => ({ price: 120, previousClose: 100, currency: "SEK", timestamp: now, checkedAt: now }),
        normalizeQuoteTimestamp: (value) => value, quoteFreshnessReason: () => null,
        quoteValuationKey: (h) => JSON.stringify(h),
        getExchangeRate() { assert.fail("SEK must not fetch FX"); },
        getHoldingDailyReference: (h) => referenceWaits[originals.findIndex(item => item.id === h.id)].promise,
        updateDatabaseHoldingQuote: (id, h) => waits[originals.findIndex((item) => item.id === id)].promise.then(() => ({ data: h, error: null })),
        setHoldings(fn) { writes++; state = fn(state); }, setQuoteChecks() {},
        setQuotePublication(value) { publication = value; },
        getLysaFundPrices: async () => ({}), setLysaFundPrices() {}, setLysaQuoteCheck() {},
        runAtomicQuoteRefresh, mergeQuoteRefresh,
    };
    const update = new Function("context", `const { ${Object.keys(context).join(",")} } = context;\n${body}\nreturn updateAllHoldingPrices;`)(context);
    const pending = update(true, now);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(inProgress, 1);
    waits[0].resolve(); await Promise.resolve(); await Promise.resolve();
    referenceWaits[0].resolve({});
    assert.equal(writes, 0);
    assert.equal(state, originals);
    assert.equal(publication, null, 'no live endpoint before the atomic publication');
    waits[1].resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(writes, 0, 'FX/NAV comparison must finish before the same atomic publication');
    referenceWaits[1].resolve({}); await pending;
    assert.equal(writes, 1);
    assert.equal(inProgress, 0);
    assert.equal(publication.userId, 'u');
    assert.equal(Number.isFinite(publication.observedAt), true);
    assert.deepEqual(state.map((h) => h.currentValueSek), [1200, 1200]);
});

test("parallel requests publish once only after the last save finishes, preserving failed positions", async () => {
    const originals = [holding("a"), holding("b"), holding("c")];
    const waits = originals.map(deferred);
    let commits = 0, state = originals, merged;
    const job = runAtomicQuoteRefresh({ holdings: originals, concurrency: 3,
        refresh: (h) => waits[originals.indexOf(h)].promise,
        commit(results) { commits++; merged = mergeQuoteRefresh(state, results, "u"); state = merged.holdings; } });
    waits[1].resolve({ holding: holding("b", 120), checkedAt: now });
    waits[2].reject(new Error("offline"));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(commits, 0);
    assert.equal(state, originals);
    waits[0].resolve({ holding: holding("a", 130), checkedAt: now });
    await job;
    assert.equal(commits, 1);
    assert.deepEqual(state.map((h) => h.currentValueSek), [1300, 1200, 1100]);
    assert.equal(state[2].priceUpdatedAt, originals[2].priceUpdatedAt);
    assert.equal(state[2].quoteStale, true);
    assert.equal(merged.checks.c.success, false);
    assert.equal(validateValuationFreshness({ holdings: state, checks: merged.checks, userId: "u" }, now).ready, false);
    assert.equal(calculateDailyMovers(state, now).excluded, 1);
});

test("bounded parallelism, user change and concurrent holding edits do not publish stale batches", async () => {
    let running = 0, maximum = 0, commits = 0;
    await runAtomicQuoteRefresh({ holdings: Array.from({ length: 36 }, (_, i) => holding(String(i))), concurrency: 6,
        async refresh(h) { running++; maximum = Math.max(maximum, running); await Promise.resolve(); running--; return { holding: h, checkedAt: now }; },
        commit() { commits++; } });
    assert.equal(maximum, 6); assert.equal(commits, 1);
    let active = true;
    const wait = deferred();
    const job = runAtomicQuoteRefresh({ holdings: [holding("a")], refresh: () => wait.promise, isCurrent: () => active,
        commit() { assert.fail("old user published"); } });
    active = false; wait.resolve({ holding: holding("a", 999) }); await job;
    const original = holding("a");
    const edited = { ...original, quantity: 20, currentValueSek: 2200 };
    const result = mergeQuoteRefresh([edited, holding("new")], [{ original, holding: holding("a", 999), checkedAt: now }], "u");
    assert.equal(result.holdings[0].quantity, 20);
    assert.equal(result.holdings[0].currentValueSek, 2200);
    assert.equal(result.holdings[1].id, "new");
    assert.equal(result.checks.a.success, false);
    assert.deepEqual(mergeQuoteRefresh([], [{ original, holding: original }], "u").holdings, []);
});

test("saved total is shown during loading and frozen during refresh without partial totals or cross-user reuse", () => {
    const options = { userId: "u", currentValue: 200, savedValue: 1000, valuesLoading: true };
    assert.equal(portfolioDisplayValue(options), 1000);
    assert.equal(portfolioDisplayValue({ ...options, savedValue: null }), null);
    for (const currentValue of [200, 500, 1100]) {
        assert.equal(portfolioDisplayValue({ ...options, currentValue, valuesLoading: false, updating: true,
            refreshDisplay: { userId: "u", value: 1000 } }), 1000);
    }
    assert.equal(portfolioDisplayValue({ ...options, currentValue: 1100, valuesLoading: false, updating: false }), 1100);
    assert.equal(portfolioDisplayValue({ ...options, updating: true, refreshDisplay: { userId: "other", value: 9999 } }), 1000);
});

test("daily portfolio movement includes every position and uses prior portfolio value as percentage denominator", () => {
    const holdings = Array.from({ length: 36 }, (_, i) => holding(String(i), i < 20 ? 110 : 90));
    const result = calculatePortfolioDailyChange({ holdings }, now);
    assert.equal(result.complete, true);
    assert.equal(result.changeSek, 400);
    assert.ok(Math.abs(result.changePercent - 400 / 36000 * 100) < 1e-10);
    assert.equal(result.coveragePercent, 100);
    const losers = calculatePortfolioDailyChange({ holdings: [holding("a", 90)] }, now);
    assert.equal(losers.changeSek, -100);
    assert.ok(Math.abs(losers.changePercent + 10) < 1e-10);
});

test("partial data, foreign FX, NAV, manual values and today's flows never yield an exact full-portfolio return", () => {
    for (const extra of [{ ...holding("b"), previousClose: null }, { ...holding("b"), quoteStale: true },
        { ...holding("b"), currency: "USD" }, { ...holding("b"), assetType: "FUND", market: "FUND" },
        { ...holding("b"), currentValueSek: null }, { ...holding("b"), priceUpdatedAt: now - 86400000 }]) {
        const result = calculatePortfolioDailyChange({ holdings: [holding("a"), extra] }, now);
        assert.equal(result.complete, false);
        assert.equal(result.changeSek, null);
        assert.equal(result.changePercent, null);
        assert.ok(result.reasons.length > 0);
    }
    const partial = calculatePortfolioDailyChange({ holdings: [holding("a"), { ...holding("b"), previousClose: null }] }, now);
    assert.equal(partial.coveragePercent, 50);
    for (const extra of [{ manualAssets: [{ source: "manual", value: 100 }] },
        { transactions: [{ date: new Date(now).toISOString(), type: "BUY", quantity: 100 }] },
        { lysaTransactions: [{ date: "2026-10-08", type: "deposit", amount: 10000 }] }]) {
        assert.equal(calculatePortfolioDailyChange({ holdings: [holding("a")], ...extra }, now).complete, false);
    }
    assert.equal(calculatePortfolioDailyChange({ holdings: [holding("a")], transactions: [{ date: "2026-10-07", type: "BUY" }] }, now).complete, true);
});
