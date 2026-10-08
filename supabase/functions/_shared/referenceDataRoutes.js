import { REFERENCE_DATA_VERSION, referenceFx, navPair, validDate } from "./referenceData.js";
import { addCalendarDays, zonedParts } from "./marketCalendar.js";
import { lysaFundIsins } from "./instrumentCatalog.js";
export function createReferenceDataRoutes({ fetcher = fetch, clock = Date.now } = {}) {
    async function get(url, headers = {}) {
        const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0", ...headers }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("REFERENCE_PROVIDER_UNAVAILABLE");
        return response.json();
    }
    return async url => {
        const path = url.pathname.replace(/^.*\/market-api(?=\/api\/)/, "");
        const fx = path.match(/^\/api\/reference-fx\/([A-Za-z]{3})\/([A-Za-z]{3})$/);
        if (!fx && path !== "/api/nav-comparison" && path !== "/api/lysa-nav-comparisons") return null;
        const checkedAt = clock(), today = zonedParts(checkedAt, "Europe/Stockholm").date;
        try {
            if (fx) {
                const from = fx[1].toUpperCase(), to = fx[2].toUpperCase();
                const date = url.searchParams.get("date") ?? today;
                if (!validDate(date) || date > today || date < addCalendarDays(today, -14) || from === to) throw new Error("REFERENCE_REQUEST_INVALID");
                const params = new URLSearchParams({ base: from, quotes: to, from: addCalendarDays(date, -10), to: date });
                return { status: 200, body: referenceFx(await get(`https://api.frankfurter.dev/v2/rates?${params}`), from, to, date, checkedAt) };
            }
            if (path === "/api/lysa-nav-comparisons") {
                const latest = await get("https://api.lysafonder.se/public/nav/latest");
                if (!Array.isArray(latest)) throw new Error("NAV_IDENTITY_INVALID");
                const allowed = new Set(Object.values(lysaFundIsins));
                const current = latest.filter(p => allowed.has(p.isin) && p.currency === "SEK" && validDate(p.date) && p.date <= today && p.date >= addCalendarDays(today, -7));
                if (new Set(current.map(p => p.isin)).size !== current.length) throw new Error("NAV_IDENTITY_INVALID");
                const comparisons = {}, requests = new Map();
                const day = date => {
                    if (!requests.has(date)) requests.set(date, get(`https://api.lysafonder.se/public/nav/${date}`).catch(() => null));
                    return requests.get(date);
                };
                await Promise.all(current.map(async p => {
                    let previous;
                    for (let offset = 1; offset <= 7; offset++) {
                        const date = addCalendarDays(p.date, -offset), data = await day(date);
                        if (data == null) break; // A failed date is unknown, never silently skipped.
                        if (!Array.isArray(data)) break;
                        const hits = data.filter(row => row.isin === p.isin);
                        if (hits.length > 1) break;
                        if (hits.length === 1) {
                            // This is an as-of API: a weekend request can return Friday's real NAV date.
                            if (hits[0].currency !== p.currency || !validDate(hits[0].date) || hits[0].date > date
                                || hits[0].date >= p.date || hits[0].date < addCalendarDays(p.date, -7)) break;
                            previous = hits[0]; break;
                        }
                    }
                    try { comparisons[p.isin] = navPair(previous ? [previous, p] : [p], { ...p, provider: "Lysa", checkedAt }); }
                    catch { comparisons[p.isin] = { error: "NAV_OBSERVATION_INVALID" }; }
                }));
                return { status: 200, body: { apiVersion: REFERENCE_DATA_VERSION, comparisons } };
            }
            const isin = url.searchParams.get("isin"), id = url.searchParams.get("instrumentId");
            if (url.searchParams.get("provider") !== "Avanza" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin ?? "") || !/^\d+$/.test(id ?? "")) throw new Error("REFERENCE_REQUEST_INVALID");
            const headers = { Referer: "https://www.avanza.se/" };
            let detail;
            for (const route of ["market-guide/fund", "fund-guide/guide"]) {
                try { detail = await get(`https://www.avanza.se/_api/${route}/${id}`, headers); break; }
                catch { /* Same provider ID, alternative fund detail format. */ }
            }
            if (!detail) throw new Error("NAV_CURRENT_MISSING");
            const type = String(detail.type ?? detail.instrumentType ?? detail.orderbookType ?? "FUND").toUpperCase();
            const returnedId = detail.orderbookId ?? detail.orderBookId ?? detail.id;
            if (detail.isin !== isin || (returnedId != null && String(returnedId) !== id)
                || !["FUND", "MUTUAL_FUND"].includes(type)) throw new Error("NAV_IDENTITY_INVALID");
            const currency = detail.quote?.currency ?? detail.navCurrency ?? detail.currency;
            const rawDate = detail.navDate ?? detail.nav?.date;
            const date = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.0+)?)?$/.test(rawDate) ? rawDate.slice(0,10) : null;
            const price = detail.quote?.last ?? detail.nav?.value ?? detail.nav;
            const chart = await get(`https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=one_month&resolution=day`, headers);
            if (!Array.isArray(chart.ohlc) || !validDate(date)) throw new Error("NAV_HISTORY_INVALID");
            // Chart timestamps label Stockholm valuation days, not NAV publication instants.
            const points = chart.ohlc.map(p => ({ date: typeof p.timestamp === "number" && Number.isFinite(p.timestamp)
                ? zonedParts(p.timestamp, "Europe/Stockholm").date : null, price: p.close }));
            return { status: 200, body: navPair(points, { isin, currency, provider: "Avanza", checkedAt, latest: { date, price } }) };
        } catch (error) {
            const code = /^(FX_|NAV_|REFERENCE_)[A-Z_]+$/.test(error.message) ? error.message : "REFERENCE_PROVIDER_UNAVAILABLE";
            return { status: code === "REFERENCE_REQUEST_INVALID" ? 400 : 502,
                body: { apiVersion: REFERENCE_DATA_VERSION, error: code } };
        }
    };
}
