import getInstrumentKey from "./instrumentKey.js";
import { stockholmDate } from "./calendarDate.js";
import { hasCompleteDailyQuote } from "./dailyQuote.js";
export { stockholmDate } from "./calendarDate.js";

export function quoteDate(timestamp) {
    if (timestamp == null) return null;
    const number = Number(timestamp);
    return stockholmDate(Number.isFinite(number)
        ? (number < 1e12 ? number * 1000 : number) : timestamp);
}

const numberOrNull = (value) => value == null || value === "" || !Number.isFinite(Number(value))
    ? null : Number(value);

// Group first: a missing/stale position excludes the whole instrument, never a partial ranking.
export function calculateDailyMovers(holdings, now = Date.now()) {
    // Preserve date-based callers; the component supplies the actual observation instant.
    if (typeof now === "string" && /^\d{4}-\d{2}-\d{2}$/.test(now)) now = Date.parse(`${now}T12:00:00Z`);
    const aliases = new Map();
    const normalize = (value) => String(value ?? "").trim().toUpperCase();
    for (const holding of holdings) {
        if (!holding.isin) continue;
        for (const alias of [holding.ticker && `ticker:${normalize(holding.ticker)}`,
            holding.name && `name:${normalize(holding.name)}`].filter(Boolean)) {
            if (!aliases.has(alias)) aliases.set(alias, new Set());
            aliases.get(alias).add(normalize(holding.isin));
        }
    }
    const groups = new Map();
    for (const holding of holdings) {
        let key = getInstrumentKey(holding).trim().toUpperCase();
        if (!holding.isin) {
            const candidates = aliases.get(`ticker:${normalize(holding.ticker)}`) ??
                aliases.get(`name:${normalize(holding.name)}`);
            // Only bridge missing identifiers when the alias has one unambiguous ISIN.
            if (candidates?.size === 1) key = [...candidates][0];
        }
        if (!groups.has(key)) groups.set(key, { instrumentKey: key, name: holding.name, positions: [] });
        groups.get(key).positions.push(holding);
    }
    const movers = [];
    for (const group of groups.values()) {
        let current = 0;
        let previous = 0;
        let complete = true;
        for (const position of group.positions) {
            const price = numberOrNull(position.currentPrice);
            const close = numberOrNull(position.previousClose);
            const value = numberOrNull(position.currentValueSek);
            if (!(price > 0) || !(close > 0) || value === null || !(value >= 0) ||
                !(Number(position.quantity) > 0) || !hasCompleteDailyQuote(position, {
                    price, previousClose: close, timestamp: position.priceUpdatedAt,
                }, now)) {
                complete = false;
                break;
            }
            current += value;
            // Same current FX rate for both prices: price contribution, excluding FX movement.
            previous += value * close / price;
        }
        if (complete && previous > 0) movers.push({
            ...group, changeSek: current - previous,
            changePercent: (current / previous - 1) * 100,
        });
    }
    movers.sort((a, b) => b.changeSek - a.changeSek || a.name.localeCompare(b.name));
    return {
        best: movers.filter((item) => item.changeSek > 0).slice(0, 3),
        worst: movers.filter((item) => item.changeSek < 0).reverse().slice(0, 3),
        excluded: groups.size - movers.length,
    };
}

function periodStart(period, today) {
    const date = new Date(`${today}T12:00:00Z`);
    if (period === "1V") date.setUTCDate(date.getUTCDate() - 7);
    if (period === "1M" || period === "1Å") {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        if (period === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
        else date.setUTCFullYear(date.getUTCFullYear() - 1);
        const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, last));
    }
    if (period === "YTD") return `${today.slice(0, 4)}-01-01`;
    return date.toISOString().slice(0, 10);
}

export function availableHistoryPeriods(points, today = stockholmDate()) {
    if (points.length < 2) return [];
    return ["1V", "1M", "YTD", "1Å", "All"].filter((period) => {
        if (period === "All") return true;
        return coveredPeriodPoints(points, period, today).length >= 2;
    });
}

function coveredPeriodPoints(points, period, today) {
    const start = periodStart(period, today);
    const valid = points.filter((point) => point.date <= today).sort((a, b) => a.date.localeCompare(b.date));
    const last = valid.at(-1);
    const ageDays = (earlier, later) => (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
    const distance = (point) => Math.abs(ageDays(point.date, start));
    // Sorted dates and strict < make equal-distance ties prefer the earlier point.
    const anchor = valid.reduce((nearest, point) => distance(point) <= 3 &&
        (!nearest || distance(point) < distance(nearest)) ? point : nearest, null);
    if (!anchor || !last || last.date <= anchor.date ||
        last.date <= start || ageDays(last.date, today) > 1) return [];
    // Use the same actual anchor for the graph and its percent/amount comparison.
    return valid.filter((point) => point.date >= anchor.date);
}

// A benchmark adapter can supply another dated series without coupling the chart to a provider.
export function createValueSeries(points, period, today = stockholmDate()) {
    const covered = period === "All" ? points : coveredPeriodPoints(points, period, today);
    return { id: "portfolio", label: "Portföljvärde", currency: "SEK", metric: "value",
        points: covered.map((point) => ({ date: point.date, value: point.valueSek })),
    };
}
