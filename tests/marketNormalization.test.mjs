import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMarketCode, holdingMarket, latestCompletedSession } from "../supabase/functions/_shared/marketCalendar.js";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
const now = Date.parse("2026-10-05T21:30:00Z");
const session = latestCompletedSession("STOCKHOLM", now);
const names = ["Stockholmsb\u00f6rsen", "Stockholmsb\u00c3\u00b6rsen", "Stockholmsb\u00c3\u0192\u00c2\u00b6rsen",
    "STOCKHOLMSB\u00c3\u2013RSEN"];
const holding = { ticker: "EXAMPLE", instrumentId: "A42", isin: "SE000EXAMPLE1", assetType: "STOCK", quantity: 1 };
function yahoo() { return { chart: { result: [{ meta: { symbol: "EXAMPLE.ST", currency: "SEK", exchangeName: "STO",
    exchangeTimezoneName: session.zone }, timestamp: [session.opensAt / 1000], indicators: { quote: [{ close: [100] }] } }] } }; }

test("Stockholm market name, Latin-1/Windows-1252 mojibake and double encoding normalize before mapping", () => {
    for (const name of names) {
        assert.equal(normalizeMarketCode(name), "XSTO");
        assert.equal(normalizeMarketCode(`  ${name}  `), "XSTO");
        assert.equal(holdingMarket({ market: name, assetType: "STOCK" }), "STOCKHOLM");
        assert.equal(normalizeMarketCode(normalizeMarketCode(name)), "XSTO");
    }
});

test("existing Swedish market codes remain intact and retain Stockholm calendar", () => {
    for (const code of ["XSTO", "ST", "STOCKHOLM", "FNSE", "XSAT", "SPSD"]) {
        assert.equal(normalizeMarketCode(code), code);
        assert.equal(normalizeMarketCode(` ${code.toLowerCase()} `), code);
        assert.equal(holdingMarket({ market: code, assetType: "STOCK" }), "STOCKHOLM");
    }
});

test("UTF-8 and mojibake Swedish listings reach verified stock valuation without country inference", async () => {
    for (const market of names) {
        const result = await runUserSnapshot({ userId: "u", clock: () => now,
            providers: createSnapshotProviders({ clock: () => now, fetcher: async () => new Response(JSON.stringify(yahoo())) }),
            database: { input: async () => ({ ready: true, holdings: [{ ...holding, market, exchange: market }], manual_assets: [], lysa_transactions: [] }) } });
        assert.equal(result.status, "dry_run"); assert.equal(result.totalValueSek, 100);
    }
});

test("broker consistency uses the same normalized market for holding and candidate without merging First North/Spotlight", async () => {
    for (const [requested, candidate] of [[names[0], "XSTO"], ["XSTO", names[1]], [names[1], names[0]]]) {
        const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => url.includes("avanza")
            ? new Response(JSON.stringify({ orderbookId: "A42", isin: holding.isin, tickerSymbol: holding.ticker, market: candidate,
                quote: { last: 100, currency: "SEK", timestamp: session.closesAt } })) : new Response("Not found", { status: 404 }) });
        const quote = await providers.close({ ...holding, provider: "Avanza", assetType: "CERTIFICATE", market: requested }, session);
        assert.equal(quote.provider, "Avanza");
    }
    for (const candidate of ["FNSE", "XSAT"]) {
        const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => url.includes("avanza")
            ? new Response(JSON.stringify({ orderbookId: "A42", isin: holding.isin, market: candidate,
                quote: { last: 100, currency: "SEK", timestamp: session.closesAt } })) : new Response("Not found", { status: 404 }) });
        await assert.rejects(providers.close({ ...holding, provider: "Avanza", assetType: "ETP", market: names[0] }, session),
            (error) => error.diagnostics.attempts[0].identityVerification.checks[0].failedChecks.includes("market mismatch"));
    }
});

test("unknown and corrupted unknown market names still fail listing validation before fetch", () => {
    const providers = createSnapshotProviders({ fetcher: () => assert.fail("Unknown market must not fetch") });
    for (const market of ["UNKNOWN", "Unknownb\u00c3\u00b6rsen", "Stockholmsb\u00f6rsen-UNKNOWN", "Stockholmsb\ufffdrsen"]) {
        assert.throws(() => providers.close({ ...holding, market, country: "SE" }, session), /listing identifier/);
    }
});

test("SPSD certificates use shared Stockholm calendar and verified exchange-traded broker valuation", async () => {
    const certificate = { ...holding, name: "Example certificate SEK", ticker: "EXAMPLE C SEK", assetType: "CERTIFICATE",
        provider: "Avanza", market: "SPSD", exchange: "SPSD" };
    assert.equal(holdingMarket(certificate), "STOCKHOLM");
    const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => url.includes("avanza")
        ? new Response(JSON.stringify({ orderbookId: "A42", isin: certificate.isin, tickerSymbol: certificate.ticker, market: "SPSD",
            quote: { last: 100, currency: "SEK", timestamp: session.closesAt + 30 * 60000 } })) : new Response("Not found", { status: 404 }) });
    providers.fund = () => assert.fail("Certificate must not use NAV");
    providers.crypto = () => assert.fail("Certificate must not use direct crypto");
    const result = await runUserSnapshot({ userId: "u", clock: () => now, providers,
        database: { input: async () => ({ ready: true, holdings: [certificate], manual_assets: [], lysa_transactions: [] }) } });
    assert.equal(result.status, "dry_run"); assert.equal(result.totalValueSek, 100);
    assert.equal(result.sources[0].kind, "session_close"); assert.equal(result.sources[0].date, session.date);
    assert.equal(result.sources[0].sourceMetadata.provenance, "broker_latest_after_close");
});

test("SPSD still requires ticker and explicit market; unknown Swedish codes cannot fetch", () => {
    const providers = createSnapshotProviders({ fetcher: () => assert.fail("Invalid listing must not fetch") });
    for (const input of [{ market: "SPSD", ticker: null }, { market: null, ticker: "EXAMPLE" }, { market: "UNKNOWN", ticker: "EXAMPLE" }]) {
        assert.throws(() => providers.close({ ...holding, assetType: "CERTIFICATE", country: "SE", ...input }, session),
            (error) => error.diagnostics.code === "UNSUPPORTED_LISTING_IDENTIFIER");
    }
});

test("SPSD does not become interchangeable with other listings sharing Stockholm calendar", async () => {
    const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => url.includes("avanza")
        ? new Response(JSON.stringify({ orderbookId: "A42", isin: holding.isin, market: "XSAT",
            quote: { last: 100, currency: "SEK", timestamp: session.closesAt } })) : new Response("Not found", { status: 404 }) });
    await assert.rejects(providers.close({ ...holding, assetType: "CERTIFICATE", provider: "Avanza", market: "SPSD" }, session),
        (error) => error.diagnostics.attempts[0].identityVerification.checks[0].failedChecks.includes("market mismatch"));
});
