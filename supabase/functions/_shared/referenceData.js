// Dates are publication/valuation dates. A date-only source never acquires an invented instant.
import { addCalendarDays, zonedParts } from "./marketCalendar.js";
export const REFERENCE_DATA_VERSION = "daily-reference-v1";
export function validDate(date) {
    return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function referenceFx(rows, from, to, targetDate, checkedAt) {
    if (!validDate(targetDate) || targetDate > zonedParts(checkedAt, "Europe/Stockholm").date || !Array.isArray(rows)) throw new Error("FX_DATE_INVALID");
    const seen = new Set();
    const observations = rows.map(row => {
        if (row.base !== from || row.quote !== to || !validDate(row.date) || row.date > targetDate
            || seen.has(row.date) || typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0) throw new Error("FX_OBSERVATION_INVALID");
        seen.add(row.date);
        return { from, to, rate: row.rate, sourceDate: row.date, sourceTimestamp: null, checkedAt,
            provider: "Frankfurter", kind: "daily_reference", verified: true };
    }).sort((a,b) => a.sourceDate.localeCompare(b.sourceDate));
    const current = observations.at(-1), previous = observations.at(-2) ?? null;
    if (!current || current.sourceDate < addCalendarDays(targetDate, -7)) throw new Error("FX_REFERENCE_MISSING");
    return { apiVersion: REFERENCE_DATA_VERSION, current, previous, observations };
}
export function navPair(points, { isin, currency, provider, checkedAt, latest }) {
    const today = zonedParts(checkedAt, "Europe/Stockholm").date;
    if (!isin || !/^[A-Z]{3}$/.test(currency) || !Array.isArray(points)) throw new Error("NAV_IDENTITY_INVALID");
    const seen = new Set();
    const series = points.map(p => {
        if (!validDate(p.date) || p.date > today || seen.has(p.date) || typeof p.price !== "number" || !Number.isFinite(p.price) || p.price <= 0) throw new Error("NAV_OBSERVATION_INVALID");
        seen.add(p.date);
        return { isin, currency, price: p.price, sourceDate: p.date, sourceTimestamp: null,
            provider, kind: "published_nav", checkedAt, verified: true };
    }).sort((a,b) => a.sourceDate.localeCompare(b.sourceDate));
    const current = series.at(-1), previous = series.at(-2) ?? null;
    if (!current || current.sourceDate < addCalendarDays(today, -7)) throw new Error("NAV_CURRENT_MISSING");
    if (latest && (current.sourceDate !== latest.date || Math.abs(current.price - Number(latest.price)) > 0.000001)) throw new Error("NAV_HISTORY_MISMATCH");
    return { apiVersion: REFERENCE_DATA_VERSION, current, previous };
}
