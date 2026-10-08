import { LISTING_CALENDARS, normalizeMarketCode } from "./marketCalendar.js";

export function normalizeYahooSymbol(ticker, market = "") {
    if (typeof ticker !== "string" || !ticker.trim()) return null;
    const raw = ticker.trim().toUpperCase().replaceAll(" ", "-");
    const venue = normalizeMarketCode(market);
    const stockholm = LISTING_CALENDARS[venue] === "STOCKHOLM" || /\.ST$/.test(raw);
    const base = stockholm && /\.ST$/.test(raw) ? raw.slice(0, -3) : raw;
    if (venue === "LSE") return /\.L$/.test(raw) ? raw : `${raw}.L`;
    const symbol = base.replace(/^([A-Z0-9-]+)\.([A-Z])$/, "$1-$2");
    return stockholm ? `${symbol}.ST` : symbol;
}
