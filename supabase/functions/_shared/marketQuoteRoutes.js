import { createFundNavProvider } from "./fundNavProviders.js";
import { providerHttpError } from "./providerDiagnostics.js";
import { normalizeYahooSymbol } from "./yahooSymbol.js";
import { MARKET_QUOTE_VERSION, safeQuoteDiagnostics } from "./quoteDiagnostics.js";

export { MARKET_QUOTE_VERSION } from "./quoteDiagnostics.js";
const brokerHeaders = { "Client-Id": "NEXT", Referer: "https://www.nordnet.se/", "X-Nn-Href": "https://www.nordnet.se/" };
const upper = (value) => String(value ?? "").trim().toUpperCase();
const fault = (code) => Object.assign(new Error(code), { code });

// Runtime-neutral: used by both Express and Deno. Only public, allowlisted diagnostics leave this module.
export function createMarketQuoteRoutes({ fetcher = fetch, clock = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console } = {}) {
    async function request(url, headers = {}, options = {}) {
        for (let attempt = 0; ; attempt++) {
            let response;
            try {
                response = await fetcher(url, { ...options, headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0", ...headers },
                    signal: AbortSignal.timeout(10000) });
            } catch { throw fault("PROVIDER_TRANSPORT_ERROR"); }
            if (!response.ok) {
                if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
                    const retryAfter = Number(response.headers?.get("retry-after"));
                    await response.body?.cancel?.();
                    await sleep(Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500, 500), 2000));
                    continue;
                }
                throw await providerHttpError(response, url, headers);
            }
            try { return await response.json(); } catch { throw fault("PROVIDER_INVALID_JSON"); }
        }
    }
    function event(provider, stage, outcome, error = null) {
        return { provider, stage, outcome, ...(error ? { reasonCode: error.code ?? error.diagnostics?.code ?? "QUOTE_UNAVAILABLE",
            ...(error.diagnostics?.httpStatus ? { httpStatus: error.diagnostics.httpStatus } : {}) } : {}) };
    }
    async function avanza(id, isin = null) {
        const data = await request(`https://www.avanza.se/_api/market-guide/stock/${encodeURIComponent(id)}`, { Referer: "https://www.avanza.se/" });
        const returnedId = data.orderbookId ?? data.orderBookId ?? data.id;
        if ((returnedId != null && String(returnedId) !== String(id)) || (isin && upper(data.isin) !== upper(isin))) throw fault("QUOTE_IDENTITY_MISMATCH");
        return { instrumentId: String(id), isin: data.isin ?? null, price: data.quote?.last ?? null,
            currency: data.quote?.currency ?? data.listing?.currency ?? data.currency ?? null,
            market: data.listing?.marketPlaceCode ?? null, previousClose: data.quote?.previousClose ?? null,
            // timeOfLast is the provider's last-price field. updated is only a refresh time and is never used.
            timestamp: data.quote?.timestamp ?? data.quote?.timeOfLast ?? null };
    }
    return async function route(url) {
        const path = url.pathname.replace(/^.*\/market-api(?=\/api\/)/, "");
        const diagnostics = [];
        let provider, stage;
        let match;
        try {
            match = path.match(/^\/api\/yahoo-price\/([^/]+)$/);
            if (match) {
                provider = "Yahoo"; stage = "chart";
                const symbol = normalizeYahooSymbol(decodeURIComponent(match[1]));
                let lastError;
                for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
                    try {
                        const data = await request(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
                        const result = data.chart?.result?.[0];
                        if (data.chart?.error || !result) throw fault("YAHOO_INSTRUMENT_MISSING");
                        if (upper(result.meta?.symbol) !== symbol) throw fault("QUOTE_IDENTITY_MISMATCH");
                        diagnostics.push(event(provider, host, "received"));
                        return { status: 200, body: { apiVersion: MARKET_QUOTE_VERSION, symbol: result.meta.symbol,
                            price: result.meta.regularMarketPrice ?? null, previousClose: result.meta.chartPreviousClose ?? null,
                            timestamp: result.meta.regularMarketTime ?? null, currency: result.meta.currency ?? null,
                            exchangeName: result.meta.exchangeName ?? null, diagnostics } };
                    } catch (error) {
                        diagnostics.push(event(provider, host, "rejected", error));
                        lastError = error;
                        // Bad identities and unknown symbols are not transient failures.
                        if (error.code === "QUOTE_IDENTITY_MISMATCH" || error.code === "YAHOO_INSTRUMENT_MISSING" || error.diagnostics?.httpStatus === 404) break;
                    }
                }
                throw lastError;
            }
            match = path.match(/^\/api\/avanza-price\/([^/]+)$/);
            if (match) {
                provider = "Avanza"; stage = "instrument-id";
                const quote = await avanza(decodeURIComponent(match[1]));
                return { status: 200, body: { ...quote, apiVersion: MARKET_QUOTE_VERSION, diagnostics: [event(provider, stage, "received")] } };
            }
            match = path.match(/^\/api\/avanza-search\/([^/]+)$/);
            if (match) {
                provider = "Avanza"; stage = "isin-discovery";
                const isin = decodeURIComponent(match[1]);
                const search = await request("https://www.avanza.se/_api/search/filtered-search", { Referer: "https://www.avanza.se/", "Content-Type": "application/json" }, {
                    method: "POST", body: JSON.stringify({ query: isin, searchFilter: { types: [] }, screenSize: "DESKTOP",
                        pagination: { from: 0, size: 30 }, originPath: "/", originPlatform: "PWA", searchSessionId: crypto.randomUUID() }),
                });
                const candidates = (search.hits ?? []).filter((hit) => hit.type !== "FUND" && (!hit.isin || upper(hit.isin) === upper(isin))).slice(0, 5);
                for (const hit of candidates) {
                    const id = hit.orderBookId ?? hit.orderbookId;
                    if (id == null) continue;
                    try {
                        const quote = await avanza(id, isin);
                        return { status: 200, body: { ...quote, orderBookId: id, apiVersion: MARKET_QUOTE_VERSION,
                            diagnostics: [...diagnostics, event(provider, "isin-detail", "received")] } };
                    } catch (error) { diagnostics.push(event(provider, "isin-detail", "rejected", error)); }
                }
                throw fault("QUOTE_IDENTITY_UNVERIFIED");
            }
            match = path.match(/^\/api\/nordnet-(price|search)\/([^/]+)$/);
            if (match) {
                provider = "Nordnet"; stage = match[1] === "price" ? "instrument-id" : "isin";
                const identity = decodeURIComponent(match[2]);
                const byId = match[1] === "price";
                const data = await request(`https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=${byId ? "instrument_id" : "isin"}%3D${encodeURIComponent(identity)}`, brokerHeaders);
                const instrument = (data.results ?? []).find((item) => byId ? String(item.instrument_info?.instrument_id) === identity : upper(item.instrument_info?.isin) === upper(identity));
                if (!instrument) throw fault("QUOTE_IDENTITY_MISMATCH");
                const info = instrument.instrument_info;
                let price = instrument.price_info;
                if (byId) {
                    const prices = await request(`https://www.nordnet.se/api/2/instruments/price/${encodeURIComponent(identity)}?request_realtime=false`, brokerHeaders);
                    price = prices.find((item) => String(item.instrument_id) === identity);
                }
                if (!price) throw fault("QUOTE_MISSING");
                return { status: 200, body: { instrumentId: info.instrument_id, isin: info.isin, currency: info.currency,
                    price: byId ? price.last : price.last?.price, previousClose: byId ? price.close : price.close?.price,
                    timestamp: price.tick_timestamp ?? null, apiVersion: MARKET_QUOTE_VERSION, diagnostics: [event(provider, stage, "received")] } };
            }
            if (path === "/api/fund-nav") {
                provider = "Fund NAV"; stage = "published-nav";
                const holding = { assetType: "FUND", market: "FUND", provider: url.searchParams.get("provider"),
                    instrumentId: url.searchParams.get("instrumentId"), isin: url.searchParams.get("isin") };
                // Cache only within this verified NAV request, never across users or observations.
                const cache = new Map();
                const once = (key, operation) => { if (!cache.has(key)) cache.set(key, operation()); return cache.get(key); };
                const quote = await createFundNavProvider({ request, once, clock,
                    onAttempt: (value) => diagnostics.push(value) })(holding);
                return { status: 200, body: { ...quote, timestamp: quote.timestamp ?? quote.date, apiVersion: MARKET_QUOTE_VERSION,
                    diagnostics: safeQuoteDiagnostics(diagnostics) } };
            }
            return null;
        } catch (error) {
            const safe = [...diagnostics, event(provider, stage, "rejected", error)];
            for (const attempt of error?.diagnostics?.attempts ?? []) safe.push({ provider: attempt.provider, stage: "published-nav", outcome: "rejected", reasonCode: "NAV_UNAVAILABLE" });
            for (const http of error?.diagnostics?.httpErrors ?? []) safe.push({ provider: http.marketProvider, stage: "published-nav", outcome: "rejected", reasonCode: "MARKET_PROVIDER_HTTP_ERROR", httpStatus: http.httpStatus });
            const sanitized = safeQuoteDiagnostics(safe);
            logger.warn?.("market-quote-failed", { apiVersion: MARKET_QUOTE_VERSION, diagnostics: sanitized });
            return { status: error?.diagnostics?.httpStatus === 404 ? 404 : 502,
                body: { apiVersion: MARKET_QUOTE_VERSION, error: "Verifierad kurs kunde inte hämtas", diagnostics: sanitized } };
        }
    };
}
