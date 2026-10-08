import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryWriteQueue, nextObservationTime } from "../src/utils/historyWriteQueue.js";
import { normalizeQuoteTimestamp, quoteValuationKey, validateValuationFreshness } from "../src/utils/valuationFreshness.js";

const now = Date.parse("2026-10-04T12:00:00Z");
const minute = 60_000;
function valuation(overrides = {}, checkOverrides = {}) {
    const holding = { id: "h1", name: "Investor", assetType: "STOCK", platform: "Avanza", currency: "SEK",
        market: "XSTO", quantity: 10, currentPrice: 100, currentValueSek: 1000,
        priceUpdatedAt: Date.parse("2026-10-02T15:30:00Z"), ...overrides };
    return { userId: "user1", holdings: [holding], checks: { h1: {
        userId: "user1", success: true, checkedAt: now, valueKey: quoteValuationKey(holding), ...checkOverrides,
    } } };
}

test("only verified, current valuations can be recorded", () => {
    assert.equal(validateValuationFreshness(valuation(), now).ready, true);
    for (const overrides of [{ success: false }, { userId: "other-user" }, { valueKey: "old-import" },
        { checkedAt: now - 20 * minute - 1 }, { checkedAt: null }]) {
        assert.equal(validateValuationFreshness(valuation({}, overrides), now).ready, false);
    }
    assert.equal(validateValuationFreshness(valuation({}, { checkedAt: now - 20 * minute }), now).ready, true);
});

test("a failed latest refresh blocks history even when the old price is fresh", () => {
    assert.equal(validateValuationFreshness(valuation({}, { success: false, checkedAt: now }), now).ready, false);
});

test("stocks require the latest actual session, not an arbitrary four-day allowance", () => {
    assert.equal(validateValuationFreshness(valuation(), now).ready, true);
    for (const priceUpdatedAt of ["2026-10-01T15:30:00Z", "2026-10-02T08:00:00Z", "2026-10-04T10:00:00Z"]) {
        assert.equal(validateValuationFreshness(valuation({ priceUpdatedAt }), now).ready, false);
    }
});

test("fund and Lysa prices allow seven calendar days, not eight", () => {
    for (const identity of [{ assetType: "FUND", market: null }, { platform: "Lysa" }]) {
        assert.equal(validateValuationFreshness(valuation({ ...identity, priceUpdatedAt: "2026-09-27" }), now).ready, true);
        assert.equal(validateValuationFreshness(valuation({ ...identity, priceUpdatedAt: "2026-09-26" }), now).ready, false);
    }
});

test("today's date-only NAV is valid before noon, but tomorrow's NAV is not", () => {
    const morning = Date.parse("2026-10-04T07:00:00Z");
    assert.equal(validateValuationFreshness(valuation({ assetType: "FUND", market: null, priceUpdatedAt: "2026-10-04" }, { checkedAt: morning }), morning).ready, true);
    assert.equal(validateValuationFreshness(valuation({ assetType: "FUND", market: null, priceUpdatedAt: "2026-10-05" }, { checkedAt: morning }), morning).ready, false);
    assert.equal(validateValuationFreshness(valuation({ assetType: "CRYPTO", priceUpdatedAt: "2026-10-04" }), now).ready, false);
});

test("direct crypto expires at thirty minutes; listed crypto ETP follows stock rule", () => {
    assert.equal(validateValuationFreshness(valuation({ assetType: "CRYPTO", priceUpdatedAt: now - 30 * minute }), now).ready, true);
    assert.equal(validateValuationFreshness(valuation({ assetType: "CRYPTO", priceUpdatedAt: now - 30 * minute - 1 }), now).ready, false);
    assert.equal(validateValuationFreshness(valuation({ assetType: "CRYPTO", isin: "SEETP" }), now).ready, true);
    assert.equal(validateValuationFreshness(valuation({ assetType: "CRYPTO", isin: "SEETP", priceUpdatedAt: "2026-10-02" }), now).ready, false);
});

test("missing, invalid, future timestamps and imported reserve values are blocked", () => {
    for (const overrides of [{ priceUpdatedAt: null }, { priceUpdatedAt: "bad" },
        { priceUpdatedAt: now + 6 * minute }, { currentValueSek: null, valueSek: 1000 },
        { currentPrice: 0 }, { quantity: 0 }, { currentValueSek: -1 }]) {
        assert.equal(validateValuationFreshness(valuation(overrides), now).ready, false);
    }
});

test("one uncertain position blocks the entire total; no positions need no quotes", () => {
    const inputs = valuation();
    inputs.holdings.push({ ...inputs.holdings[0], id: "h2" });
    assert.equal(validateValuationFreshness(inputs, now).ready, false);
    assert.equal(validateValuationFreshness({ userId: "user1", holdings: [], checks: {} }, now).ready, true);
});

test("quote timestamps parse seconds, milliseconds, ISO and NAV dates without fetch-time fallback", () => {
    assert.equal(normalizeQuoteTimestamp(now / 1000), now);
    assert.equal(normalizeQuoteTimestamp(now), now);
    assert.equal(normalizeQuoteTimestamp("2026-10-04T12:00:00Z"), now);
    assert.equal(normalizeQuoteTimestamp("2026-10-04"), Date.parse("2026-10-03T22:00:00Z"));
    for (const value of [null, "", "bad", 0]) assert.equal(normalizeQuoteTimestamp(value), null);
});

test("a slow older write cannot finish after and overwrite a newer local write", async () => {
    const enqueue = createHistoryWriteQueue();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const events = [];
    let storedValue;
    const old = enqueue(async () => { events.push("old-start"); await gate; storedValue = 100; events.push("old-end"); });
    const newer = enqueue(async () => { events.push("new-start"); storedValue = 200; });
    await Promise.resolve();
    assert.deepEqual(events, ["old-start"]);
    release();
    await Promise.all([old, newer]);
    assert.equal(storedValue, 200);
    assert.deepEqual(events, ["old-start", "old-end", "new-start"]);
});

test("failed writes do not block a later valid observation", async () => {
    const enqueue = createHistoryWriteQueue();
    const failed = enqueue(async () => { throw new Error("offline"); });
    const later = enqueue(async () => 200);
    await assert.rejects(failed, /offline/);
    assert.equal(await later, 200);
});

test("observation timestamps increase even within a millisecond or after a clock rollback", () => {
    const first = nextObservationTime(now);
    const second = nextObservationTime(now);
    const third = nextObservationTime(now - 1000);
    assert.ok(first < second && second < third);
});
