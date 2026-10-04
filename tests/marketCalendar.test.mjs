import test from "node:test";
import assert from "node:assert/strict";
import { tradingSession, getMarketStatus, latestCompletedSession, dailyMissingReasons, holdingMarket } from "../supabase/functions/_shared/marketCalendar.js";
const at = Date.parse;

test("Stockholm and USA close on weekends; direct crypto remains open", () => {
    const now = at("2026-10-04T12:00:00Z");
    for (const market of ["STOCKHOLM", "USA"]) {
        assert.equal(getMarketStatus(market, now).status, "closed_day");
        assert.equal(getMarketStatus(market, now).reason, "söndag");
        assert.equal(latestCompletedSession(market, now).date, "2026-10-02");
    }
    assert.equal(getMarketStatus("CRYPTO", now).status, "open");
});
test("official holidays differ between Stockholm and USA", () => {
    assert.equal(tradingSession("STOCKHOLM", "2026-01-06").reason, "trettondedag jul");
    assert.equal(tradingSession("USA", "2026-01-06").closed, false);
    assert.equal(tradingSession("USA", "2026-07-03").closed, true);
    assert.equal(tradingSession("STOCKHOLM", "2026-07-03").closed, false);
    assert.equal(tradingSession("USA", "2027-06-18").closed, true);
    assert.equal(tradingSession("USA", "2027-07-05").closed, true);
    assert.equal(tradingSession("STOCKHOLM", "2027-06-25").closed, true);
});
test("Stockholm and USA half days use actual early closing time", () => {
    const stockholm = tradingSession("STOCKHOLM", "2026-04-02");
    assert.equal(stockholm.halfDay, true);
    assert.equal(stockholm.closesAt, at("2026-04-02T11:00:00Z"));
    const usa = tradingSession("USA", "2026-11-27");
    assert.equal(usa.halfDay, true);
    assert.equal(usa.closesAt, at("2026-11-27T18:00:00Z"));
    assert.equal(getMarketStatus("USA", usa.closesAt - 1).status, "open");
    assert.equal(getMarketStatus("USA", usa.closesAt).status, "after_close");
});
test("DST differences use IANA zones, including unmatched March and October weeks", () => {
    assert.equal(tradingSession("USA", "2026-03-06").closesAt, at("2026-03-06T21:00:00Z"));
    assert.equal(tradingSession("USA", "2026-03-09").closesAt, at("2026-03-09T20:00:00Z"));
    assert.equal(tradingSession("STOCKHOLM", "2026-03-27").closesAt, at("2026-03-27T16:30:00Z"));
    assert.equal(tradingSession("STOCKHOLM", "2026-03-30").closesAt, at("2026-03-30T15:30:00Z"));
    assert.equal(tradingSession("USA", "2026-10-26").closesAt, at("2026-10-26T20:00:00Z"));
    assert.equal(tradingSession("USA", "2026-11-02").closesAt, at("2026-11-02T21:00:00Z"));
});
test("US session must finish; Stockholm close alone does not suffice", () => {
    const now = at("2026-10-05T18:00:00Z");
    assert.equal(latestCompletedSession("STOCKHOLM", now).date, "2026-10-05");
    assert.equal(latestCompletedSession("USA", now).date, "2026-10-02");
    assert.equal(latestCompletedSession("USA", at("2026-10-05T20:00:00Z")).date, "2026-10-05");
});
test("unknown years and markets fail closed, and next opening skips holidays", () => {
    assert.equal(getMarketStatus("USA", at("2028-01-05T12:00:00Z")).known, false);
    assert.equal(latestCompletedSession("USA", at("2028-01-05T12:00:00Z")), null);
    assert.equal(latestCompletedSession("LONDON", at("2026-10-05T12:00:00Z")), null);
    assert.equal(getMarketStatus("STOCKHOLM", at("2026-04-03T12:00:00Z")).nextOpen, at("2026-04-07T07:00:00Z"));
});
test("crypto ETP follows exchange, missing daily quotes explain closed markets", () => {
    const holdings = [{ assetType: "STOCK", market: "ST" }, { market: "US" },
        { assetType: "CRYPTO", ticker: "BTC" }, { assetType: "CRYPTO", isin: "SE123", productType: "ETP", market: "ST" }];
    assert.equal(holdingMarket(holdings[2]), "CRYPTO");
    assert.equal(holdingMarket(holdings[3]), "STOCKHOLM");
    const reasons = dailyMissingReasons(holdings, at("2026-10-04T12:00:00Z"));
    assert.equal(reasons.length, 3);
    assert.match(reasons[0], /söndag/);
    assert.match(reasons[2], /24\/7/);
    assert.match(dailyMissingReasons([{ market: "US" }], at("2026-10-05T10:00:00Z"))[0], /inte öppnat/);
});
test("FNSE maps to Stockholm even without country metadata and uses the Swedish calendar", () => {
    for (const assetType of ["SUBSCRIPTION_OPTION", "STOCK"]) {
        const market = holdingMarket({ market: "FNSE", assetType });
        assert.equal(market, "STOCKHOLM");
        assert.equal(latestCompletedSession(market, at("2026-10-05T21:30:00Z")).date, "2026-10-05");
        assert.equal(getMarketStatus(market, at("2026-04-03T12:00:00Z")).reason, "långfredagen");
    }
});
test("XSAT maps to Stockholm without country metadata and uses the Swedish calendar", () => {
    const market = holdingMarket({ market: "XSAT", assetType: "STOCK" });
    assert.equal(market, "STOCKHOLM");
    assert.equal(latestCompletedSession(market, at("2026-10-05T21:30:00Z")).date, "2026-10-05");
    assert.equal(getMarketStatus(market, at("2026-04-03T12:00:00Z")).reason, "långfredagen");
});
