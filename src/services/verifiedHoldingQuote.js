import { quoteFreshnessReason, normalizeQuoteTimestamp } from "../utils/valuationFreshness.js";
import getYahooSymbol from "../utils/getYahooSymbol.js";
import { LISTING_CALENDARS, normalizeMarketCode } from "../../supabase/functions/_shared/marketCalendar.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { safeQuoteDiagnostics } from "../../supabase/functions/_shared/quoteDiagnostics.js";
import { hasCompleteDailyQuote } from "../utils/dailyQuote.js";
import { zonedParts } from "../../supabase/functions/_shared/marketCalendar.js";

const invalid = (code) => Object.assign(new Error(code), { code });
const equal = (a, b) => String(a ?? "").toUpperCase() === String(b ?? "").toUpperCase();

export async function getVerifiedHoldingQuote(holding, providers, clock = Date.now, onDiagnostics = () => {}) {
    const attempts = [];
    const diagnostics = [];
    let valuationQuote = null;
    let valuationSource;
    const resolvedPrimaryIsins = new Set();
    const fund = isMutualFund(holding);
    const directCrypto = String(holding.assetType).toUpperCase() === "CRYPTO" && !holding.isin && holding.productType !== "ETP";
    const byId = async (fetchQuote) => {
        const quote = await fetchQuote(holding.instrumentId);
        if (String(quote?.instrumentId) !== String(holding.instrumentId)) throw invalid("QUOTE_IDENTITY_MISMATCH");
        return quote;
    };
    const byIsin = async (fetchQuote) => {
        const quote = await fetchQuote(holding.isin);
        if (!equal(quote?.isin, holding.isin)) throw invalid("QUOTE_IDENTITY_MISMATCH");
        return quote;
    };
    const add = (provider, stage, load) => attempts.push({ provider, stage, load });
    if (fund) {
        add("Fund NAV", "published-nav", async () => {
            const quote = await providers.getFundNav(holding);
            if (quote?.kind !== "published_nav") throw invalid("NAV_KIND_UNVERIFIED");
            return quote;
        });
    } else if (directCrypto) {
        if (holding.coinId) add("CoinGecko", "crypto", async () => {
            const quote = await providers.getCryptoPrice(holding.coinId);
            if (quote?.coinId !== holding.coinId || quote.currency !== "SEK") throw invalid("QUOTE_IDENTITY_MISMATCH");
            return quote;
        });
    } else {
        if (holding.provider === "Nordnet" && holding.instrumentId) add("Nordnet", "instrument-id", () => byId(providers.getNordnetPriceByInstrumentId));
        if (holding.provider === "Avanza" && holding.instrumentId) add("Avanza", "instrument-id", () => byId(providers.getAvanzaPriceByInstrumentId));
        if (holding.isin) {
            add("Avanza", "isin", () => byIsin(providers.getAvanzaPriceByIsin));
            add("Nordnet", "isin", () => byIsin(providers.getNordnetPriceByIsin));
        }
        const symbol = getYahooSymbol(holding);
        if (symbol) add("Yahoo", "chart", async () => {
            const quote = await providers.getYahooPrice(symbol);
            if (!equal(quote?.symbol, symbol)) throw invalid("QUOTE_IDENTITY_MISMATCH");
            const market = LISTING_CALENDARS[normalizeMarketCode(holding.market)];
            const venues = market === "USA" ? ["NYQ", "NMS", "NGM", "NCM", "ASE", "PCX", "BTS"] : market === "STOCKHOLM" ? ["STO"] : [];
            if (!venues.includes(quote.exchangeName)) throw invalid("QUOTE_MARKET_MISMATCH");
            return quote;
        });
    }
    for (const { provider, stage, load } of attempts) {
        // The primary response already proved this broker ID belongs to the requested ISIN.
        // Re-discovering the same broker instrument cannot repair its invalid price/time response.
        if (stage === "isin" && resolvedPrimaryIsins.has(provider)) continue;
        try {
            const quote = await load();
            diagnostics.push(...safeQuoteDiagnostics(quote?.diagnostics));
            if (stage === "instrument-id" && holding.isin && equal(quote?.isin, holding.isin)) resolvedPrimaryIsins.add(provider);
            if (!quote || !Number.isFinite(Number(quote.price)) || !(Number(quote.price) > 0)) throw invalid("QUOTE_PRICE_INVALID");
            if (!/^[A-Z]{3}$/.test(quote.currency ?? "") || (holding.currency && quote.currency !== holding.currency)) throw invalid("QUOTE_CURRENCY_MISMATCH");
            if (quote.isin && holding.isin && !equal(quote.isin, holding.isin)) throw invalid("QUOTE_IDENTITY_MISMATCH");
            const reason = quoteFreshnessReason({ ...holding, priceUpdatedAt: quote.timestamp }, clock());
            if (reason) throw invalid(normalizeQuoteTimestamp(quote.timestamp) == null ? "QUOTE_SOURCE_TIME_INVALID" : "QUOTE_SOURCE_TIME_NOT_RELEVANT");
            const candidate = { ...quote, price: Number(quote.price), timestamp: normalizeQuoteTimestamp(quote.timestamp), checkedAt: clock() };
            if (!valuationQuote) {
                valuationQuote = candidate;
                valuationSource = { provider, stage };
            }
            const calendar = LISTING_CALENDARS[normalizeMarketCode(holding.market)];
            const zone = calendar === "USA" ? "America/New_York" : "Europe/Stockholm";
            const isToday = zonedParts(candidate.timestamp, zone).date === zonedParts(clock(), zone).date;
            if (!fund && !directCrypto && isToday && !hasCompleteDailyQuote(holding, candidate, clock())) {
                diagnostics.push({ provider, stage, outcome: "received", reasonCode: "DAILY_PREVIOUS_CLOSE_MISSING" });
                continue;
            }
            diagnostics.push({ provider, stage, outcome: "accepted" });
            const safe = safeQuoteDiagnostics(diagnostics);
            onDiagnostics(safe);
            return { ...candidate, diagnostics: safe };
        } catch (error) {
            diagnostics.push(...safeQuoteDiagnostics(error?.diagnostics));
            diagnostics.push({ provider, stage, outcome: "rejected", reasonCode: error.code ?? "PROVIDER_UNAVAILABLE", httpStatus: error.httpStatus });
        }
    }
    if (valuationQuote) diagnostics.push({ ...valuationSource, outcome: "accepted", reasonCode: "VALUATION_ONLY" });
    const safe = safeQuoteDiagnostics(diagnostics);
    onDiagnostics(safe);
    return valuationQuote ? { ...valuationQuote, diagnostics: safe } : null;
}

// A batch belongs to one user's observation. All positions reuse the same price/time pair,
// while quantity and SEK value are computed independently by the caller.
export function createVerifiedQuoteBatch(userId, providers, clock = Date.now) {
    const cache = new Map();
    return async (holding, onDiagnostics = () => {}) => {
        const key = JSON.stringify([userId, holding.provider, holding.instrumentId, holding.isin, holding.ticker,
            holding.assetType, holding.productType, holding.market, holding.currency, holding.coinId]);
        if (!cache.has(key)) cache.set(key, (async () => {
            let diagnostics;
            const quote = await getVerifiedHoldingQuote(holding, providers, clock, (value) => { diagnostics = value; });
            return { quote, diagnostics };
        })());
        const result = await cache.get(key);
        onDiagnostics(result.diagnostics);
        if (result.quote && quoteFreshnessReason({ ...holding, priceUpdatedAt: result.quote.timestamp }, clock())) return null;
        return result.quote;
    };
}
