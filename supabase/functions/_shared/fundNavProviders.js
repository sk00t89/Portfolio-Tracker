import { checkPublishedDate } from "./snapshotEngine.js";
import { diagnosticInstrument } from "./providerDiagnostics.js";

const normalized = (value) => String(value ?? "").trim().toUpperCase();
const namedProvider = (value) => ({ AVANZA: "Avanza", NORDNET: "Nordnet" })[normalized(value)] ?? null;
const listedTypes = ["STOCK", "COMMON_STOCK", "ETF", "ETP", "EXCHANGE_TRADED_FUND", "CERTIFICATE", "TRACKER"];
function requireFundType(...types) {
    if (types.some((type) => listedTypes.includes(normalized(type).replaceAll(" ", "_")))) throw new Error("Source instrument is exchange-traded, not a mutual fund");
}
function validQuote(quote, now) {
    const raw = quote.price;
    const price = typeof raw === "string" ? Number(raw.replace(/\s/g, "").replace(",", ".")) : Number(raw);
    if (raw == null || !Number.isFinite(price) || price <= 0) throw new Error("Missing/invalid fund NAV");
    if (!/^[A-Z]{3}$/.test(quote.currency ?? "")) throw new Error("Missing/invalid fund NAV currency");
    const date = checkPublishedDate(quote.date ?? quote.timestamp, now, 7, "fund NAV");
    return { ...quote, price, date, kind: "published_nav" };
}

export function createFundNavProvider({ request, once, clock }) {
    async function nordnet(ownId, isin, request) {
        const headers = { "Client-Id": "NEXT", Referer: "https://www.nordnet.se/", "X-Nn-Href": "https://www.nordnet.se/" };
        let id = ownId;
        if (!id) {
            const search = await request(`https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=isin%3D${encodeURIComponent(isin)}`, headers);
            const hit = search.results?.find((item) => normalized(item.instrument_info?.isin ?? item.isin) === isin);
            id = hit?.instrument_info?.instrument_id ?? hit?.instrument_id;
            if (!id) throw new Error("Fund ISIN not found at Nordnet NAV provider");
        }
        const data = await request(`https://www.nordnet.se/api/2/instrument_search/query/fundlist?apply_filters=instrument_id%3D${encodeURIComponent(id)}`, headers);
        const fund = data.results?.find((item) => String(item.instrument_info?.instrument_id) === String(id));
        const info = fund?.instrument_info;
        if (!info || (isin && normalized(info.isin) !== isin)) throw new Error("Unverified mutual fund identity");
        requireFundType(fund.instrument_type, fund.instrument_class, info.instrument_type);
        return { price: fund.price_info?.last?.price, currency: info.currency, timestamp: fund.price_info?.tick_timestamp };
    }
    async function avanza(ownId, isin, now, request) {
        const headers = { Referer: "https://www.avanza.se/" };
        let ids = ownId ? [ownId] : [];
        if (!ownId) {
            const search = await request("https://www.avanza.se/_api/search/filtered-search", { ...headers, "Content-Type": "application/json" }, {
                method: "POST", body: JSON.stringify({ query: isin, searchFilter: { types: ["FUND"] }, screenSize: "DESKTOP",
                    pagination: { from: 0, size: 30 }, originPath: "/", originPlatform: "PWA", searchSessionId: crypto.randomUUID() }),
            });
            // Search is only candidate discovery; the fund detail response must verify the actual ISIN.
            ids = (search.hits ?? []).filter((hit) => normalized(hit.type) === "FUND" && (!hit.isin || normalized(hit.isin) === isin))
                .map((hit) => hit.orderBookId ?? hit.orderbookId).filter((id) => id != null).slice(0, 5);
            if (!ids.length) throw new Error("Fund ISIN not found at Avanza NAV provider");
        }
        let lastError;
        for (const id of ids) {
            for (const path of ["market-guide/fund", "fund-guide/guide"]) {
                try {
                    const data = await request(`https://www.avanza.se/_api/${path}/${encodeURIComponent(id)}`, headers);
                    const returnedId = data.orderbookId ?? data.orderBookId ?? data.id;
                    if ((returnedId != null && String(returnedId) !== String(id)) || (isin ? normalized(data.isin) !== isin : returnedId == null)) throw new Error("Unverified Avanza fund identity");
                    requireFundType(data.type, data.instrumentType, data.orderbookType);
                    const nav = data.nav;
                    const quote = { price: data.quote?.last ?? (typeof nav === "object" ? nav?.value : nav),
                        currency: data.quote?.currency ?? nav?.currency ?? data.navCurrency ?? data.currency,
                        timestamp: data.navDate ?? nav?.date ?? data.quote?.timestamp };
                    return validQuote(quote, now);
                } catch (error) { lastError = error; }
            }
        }
        throw lastError ?? new Error("Avanza fund NAV unavailable");
    }
    return function fund(holding, observedAt = clock()) {
        const isin = normalized(holding.isin);
        const idProvider = namedProvider(holding.provider);
        const provider = idProvider ?? (!normalized(holding.provider) ? namedProvider(holding.platform) : null);
        const id = holding.instrumentId;
        // Provider namespaces are separate: never pass an Avanza ID to Nordnet, or vice versa.
        return once(`fund:${provider ?? "unknown"}:${isin}:${id ?? ""}:${observedAt}`, async () => {
            const attemptedProviders = [];
            const attempts = [];
            const httpErrors = [];
            async function fundRequest(...args) {
                try { return await request(...args); } catch (error) {
                    if (error?.diagnostics?.code === "MARKET_PROVIDER_HTTP_ERROR") httpErrors.push({ ...error.diagnostics, listingCode: normalized(holding.market) });
                    throw error;
                }
            }
            const order = provider ? [provider, ...["Avanza", "Nordnet"].filter((item) => item !== provider)] : ["Avanza", "Nordnet"];
            for (const target of order) {
                const ownId = target === idProvider && id != null && String(id).trim() ? id : null;
                if (!ownId && !isin) continue; // Cross-provider lookup requires a verifiable ISIN.
                attemptedProviders.push(target);
                try {
                    const raw = target === "Avanza" ? await avanza(ownId, isin, observedAt, fundRequest) : await nordnet(ownId, isin, fundRequest);
                    return { ...validQuote(raw, observedAt), provider: target, attemptedProviders: [...attemptedProviders] };
                } catch (error) { attempts.push({ provider: target, reason: error.message }); }
            }
            const error = new Error(attempts.length ? "Fund NAV unavailable from attempted providers" : "Missing verified fund identifier");
            error.diagnostics = { code: "FUND_NAV_UNAVAILABLE", provider: holding.provider ?? null, sourceProvider: provider,
                attemptedProviders, attempts, instrument: diagnosticInstrument(holding), ...(httpErrors.length ? { httpErrors } : {}) };
            throw error;
        });
    };
}
