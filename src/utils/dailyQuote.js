import { normalizeQuoteTimestamp, quoteFreshnessReason } from "./valuationFreshness.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { zonedParts, getMarketStatus, latestCompletedSession, LISTING_CALENDARS, normalizeMarketCode } from "../../supabase/functions/_shared/marketCalendar.js";

// A valuation may use the last completed session. Today's movement must belong to today.
// NAV and crypto 24-hour changes do not establish an exchange previous-close comparison.
export function hasCompleteDailyQuote(holding, quote, now = Date.now()) {
    if (holding.quoteStale) return false;
    if (isMutualFund(holding) || holding.platform === "Lysa") return false;
    const market = LISTING_CALENDARS[normalizeMarketCode(holding.market)];
    if (!market || !(Number(quote.price) > 0) || !Number.isFinite(Number(quote.price)) ||
        !(Number(quote.previousClose) > 0) || !Number.isFinite(Number(quote.previousClose))) return false;
    const timestamp = normalizeQuoteTimestamp(quote.timestamp);
    if (timestamp == null || timestamp > now || quoteFreshnessReason({ ...holding, priceUpdatedAt: quote.timestamp }, now)) return false;
    const status = getMarketStatus(market, now);
    const session = status.status === "open" ? status : latestCompletedSession(market, now);
    if (!session || timestamp > session.closesAt + 5 * 60_000) return false;
    const zone = market === "USA" ? "America/New_York" : "Europe/Stockholm";
    return zonedParts(timestamp, zone).date === zonedParts(now, zone).date;
}
