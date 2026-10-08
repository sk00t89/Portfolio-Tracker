import { stockholmDate } from "./calendarDate.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { getMarketStatus, latestCompletedSession, zonedParts, zonedInstant, LISTING_CALENDARS, normalizeMarketCode } from "../../supabase/functions/_shared/marketCalendar.js";

const MINUTE = 60_000;
const DAY = 86_400_000;
export const VERIFIED_QUOTE_MAX_AGE = 20 * MINUTE;

export const quoteValuationKey = (holding) => JSON.stringify([
    holding.quantity, holding.currentPrice, holding.currentValueSek, holding.priceUpdatedAt, holding.currency,
    holding.assetType, holding.platform, holding.market, holding.isin, holding.productType, holding.ticker,
    holding.provider, holding.instrumentId, holding.coinId,
]);

export function normalizeQuoteTimestamp(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const input = typeof value === "string" ? value.trim() : value;
    if (input === "") return null;
    if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)) {
        const date = input.slice(0, 10);
        const day = Date.parse(`${date}T12:00:00Z`);
        if (!Number.isFinite(day) || day <= 0 || new Date(day).toISOString().slice(0, 10) !== date) return null;
        // A published NAV date is represented by the start of that Stockholm calendar day.
        if (input === date) return zonedInstant(date, "00:00", "Europe/Stockholm");
        // Require an explicit timezone; local machine timezone must never decide quote age.
        if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(input)) return null;
        const instant = Date.parse(input);
        return Number.isFinite(instant) && instant > 0 ? instant : null;
    }
    if (typeof input === "string" && !/^\d+(?:\.\d+)?$/.test(input)) return null;
    const number = Number(input);
    const result = number < 1e12 ? number * 1000 : number;
    return Number.isSafeInteger(result) && result > 0 && result <= 8.64e15 ? result : null;
}

const calendarAge = (date, now) => (Date.parse(stockholmDate(now)) - Date.parse(stockholmDate(date))) / DAY;

export function quoteFreshnessReason(holding, now = Date.now()) {
    const raw = holding.priceUpdatedAt;
    const timestamp = normalizeQuoteTimestamp(raw);
    const dateOnly = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
    if (timestamp == null || (dateOnly ? raw.trim() > stockholmDate(now) : timestamp > now + 5 * MINUTE)) {
        return "giltig kurstid saknas eller ligger i framtiden.";
    }
    const type = String(holding.assetType).toUpperCase();
    const directCrypto = type === "CRYPTO" && !holding.isin && holding.productType !== "ETP";
    if (directCrypto) {
        if (dateOnly) return "direkt krypto kräver en kurstid med klockslag.";
        return now - timestamp > 30 * MINUTE ? "kursen är äldre än 30 minuter." : null;
    }
    const market = LISTING_CALENDARS[normalizeMarketCode(holding.market)];
    const navFund = isMutualFund(holding);
    if (holding.platform === "Lysa" || navFund) {
        return calendarAge(timestamp, now) > 7 ? "kursen är äldre än sju kalenderdagar." : null;
    }
    if (!market) return "handelsplatsens kalender saknas eller stöds inte.";
    if (dateOnly) return "börshandlade instrument kräver en kurstid med klockslag.";
    const status = getMarketStatus(market, now);
    const session = status.status === "open" ? status : latestCompletedSession(market, now);
    if (!status.known || !session) return "handelskalendern saknar aktuell handelsdag.";
    if (zonedParts(timestamp, session.zone).date !== session.date || timestamp < session.opensAt) {
        return "kursen tillhör inte senaste relevanta handelsdag.";
    }
    const earliest = (status.status === "open" ? now : session.closesAt) - 30 * MINUTE;
    return timestamp < earliest ? "kursen är för gammal för senaste relevanta handelssession." : null;
}

export function validateValuationFreshness({ holdings, checks, userId }, now = Date.now()) {
    for (const holding of holdings) {
        const check = checks[holding.id];
        const fail = (reason) => ({ ready: false, reason: `${holding.name}: ${reason}` });
        if (!check?.success || (holding.platform !== "Lysa" && check.userId !== userId)) {
            return fail("senaste kurskontrollen saknas, pågår eller misslyckades.");
        }
        if (check.valueKey !== quoteValuationKey(holding)) return fail("innehavet har ändrats sedan senaste kurskontrollen.");
        if (!Number.isFinite(check.checkedAt) || now - check.checkedAt > VERIFIED_QUOTE_MAX_AGE || check.checkedAt > now + MINUTE) {
            return fail("kurskontrollen är äldre än 20 minuter.");
        }
        const quoteReason = quoteFreshnessReason(holding, now);
        if (quoteReason) return fail(quoteReason);
        if (holding.currentPrice == null || !(Number(holding.currentPrice) > 0) ||
            holding.currentValueSek == null || !Number.isFinite(Number(holding.currentValueSek)) ||
            Number(holding.currentValueSek) < 0 || !(Number(holding.quantity) > 0)) {
            return fail("aktuellt kursberäknat SEK-värde saknas.");
        }
    }
    return { ready: true, reason: null };
}
