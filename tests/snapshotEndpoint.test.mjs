import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { snapshotHoldingFromDatabase } from "../supabase/functions/_shared/snapshotEngine.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { zonedParts } from "../supabase/functions/_shared/marketCalendar.js";

// Execute the actual handler with an isolated SDK and environment; no network or remote writes.
const source = stripTypeScriptTypes(await readFile(new URL("../supabase/functions/daily-portfolio-snapshot/index.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "");
const secret = "test-secret-at-least-thirty-two-characters";
function handler({ enabled = "false", ready = true, users = [{ user_id: "user1" }], previous = null,
    holdings = [],
    providerOverrides = {},
    now = Date.parse("2026-10-05T21:30:00Z") } = {}) {
    const rpcCalls = [];
    const tables = [];
    const logs = [];
    const admin = {
        from(table) {
            tables.push(table);
            const builder = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, gt() { return this; },
                maybeSingle: async () => ({ data: previous }), then(resolve) { return Promise.resolve({ data: users }).then(resolve); } };
            return builder;
        },
        async rpc(name, args) {
            rpcCalls.push({ name, args });
            if (name === "get_portfolio_snapshot_input") return { data: { ready, revision: "7", holdings, manual_assets: [{ value_sek: 123 }], lysa_transactions: [] } };
            return { data: true };
        },
    };
    let serve;
    const env = { SNAPSHOT_CRON_SECRET: secret, SNAPSHOT_WRITES_ENABLED: enabled, SUPABASE_URL: "http://localhost", SUPABASE_SERVICE_ROLE_KEY: "local-fixture-only" };
    class FixedDate extends Date { static now() { return now; } }
    new Function("createClient", "snapshotHoldingFromDatabase", "createSnapshotProviders", "runUserSnapshot", "zonedParts", "Deno", "Date", source)(
        () => admin, snapshotHoldingFromDatabase, () => providerOverrides, (options) => runUserSnapshot({ ...options, clock: () => now, logger: { warn: (...args) => logs.push(args) } }), zonedParts,
        { env: { get: (name) => env[name] }, serve: (callback) => { serve = callback; } },
        FixedDate,
    );
    return { serve, rpcCalls, tables, logs };
}
test("HTTP dry-run includes instrument diagnostics for unsupported calendar without writes", async () => {
    const app = handler({ holdings: [{ name: "London stock", ticker: "TEST", instrument_id: "42", market: "LSE", quantity: 1, asset_type: "STOCK" }] });
    const response = await app.serve(request({ userId: "user1" }));
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    assert.equal(result.diagnostics.instrument.name, "London stock");
    assert.equal(result.diagnostics.instrument.instrumentId, "42");
    assert.equal(result.diagnostics.instrument.exchange, "LSE");
    assert.equal(result.diagnostics.instrument.calendarCode, null);
    assert.equal(app.logs.length, 1);
    assert.deepEqual(app.rpcCalls.map((call) => call.name), ["get_portfolio_snapshot_input"]);
});
const request = (body = {}, suppliedSecret = secret, method = "POST") => new Request("http://localhost/functions/v1/daily-portfolio-snapshot", {
    method, headers: { "Content-Type": "application/json", "x-snapshot-secret": suppliedSecret }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
});
test("HTTP dry-run exposes provider HTTP diagnostics and logs them without writes", async () => {
    const app = handler({ holdings: [{ name: "Example stock", ticker: "EXAMPLE", instrument_id: "123", provider: "Avanza", asset_type: "STOCK", market: "XSAT", country: "SE", quantity: 1 }],
        providerOverrides: createSnapshotProviders({ fetcher: async () => new Response('{"message":"Not found"}', { status: 404 }) }) });
    const response = await app.serve(request({ userId: "user1" }));
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    assert.equal(result.diagnostics.marketProvider, "Yahoo");
    assert.equal(result.diagnostics.httpStatus, 404);
    assert.equal(result.diagnostics.normalizedSymbol, "EXAMPLE.ST");
    assert.equal(result.diagnostics.instrument.provider, "Avanza");
    assert.deepEqual(app.logs[0][1], { userId: "user1", ...result.diagnostics });
    assert.deepEqual(app.rpcCalls.map((call) => call.name), ["get_portfolio_snapshot_input"]);
});
test("HTTP dry-run returns full listing diagnostics and logs the same failed instrument", async () => {
    const app = handler({ holdings: [{ name: "Listed stock", ticker: null, instrument_id: "123", provider: "Nordnet",
        asset_type: "STOCK", market: "US", country: "US", isin: "US-EXAMPLE", quantity: 1 }],
        providerOverrides: createSnapshotProviders({ fetcher: async () => assert.fail("Must not fetch") }) });
    const response = await app.serve(request({ userId: "user1" }));
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    assert.equal(result.diagnostics.code, "UNSUPPORTED_LISTING_IDENTIFIER");
    assert.equal(result.diagnostics.instrument.name, "Listed stock");
    assert.equal(result.diagnostics.instrument.provider, "Nordnet");
    assert.equal(result.diagnostics.instrument.assetType, "STOCK");
    assert.deepEqual(result.diagnostics.listing.issues, [{ field: "ticker", issue: "missing", value: null }]);
    assert.deepEqual(app.logs[0][1], { userId: "user1", ...result.diagnostics });
    assert.deepEqual(app.rpcCalls.map((call) => call.name), ["get_portfolio_snapshot_input"]);
});
test("HTTP dry-run values a Kavaljer-like FUND through NAV without calendar diagnostics", async () => {
    const app = handler({ holdings: [{ id: "fund", name: "Kavaljer Quality Focus A SEK", instrument_id: "123", provider: "Nordnet",
        market: "FUND", country: "LU", quantity: 2, asset_type: "FUND", product_type: "FUND" }],
        providerOverrides: { fund: async (holding) => {
            assert.equal(holding.provider, "Nordnet");
            return { kind: "published_nav", price: 10, currency: "SEK", timestamp: "2026-10-02" };
        } } });
    const result = (await (await app.serve(request({ userId: "user1" }))).json()).results[0];
    assert.equal(result.status, "dry_run");
    assert.equal(result.totalValueSek, 143);
    assert.equal(result.sources[0].kind, "published_nav");
    assert.equal(result.diagnostics, undefined);
    assert.deepEqual(app.logs, []);
    assert.deepEqual(app.rpcCalls.map((call) => call.name), ["get_portfolio_snapshot_input"]);
});
test("Edge endpoint denies wrong or missing secrets before accessing any user data", async () => {
    const app = handler();
    for (const supplied of ["", "wrong-secret"]) assert.equal((await app.serve(request({}, supplied))).status, 401);
    assert.equal((await app.serve(request({}, secret, "GET"))).status, 405);
    assert.deepEqual(app.tables, []);
    assert.deepEqual(app.rpcCalls, []);
});
test("server write switch cannot be overridden by a caller, default endpoint is dry-run", async () => {
    const app = handler();
    const response = await app.serve(request({ dryRun: false, userId: "user1" }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.results[0].status, "dry_run");
    assert.equal(body.results[0].totalValueSek, 123);
    assert.deepEqual(app.rpcCalls.map((call) => call.name), ["get_portfolio_snapshot_input"]);
});
test("invalid JSON is rejected, and not-ready inputs never call the save RPC", async () => {
    const app = handler({ ready: false });
    const invalid = new Request("http://localhost", { method: "POST", headers: { "x-snapshot-secret": secret }, body: "{" });
    assert.equal((await app.serve(invalid)).status, 500);
    const response = await app.serve(request({ userId: "user1" }));
    assert.equal((await response.json()).results[0].status, "failed");
    assert.equal(app.rpcCalls.some((call) => call.name === "save_server_portfolio_daily_value"), false);
});
test("bounded endpoint batch exposes continuation and queues it only when requested", async () => {
    const app = handler();
    const response = await app.serve(request({ continue: true }));
    const result = await response.json();
    assert.equal(result.nextCursor, "user1");
    const queued = app.rpcCalls.find((call) => call.name === "enqueue_portfolio_snapshot_batch");
    assert.deepEqual(queued.args, { p_after_user_id: "user1", p_dry_run: true });
    const last = handler({ users: [] });
    assert.equal((await (await last.serve(request({ continue: true, afterUserId: "user1" }))).json()).nextCursor, null);
});
test("enabled worker writes closing snapshots only after 23:30 Stockholm", async () => {
    const early = handler({ enabled: "true", now: Date.parse("2026-10-05T20:00:00Z") });
    assert.equal((await early.serve(request({ dryRun: false }))).status, 409);
    assert.deepEqual(early.tables, []);
    const late = handler({ enabled: "true" });
    const result = await (await late.serve(request({ dryRun: false, userId: "user1" }))).json();
    assert.equal(result.dryRun, false);
    assert.equal(result.results[0].status, "saved");
    assert.equal(late.rpcCalls.filter((call) => call.name === "save_server_portfolio_daily_value").length, 1);
});
test("completed server run skips valuation, failed run retries despite client history", async () => {
    for (const status of ["saved", "superseded"]) {
        const app = handler({ enabled: "true", previous: { status } });
        assert.deepEqual((await (await app.serve(request({ dryRun: false }))).json()).results, []);
        assert.deepEqual(app.rpcCalls, []);
    }
    const failed = handler({ enabled: "true", previous: { status: "failed" } });
    assert.equal((await (await failed.serve(request({ dryRun: false }))).json()).results[0].status, "saved");
});
