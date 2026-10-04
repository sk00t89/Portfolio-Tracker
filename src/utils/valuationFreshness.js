import { stockholmDate } from "./dashboardHistory.js";

const MINUTE = 60_000;
const DAY = 86_400_000;
export const VERIFIED_QUOTE_MAX_AGE = 20 * MINUTE;

export const quoteValuationKey = (holding) => JSON.stringify([
    holding.quantity, holding.currentPrice, holding.currentValueSek, holding.priceUpdatedAt, holding.currency,
]);

export function normalizeQuoteTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T12:00:00Z`);
    const number = Number(value);
    const result = Number.isFinite(number) ? (number < 1e12 ? number * 1000 : number) : Date.parse(value);
    return Number.isFinite(result) && result > 0 ? result : null;
}

const calendarAge = (date, now) => (Date.parse(stockholmDate(now)) - Date.parse(stockholmDate(date))) / DAY;

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
        const timestamp = normalizeQuoteTimestamp(holding.priceUpdatedAt);
        const dateOnly = typeof holding.priceUpdatedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(holding.priceUpdatedAt);
        if (timestamp == null || (dateOnly ? holding.priceUpdatedAt > stockholmDate(now) : timestamp > now + 5 * MINUTE)) {
            return fail("giltig kurstid saknas eller ligger i framtiden.");
        }
        const fund = holding.platform === "Lysa" || String(holding.assetType).toUpperCase() === "FUND";
        const directCrypto = String(holding.assetType).toUpperCase() === "CRYPTO" && !holding.isin && holding.productType !== "ETP";
        if (directCrypto && dateOnly) return fail("direkt krypto kräver en kurstid med klockslag.");
        if (directCrypto ? now - timestamp > 30 * MINUTE : calendarAge(timestamp, now) > (fund ? 7 : 4)) {
            return fail(`kursen är äldre än ${directCrypto ? "30 minuter" : fund ? "sju kalenderdagar" : "fyra kalenderdagar"}.`);
        }
        if (holding.currentPrice == null || !(Number(holding.currentPrice) > 0) ||
            holding.currentValueSek == null || !Number.isFinite(Number(holding.currentValueSek)) ||
            Number(holding.currentValueSek) < 0 || !(Number(holding.quantity) > 0)) {
            return fail("aktuellt kursberäknat SEK-värde saknas.");
        }
    }
    return { ready: true, reason: null };
}
