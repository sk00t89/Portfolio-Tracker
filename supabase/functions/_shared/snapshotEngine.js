import { holdingMarket, latestCompletedSession, zonedParts } from "./marketCalendar.js";
import { attachHttpInstrument } from "./providerDiagnostics.js";
import { lysaFundIsins } from "./instrumentCatalog.js";

const DAY = 86400000;
export function snapshotHoldingFromDatabase(row) {
    return { id: row.id, name: row.name, instrumentId: row.instrument_id, exchange: row.exchange ?? row.market,
        quantity: row.quantity, ticker: row.ticker, coinId: row.coin_id,
        isin: row.isin, assetType: row.asset_type, productType: row.product_type,
        market: row.market, country: row.country, provider: row.provider, platform: row.platform };
}
export function isMutualFund(holding) {
    const type = String(holding.assetType ?? "").trim().toUpperCase();
    const product = String(holding.productType ?? "").trim().toUpperCase();
    const listedProducts = ["ETF", "ETP", "EXCHANGE_TRADED_FUND", "CERTIFICATE", "TRACKER", "INDEX", "SINGLE_ASSET", "STAKING"];
    // FUND alone is ambiguous: the importer also normalizes ETFs to FUND.
    // Any explicit listing (including an unsupported one) retains the calendar requirement.
    const venues = [holding.market, holding.exchange].map((value) => String(value ?? "").trim().toUpperCase());
    return type === "FUND" && !listedProducts.includes(product) && venues.every((venue) => ["", "FUND", "MUTUAL_FUND"].includes(venue));
}
export function sourceTime(value) {
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    if (typeof value !== "string" || !value.trim()) return NaN;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : Date.parse(value);
}
function positive(value, label) {
    if (value == null || value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error(`Invalid ${label}`);
    return Number(value);
}
export function checkPublishedDate(value, now, maxDays, label) {
    const time = sourceTime(value);
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : Number.isFinite(time) ? zonedParts(time).date : "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(time).toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${label} calendar date`);
    const today = zonedParts(now).date;
    const age = (Date.parse(today) - Date.parse(date)) / DAY;
    if (!Number.isFinite(time) || !Number.isFinite(age) || age < 0 || age > maxDays || (value?.length !== 10 && time > now + 60000)) throw new Error(`Stale/invalid ${label}`);
    return date;
}
// Providers return source timestamps, never fabricated fetch timestamps.
// All positions must succeed; no partial total is returned.
export async function valuePortfolio(input, providers, now = Date.now()) {
    if (!input?.ready || !Array.isArray(input.holdings) || !Array.isArray(input.manual_assets) || !Array.isArray(input.lysa_transactions)) throw new Error("Incomplete portfolio inputs");
    let total = 0;
    const sources = [];
    const fxCache = new Map();
    async function contextual(holding, operation) {
        try { return await operation(); } catch (error) { throw attachHttpInstrument(error, holding); }
    }
    async function inSek(price, currency, holding) {
        if (currency === "SEK") return price;
        if (!/^[A-Z]{3}$/.test(currency ?? "")) throw new Error("Missing/unsupported currency");
        if (!fxCache.has(currency)) fxCache.set(currency, providers.fx(currency));
        const fx = await contextual(holding, () => fxCache.get(currency));
        const rate = positive(fx.rate, "FX rate");
        checkPublishedDate(fx.date, now, 7, "FX date");
        return price * rate;
    }
    for (const asset of input.manual_assets) {
        if (asset.value_sek == null || !Number.isFinite(Number(asset.value_sek)) || Number(asset.value_sek) < 0) throw new Error("Invalid manual asset");
        total += Number(asset.value_sek);
    }
    for (const holding of input.holdings) {
        if (holding.quantity == null || !Number.isFinite(Number(holding.quantity)) || Number(holding.quantity) < 0) throw new Error("Invalid holding quantity");
        const quantity = Number(holding.quantity);
        if (quantity === 0) continue;
        const market = holdingMarket(holding);
        let quote;
        let kind;
        if (isMutualFund(holding)) {
            quote = await providers.fund(holding, now);
            if (quote.kind !== "published_nav") throw new Error("Unverified fund NAV");
            const date = checkPublishedDate(quote.date ?? quote.timestamp, now, 7, "fund NAV");
            quote = { ...quote, date };
            kind = "published_nav";
        } else if (market === "CRYPTO") {
            quote = await contextual(holding, () => providers.crypto(holding));
            const time = sourceTime(quote.timestamp);
            if (!Number.isFinite(time) || time > now + 60000 || now - time > 30 * 60000) throw new Error("Stale/invalid crypto quote");
            kind = "crypto";
        } else {
            const session = latestCompletedSession(market, now);
            if (!session) {
                const error = new Error("Unsupported or unknown trading calendar");
                error.diagnostics = {
                    code: "UNSUPPORTED_TRADING_CALENDAR",
                    instrument: {
                        name: holding.name ?? null, ticker: holding.ticker ?? null,
                        instrumentId: holding.instrumentId ?? null, exchange: holding.exchange ?? holding.market ?? null,
                        market: holding.market ?? null, country: holding.country ?? null,
                        exchangeCode: String(holding.market ?? "").toUpperCase(), calendarCode: market,
                    },
                };
                throw error;
            }
            quote = await contextual(holding, () => providers.close(holding, session));
            if (quote.date !== session.date || quote.kind !== "session_close") throw new Error("Unverified completed session close");
            kind = "session_close";
        }
        const price = positive(quote.price, "quote price");
        total += quantity * await inSek(price, quote.currency, holding);
        sources.push({ id: holding.id, kind, date: quote.date ?? null, timestamp: quote.timestamp ?? null,
            ...(quote.sourceMetadata ? { sourceMetadata: quote.sourceMetadata } : {}),
            ...(quote.provider ? { provider: quote.provider, attemptedProviders: quote.attemptedProviders } : {}) });
    }
    const volumes = new Map();
    for (const transaction of input.lysa_transactions) {
        const sign = ["Buy", "Switch buy"].includes(transaction.type) ? 1 : ["Sell", "Switch sell"].includes(transaction.type) ? -1 : 0;
        if (!sign) continue;
        if (!transaction.fundName || !Number.isFinite(Number(transaction.volume)) || Number(transaction.volume) <= 0) throw new Error("Invalid Lysa transaction");
        volumes.set(transaction.fundName, (volumes.get(transaction.fundName) ?? 0) + sign * Number(transaction.volume));
    }
    for (const [name, rawVolume] of volumes) {
        const quantity = Math.round(rawVolume * 10000) / 10000;
        if (quantity < 0) throw new Error("Negative Lysa quantity");
        if (!quantity) continue;
        const quote = await contextual({ name, provider: "Lysa", assetType: "FUND", market: "FUND", isin: lysaFundIsins[name] ?? null }, () => providers.lysa(name));
        const date = checkPublishedDate(quote.date, now, 7, "Lysa NAV");
        if (quote.kind !== "published_nav" || quote.currency !== "SEK") throw new Error("Unverified Lysa NAV");
        total += quantity * positive(quote.price, "Lysa NAV");
        sources.push({ name, kind: "published_nav", date });
    }
    if (!Number.isFinite(total) || total < 0) throw new Error("Invalid total");
    return { totalValueSek: total, sources, fx: [...fxCache.keys()] };
}
