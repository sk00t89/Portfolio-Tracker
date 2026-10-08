import { zonedParts, addCalendarDays, LISTING_CALENDARS, normalizeMarketCode } from "./marketCalendar.js";
import { cryptoCoinIds, lysaFundIsins } from "./instrumentCatalog.js";
import { createFundNavProvider } from "./fundNavProviders.js";
import { createListedProductProvider, isListedProduct } from "./listedProductProviders.js";
import { providerHttpError } from "./providerDiagnostics.js";
import { normalizeYahooSymbol } from "./yahooSymbol.js";

// These maps are bundled into the function; no client API keys are used.
export function createSnapshotProviders({ fetcher = fetch, coinGeckoKey = "", clock = Date.now, budgetMs = 65000 } = {}) {
    const cache = new Map();
    const deadline = clock() + budgetMs;
    async function get(url, headers = {}, options = {}) {
        const remaining = deadline - clock();
        if (remaining <= 0) throw new Error("Market fetch budget exhausted");
        let response;
        try {
            response = await fetcher(url, { ...options, headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(Math.min(12000, remaining)) });
        } catch {
            throw new Error("Market provider unavailable or timed out");
        }
        if (!response.ok) throw await providerHttpError(response, url, headers, [coinGeckoKey]);
        try { return await response.json(); } catch { throw new Error("Invalid market response"); }
    }
    function once(key, operation) {
        if (!cache.has(key)) cache.set(key, operation());
        return cache.get(key);
    }
    function yahooClose(holding, session, verifyIsin = false, request = get) {
        const symbol = normalizeYahooSymbol(holding.ticker, session.market);
        return once(`close:${symbol}:${session.date}:${verifyIsin ? holding.isin : "listing"}`, async () => {
            const start = Math.floor(Date.parse(`${session.date}T00:00:00Z`) / 1000);
            const end = Math.floor(Date.parse(`${addCalendarDays(session.date, 2)}T00:00:00Z`) / 1000);
            const data = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`, { "User-Agent": "Mozilla/5.0" });
            const result = data.chart?.result?.[0];
            if (!result || data.chart?.error || result.meta?.symbol?.toUpperCase() !== symbol.toUpperCase()) throw new Error("Unverified Yahoo instrument");
            if (verifyIsin && (!holding.isin || String(result.meta.isin ?? "").toUpperCase() !== String(holding.isin).toUpperCase())) throw new Error("Yahoo listed-product ISIN unavailable or unverified");
            const expectedVenues = session.market === "STOCKHOLM" ? ["STO"] : ["NYQ", "NMS", "NGM", "NCM", "ASE", "PCX", "BTS"];
            if (!expectedVenues.includes(result.meta.exchangeName) || result.meta.exchangeTimezoneName !== session.zone) throw new Error("Unverified Yahoo exchange");
            const index = (result.timestamp ?? []).findIndex((time) => zonedParts(time * 1000, session.zone).date === session.date);
            if (index < 0) throw new Error("Completed session bar unavailable");
            return { price: result.indicators?.quote?.[0]?.close?.[index], currency: result.meta.currency, timestamp: result.timestamp[index] * 1000, date: session.date, kind: "session_close" };
        });
    }
    const listedClose = createListedProductProvider({ request: get, once, clock, yahooClose });
    return {
        fund: createFundNavProvider({ request: get, once, clock }),
        crypto(holding) {
            const id = holding.coinId ?? cryptoCoinIds[holding.ticker];
            if (!id) throw new Error("Missing verified CoinGecko ID");
            return once(`crypto:${id}`, async () => {
                const data = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=sek&include_last_updated_at=true`, coinGeckoKey ? { "x-cg-demo-api-key": coinGeckoKey } : {});
                return { price: data[id]?.sek, currency: "SEK", timestamp: data[id]?.last_updated_at };
            });
        },
        close(holding, session) {
            // Never infer a listing from country alone; unlisted mutual funds need a dedicated NAV adapter.
            const venue = normalizeMarketCode(holding.market);
            const supportedMarkets = Object.keys(LISTING_CALENDARS);
            if (!holding.ticker || !supportedMarkets.includes(venue)) {
                const issues = [];
                if (!holding.ticker) issues.push({ field: "ticker", issue: "missing", value: holding.ticker ?? null });
                if (!supportedMarkets.includes(venue)) issues.push({ field: "market", issue: venue === "" ? "missing" : "unsupported",
                    value: holding.market ?? null, attemptedCode: venue, supportedCodes: supportedMarkets });
                const error = new Error("Unsupported/missing listing identifier");
                error.diagnostics = { code: "UNSUPPORTED_LISTING_IDENTIFIER", instrument: {
                    name: holding.name ?? null, ticker: holding.ticker ?? null, instrumentId: holding.instrumentId ?? null,
                    provider: holding.provider ?? null, assetType: holding.assetType ?? null,
                    exchange: holding.exchange ?? holding.market ?? null, market: holding.market ?? null,
                    country: holding.country ?? null, isin: holding.isin ?? null,
                }, listing: { issues, calendarCode: session.market } };
                throw error;
            }
            return isListedProduct(holding) ? listedClose(holding, session) : yahooClose(holding, session);
        },
        fx(currency) {
            return once(`fx:${currency}`, async () => {
                const data = await get(`https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=SEK`);
                if (data.base !== currency) throw new Error("Unverified FX base");
                return { rate: data.rates?.SEK, date: data.date };
            });
        },
        async lysa(name) {
            const isin = lysaFundIsins[name];
            if (!isin) throw new Error("Unknown Lysa fund");
            const data = await once("lysa", () => get("https://api.lysa.se/funds"));
            return { price: data[isin]?.price, date: data[isin]?.date, currency: "SEK", kind: "published_nav" };
        },
    };
}
