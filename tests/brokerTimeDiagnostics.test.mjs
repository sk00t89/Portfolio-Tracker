import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { latestCompletedSession } from "../supabase/functions/_shared/marketCalendar.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
const observed = Date.parse("2026-10-05T21:30:00Z");
const session = latestCompletedSession("STOCKHOLM", observed);
const holding = { name: "Example ETP", ticker: "ETP", provider: "Avanza", instrumentId: "A42", isin: "SE000EXAMPLE1",
    assetType: "CERTIFICATE", market: "XSTO", country: "SE", quantity: 1 };
function providersFor(rawTimestamp, now = observed) {
    return createSnapshotProviders({ clock: () => now, fetcher: async (url) => {
        if (url.includes("stock/A42")) return new Response(JSON.stringify({ orderbookId: "A42", isin: holding.isin,
            quote: { last: "123,45", currency: "SEK", timestamp: rawTimestamp }, headers: { Authorization: "secret-header" } }));
        if (url.includes("instrument_search")) return new Response(JSON.stringify({ results: [{ instrument_info: {
            instrument_id: "N99", isin: holding.isin, currency: "SEK",
        } }] }));
        if (url.includes("instruments/price/N99")) return new Response(JSON.stringify([{ instrument_id: "N99", last: 123.45, tick_timestamp: rawTimestamp }]));
        return new Response('{"message":"Not found"}', { status: 404 });
    } });
}
async function failure(rawTimestamp, now = observed, requestedSession = session) {
    try { await providersFor(rawTimestamp, now).close(holding, requestedSession); assert.fail("Expected rejection"); }
    catch (error) { assert.equal(error.diagnostics?.code, "LISTED_PRODUCT_CLOSE_UNAVAILABLE"); return error.diagnostics; }
}
const checks = (diagnostics) => diagnostics.attempts.filter((attempt) => attempt.provider !== "Yahoo").map((attempt) => attempt.timeVerification[0]);

test("dry-run and log include per-broker raw quote, normalized time, latest session, window and exact delta", async () => {
    const rawTimestamp = "2026-10-05T18:45:00+02:00";
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => observed, providers: providersFor(rawTimestamp),
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }),
            save: () => assert.fail("No write") }, logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed");
    const times = checks(result.diagnostics); assert.equal(times.length, 2);
    assert.equal(times[0].brokerQuotePrice, "123,45"); assert.equal(times[1].brokerQuotePrice, 123.45);
    for (const time of times) {
        assert.equal(time.brokerQuoteTimestampRaw, rawTimestamp);
        assert.equal(time.normalizedTimestamp, "2026-10-05T16:45:00.000Z");
        assert.equal(time.normalizedTimestampMs, Date.parse(rawTimestamp));
        assert.equal(time.latestCompletedSessionDate, "2026-10-05");
        assert.equal(time.officialSessionCloseTimestamp, "2026-10-05T15:30:00.000Z");
        assert.equal(time.allowedWindowStart, "2026-10-05T15:25:00.000Z");
        assert.equal(time.allowedWindowEnd, "2026-10-05T16:30:00.000Z");
        assert.equal(time.deltaFromCloseMinutes, 75); assert.equal(time.deltaFromCloseSeconds, 4500);
        assert.equal(time.currentMarketStatus, "after_close");
        assert.deepEqual(time.failedConditions, ["after_window"]);
    }
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
    assert.equal(JSON.stringify(logs).includes("secret-header"), false);
});

test("missing and invalid raw timestamps have distinct reasons and no invented normalized time", async () => {
    for (const [raw, expected] of [[undefined, "timestamp_missing"], [null, "timestamp_missing"], ["", "timestamp_missing"],
        ["not-a-date", "timestamp_invalid"], ["2026-10-05", "timestamp_invalid"]]) {
        for (const time of checks(await failure(raw))) {
            assert.equal(time.brokerQuoteTimestampRaw, raw ?? null);
            assert.equal(time.normalizedTimestamp, null); assert.equal(time.normalizedTimestampMs, null);
            assert.equal(time.deltaFromCloseSeconds, null); assert.deepEqual(time.failedConditions, [expected]);
        }
    }
});

test("before-window diagnostic reports the negative delta; future inside the window is distinct", async () => {
    for (const time of checks(await failure(session.closesAt - 5 * 60000 - 1000))) {
        assert.deepEqual(time.failedConditions, ["before_window"]);
        assert.equal(time.deltaFromCloseSeconds, -301);
    }
    for (const time of checks(await failure(session.closesAt + 2000, session.closesAt + 1000))) {
        assert.deepEqual(time.failedConditions, ["timestamp_future"]);
        assert.equal(time.deltaFromCloseSeconds, 2);
    }
});

test("market-open failure reports open status without mislabelling a valid previous-session timestamp", async () => {
    for (const time of checks(await failure(session.closesAt, Date.parse("2026-10-06T10:00:00Z")))) {
        assert.equal(time.currentMarketStatus, "open"); assert.deepEqual(time.failedConditions, ["market_open"]);
    }
});

test("old quote and stale requested session report wrong/stale session with actual latest close", async () => {
    const oldSession = latestCompletedSession("STOCKHOLM", Date.parse("2026-10-02T21:30:00Z"));
    for (const target of [session, oldSession]) {
        for (const time of checks(await failure(oldSession.closesAt, observed, target))) {
            assert.equal(time.latestCompletedSessionDate, session.date);
            assert.equal(time.quoteSessionDate, oldSession.date);
            assert.equal(time.latestCompletedSessionCloseTimestamp, new Date(session.closesAt).toISOString());
            assert.ok(time.failedConditions.includes("wrong_session")); assert.ok(time.failedConditions.includes("stale_session"));
            assert.equal(time.failedConditions.includes("before_window"), target === session);
        }
    }
});

test("diagnostics preserve numeric seconds and milliseconds while normalizing both identically", async () => {
    const timeMs = session.closesAt + 61 * 60000;
    for (const raw of [timeMs, timeMs / 1000]) {
        for (const time of checks(await failure(raw))) {
            assert.equal(time.brokerQuoteTimestampRaw, raw); assert.equal(time.normalizedTimestampMs, timeMs);
            assert.equal(time.normalizedTimestamp, new Date(timeMs).toISOString()); assert.equal(time.deltaFromCloseMinutes, 61);
        }
    }
});

test("diagnostic window uses official half-day close and winter DST offset", async () => {
    const now = Date.parse("2026-10-30T22:30:00Z");
    const half = latestCompletedSession("STOCKHOLM", now);
    for (const time of checks(await failure(half.closesAt + 61 * 60000, now, half))) {
        assert.equal(time.officialSessionCloseTimestamp, "2026-10-30T12:00:00.000Z");
        assert.equal(time.allowedWindowStart, "2026-10-30T11:55:00.000Z");
        assert.equal(time.allowedWindowEnd, "2026-10-30T13:00:00.000Z");
    }
});
