import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { latestCompletedSession } from "../supabase/functions/_shared/marketCalendar.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
const now = Date.parse("2026-10-05T21:30:00Z");
function bar(symbol, session) { return { chart: { result: [{ meta: { symbol, currency: session.market === "USA" ? "USD" : "SEK",
    exchangeName: session.market === "USA" ? "NYQ" : "STO", exchangeTimezoneName: session.zone },
    timestamp: [session.opensAt / 1000], indicators: { quote: [{ close: [100] }] } }] } }; }

test("US single-letter share classes use Yahoo hyphens without mutating holdings", async () => {
    const session = latestCompletedSession("USA", now);
    for (const [ticker, symbol] of [["BRK.B", "BRK-B"], ["BRK.A", "BRK-A"], ["BF.B", "BF-B"], ["BF.A", "BF-A"], ["EXAMPLE.C", "EXAMPLE-C"]]) {
        const holding = Object.freeze({ ticker, market: "XNAS", assetType: "STOCK" });
        const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => {
            assert.equal(decodeURIComponent(new URL(url).pathname.split("/").at(-1)), symbol);
            return new Response(JSON.stringify(bar(symbol, session)));
        } });
        const quote = await providers.close(holding, session);
        assert.equal(quote.price, 100); assert.equal(quote.date, session.date); assert.equal(holding.ticker, ticker);
    }
});

test("Yahoo market suffixes and already normalized share-class symbols are preserved", async () => {
    for (const [market, ticker, symbol] of [["USA", "AAPL", "AAPL"], ["USA", "BRK-B", "BRK-B"], ["USA", "ABC.PA", "ABC.PA"],
        ["STOCKHOLM", "EXAMPLE.ST", "EXAMPLE.ST"], ["STOCKHOLM", "EXAMPLE.B.ST", "EXAMPLE-B.ST"],
        ["STOCKHOLM", "EXAMPLE.B", "EXAMPLE-B.ST"], ["STOCKHOLM", "INVESTOR B", "INVESTOR-B.ST"]]) {
        const session = latestCompletedSession(market, now);
        const providers = createSnapshotProviders({ clock: () => now, fetcher: async (url) => {
            assert.equal(decodeURIComponent(new URL(url).pathname.split("/").at(-1)), symbol);
            return new Response(JSON.stringify(bar(symbol, session)));
        } });
        await providers.close({ ticker, market: market === "USA" ? "XNYS" : "XSTO", assetType: "STOCK" }, session);
    }
});

test("normalized Yahoo request still requires exact response-symbol verification", async () => {
    const session = latestCompletedSession("USA", now);
    const providers = createSnapshotProviders({ clock: () => now, fetcher: async () => new Response(JSON.stringify(bar("BRK.B", session))) });
    await assert.rejects(providers.close({ ticker: "BRK.B", market: "XNYS", assetType: "STOCK" }, session), /Unverified Yahoo instrument/);
});

test("HTTP diagnostics retain internal ticker while exposing the actual Yahoo class symbol", async () => {
    const holding = Object.freeze({ ticker: "BRK.B", market: "XNAS", provider: "Avanza", assetType: "STOCK", quantity: 1 });
    const result = await runUserSnapshot({ userId: "u", clock: () => now,
        providers: createSnapshotProviders({ clock: () => now, fetcher: async () => new Response("Not found", { status: 404 }) }),
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) }, logger: { warn() {} } });
    assert.equal(result.diagnostics.normalizedSymbol, "BRK-B");
    assert.equal(result.diagnostics.instrument.ticker, "BRK.B"); assert.equal(holding.ticker, "BRK.B");
});
