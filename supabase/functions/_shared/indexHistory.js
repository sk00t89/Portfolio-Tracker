export const INDEXES = {
    OMXS30: { symbol: "^OMX", label: "OMXS30", currency: "SEK", zone: "Europe/Stockholm", exchange: "STO" },
    SP500: { symbol: "^GSPC", label: "S&P 500", currency: "USD", zone: "America/New_York", exchange: "SNP" },
};
export const INDEX_HISTORY_VERSION = "index-history-v1";
export const indexDate = (time, zone) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(time));
export function indexPeriodStart(period, today) {
    const date = new Date(`${today}T12:00:00Z`);
    if (period === "YTD") return `${today.slice(0, 4)}-01-01`;
    if (period === "1V") date.setUTCDate(date.getUTCDate() - 7);
    else if (["1M", "3M", "1Å", "All"].includes(period)) {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        if (period === "1M" || period === "3M") date.setUTCMonth(date.getUTCMonth() - (period === "1M" ? 1 : 3));
        else date.setUTCFullYear(date.getUTCFullYear() - (period === "All" ? 10 : 1));
        date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    } else throw new Error("INDEX_PERIOD_UNSUPPORTED");
    return date.toISOString().slice(0, 10);
}
const fault = code => Object.assign(new Error(code), { code });
export function parseIndexHistory(data, id, period, now) {
    const config = INDEXES[id], result = data?.chart?.result?.[0], meta = result?.meta;
    if (!config || data?.chart?.error || !result) throw fault("INDEX_DATA_UNAVAILABLE");
    if (meta?.symbol !== config.symbol || meta.instrumentType !== "INDEX" || meta.currency !== config.currency
        || meta.exchangeTimezoneName !== config.zone || meta.exchangeName !== config.exchange
        || meta.dataGranularity !== "1d") throw fault("INDEX_IDENTITY_MISMATCH");
    const today = indexDate(now, config.zone), start = indexPeriodStart(period, today);
    const timestamps = result.timestamp, closes = result.indicators?.quote?.[0]?.close;
    if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length !== closes.length) throw fault("INDEX_INVALID_DATA");
    const points = [];
    let previous = -Infinity, previousDate = "", missing = 0;
    for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i] * 1000;
        if (typeof timestamps[i] !== "number" || !Number.isFinite(time) || time <= previous) throw fault("INDEX_INVALID_DATA");
        previous = time;
        const date = indexDate(time, config.zone);
        if (date <= previousDate) throw fault("INDEX_INVALID_DATA");
        previousDate = date;
        // Yahoo's timestamp identifies the daily bar, not its publication/close instant.
        // Even after closing, today's bar is excluded until the next local day.
        if (time > now || date >= today || date < start) continue;
        const value = closes[i];
        if (value == null) { missing++; continue; }
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw fault("INDEX_INVALID_DATA");
        points.push({ date, value, barTimestamp: new Date(time).toISOString() });
    }
    if (!points.length) throw fault("INDEX_DATA_UNAVAILABLE");
    return { apiVersion: INDEX_HISTORY_VERSION, id, ...config, source: "Yahoo Finance", returnBasis: "price_return",
        period, requestedStart: start, requestedEnd: today, fetchedAt: new Date(now).toISOString(), missing, points };
}
export function createIndexHistoryRoute({ fetcher = fetch, clock = Date.now } = {}) {
    return async url => {
        const path = url.pathname.replace(/^.*\/market-api(?=\/api\/)/, "");
        if (path !== "/api/index-history") return null;
        const id = url.searchParams.get("id"), period = url.searchParams.get("period"), now = clock();
        if (!Object.hasOwn(INDEXES, id)) return { status: 400, body: { code: "INDEX_UNSUPPORTED" } };
        let start;
        try { start = indexPeriodStart(period, indexDate(now, INDEXES[id].zone)); }
        catch { return { status: 400, body: { code: "INDEX_PERIOD_UNSUPPORTED" } }; }
        try {
            const begin = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000);
            const response = await fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(INDEXES[id].symbol)}?interval=1d&period1=${begin}&period2=${Math.floor(now / 1000)}`, {
                headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) return { status: 502, body: { code: "INDEX_PROVIDER_HTTP_ERROR", providerStatus: response.status } };
            const body = parseIndexHistory(await response.json(), id, period, now);
            return { status: 200, body };
        } catch (error) {
            return { status: 502, body: { code: ["INDEX_IDENTITY_MISMATCH", "INDEX_INVALID_DATA", "INDEX_DATA_UNAVAILABLE"].includes(error.code)
                ? error.code : "INDEX_PROVIDER_UNAVAILABLE" } };
        }
    };
}
