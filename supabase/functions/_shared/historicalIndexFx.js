import { indexDate } from "./indexHistory.js";

export const INDEX_FX_VERSION = "index-fx-v1";
const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export function parseHistoricalIndexFx(rows, start, end, now) {
    if (!validDate(start) || !validDate(end) || start > end || end >= indexDate(now, "Europe/Stockholm")
        || !Array.isArray(rows) || rows.length === 0) throw new Error("INDEX_FX_UNAVAILABLE");
    let previous = "";
    const points = rows.map(row => {
        const provider = row.providers?.[0];
        // The live API supplies expanded provider objects. Verify the underlying
        // date/rate as well as provider identity; never accept a blended rate.
        const ecb = provider === "ecb" || (provider && typeof provider === "object"
            && provider.key === "ECB" && provider.date === row.date && provider.rate === row.rate);
        if (row.base !== "USD" || row.quote !== "SEK" || !validDate(row.date) || row.date < start || row.date > end
            || row.date <= previous || typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0
            || !Array.isArray(row.providers) || row.providers.length !== 1 || !ecb) throw new Error("INDEX_FX_INVALID");
        previous = row.date;
        return { date: row.date, rate: row.rate };
    });
    return { apiVersion: INDEX_FX_VERSION, from: "USD", to: "SEK", provider: "ECB", source: "Frankfurter / ECB",
        kind: "daily_reference", start, end, points };
}

export function createHistoricalIndexFxRoute({ fetcher = fetch, clock = Date.now } = {}) {
    // Shared market data, no portfolio/user data. Cache only successful source-checked
    // results; bounds keep memory and upstream history requests finite.
    const cache = new Map(), pending = new Map();
    return async url => {
        const path = url.pathname.replace(/^.*\/market-api(?=\/api\/)/, "");
        if (path !== "/api/index-fx-history") return null;
        const start = url.searchParams.get("start"), end = url.searchParams.get("end"), now = clock();
        if (!validDate(start) || !validDate(end) || start > end || end >= indexDate(now, "Europe/Stockholm")
            || Date.parse(end) - Date.parse(start) > 3660 * 86400000) return { status: 400, body: { code: "INDEX_FX_REQUEST_INVALID" } };
        const key = `${start}:${end}`, cached = cache.get(key);
        if (cached && now - cached.at < 3600000) return { status: 200, body: cached.body };
        try {
            if (!pending.has(key)) pending.set(key, (async () => {
                const params = new URLSearchParams({ base: "USD", quotes: "SEK", from: start, to: end, providers: "ecb", expand: "providers" });
                const response = await fetcher(`https://api.frankfurter.dev/v2/rates?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
                if (!response.ok) throw new Error("INDEX_FX_PROVIDER_UNAVAILABLE");
                const body = parseHistoricalIndexFx(await response.json(), start, end, now);
                if (cache.size >= 32) cache.delete(cache.keys().next().value);
                cache.set(key, { at: now, body });
                return body;
            })().finally(() => pending.delete(key)));
            return { status: 200, body: await pending.get(key) };
        } catch (error) {
            return { status: 502, body: { code: ["INDEX_FX_INVALID", "INDEX_FX_UNAVAILABLE"].includes(error.message) ? error.message : "INDEX_FX_PROVIDER_UNAVAILABLE" } };
        }
    };
}
