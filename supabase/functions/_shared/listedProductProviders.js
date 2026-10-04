import { LISTING_CALENDARS, getMarketStatus, latestCompletedSession, zonedParts, normalizeMarketCode } from "./marketCalendar.js";
import { diagnosticInstrument } from "./providerDiagnostics.js";

const norm = (value) => String(value ?? "").trim().toUpperCase();
const providerName = (value) => ({ AVANZA: "Avanza", NORDNET: "Nordnet" })[norm(value)] ?? null;
export const isListedProduct = (holding) => [holding.assetType, holding.productType]
    .some((type) => ["CERTIFICATE", "ETP", "TRACKER", "EXCHANGE_TRADED_PRODUCT"].includes(norm(type).replaceAll(" ", "_")));
const timestamp = (value) => typeof value === "number" ? (value < 1e12 ? value * 1000 : value)
    : typeof value === "string" && /[T ]\d\d:\d\d/.test(value) ? Date.parse(value) : NaN;

const BEFORE_CLOSE_MS = 5 * 60000;
const AFTER_CLOSE_MS = 60 * 60000;

// A last-trade quote is not a historical daily bar. Accept only a real closing-session
// timestamp near close. Broker last/tick_timestamp may describe a delayed quote,
// so retain broker provenance rather than claiming a historical bar. Never use previousClose.
const diagnosticIso = (value) => Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
function closingQuote(raw, session, now, recordTime = () => {}) {
    const time = timestamp(raw.timestamp);
    const status = getMarketStatus(session.market, now);
    const latest = latestCompletedSession(session.market, now);
    const windowStart = session.closesAt - BEFORE_CLOSE_MS;
    const windowEnd = session.closesAt + AFTER_CLOSE_MS;
    const normalizedIso = diagnosticIso(time);
    const quoteDate = normalizedIso ? zonedParts(time, session.zone).date : null;
    const failedConditions = [];
    if (!status.known) failedConditions.push("market_status_unknown");
    else if (!["after_close", "before_open", "closed_day"].includes(status.status)) failedConditions.push("market_open");
    if (raw.timestamp == null || (typeof raw.timestamp === "string" && !raw.timestamp.trim())) failedConditions.push("timestamp_missing");
    else if (!normalizedIso) failedConditions.push("timestamp_invalid");
    if (Number.isFinite(time)) {
        if (time > now) failedConditions.push("timestamp_future");
        if (time < windowStart) failedConditions.push("before_window");
        if (time > windowEnd) failedConditions.push("after_window");
    }
    if (latest?.date !== session.date || latest?.closesAt !== session.closesAt || (quoteDate && quoteDate !== session.date))
        failedConditions.push("wrong_session");
    if (latest && (session.date < latest.date || (quoteDate && quoteDate < latest.date))) failedConditions.push("stale_session");
    recordTime({ brokerQuotePrice: safeIdentityValue(raw.price), brokerQuoteTimestampRaw: ["string", "number", "boolean"].includes(typeof raw.timestamp) ? raw.timestamp : null,
        rawTimestampType: raw.timestamp === null ? "null" : typeof raw.timestamp,
        normalizedTimestamp: normalizedIso, normalizedTimestampMs: Number.isFinite(time) ? time : null,
        quoteSessionDate: quoteDate, latestCompletedSessionDate: latest?.date ?? null, requestedSessionDate: session.date,
        officialSessionCloseTimestamp: diagnosticIso(session.closesAt), latestCompletedSessionCloseTimestamp: diagnosticIso(latest?.closesAt),
        allowedWindowStart: diagnosticIso(windowStart), allowedWindowEnd: diagnosticIso(windowEnd),
        deltaFromCloseSeconds: Number.isFinite(time) ? (time - session.closesAt) / 1000 : null,
        deltaFromCloseMinutes: Number.isFinite(time) ? (time - session.closesAt) / 60000 : null,
        currentMarketStatus: status.status ?? "unknown", marketKnown: status.known, market: session.market, timeZone: session.zone,
        evaluatedAt: diagnosticIso(now), failedConditions });
    if (!status.known || !["after_close", "before_open", "closed_day"].includes(status.status)
        || latest?.date !== session.date || latest?.closesAt !== session.closesAt
        || quoteDate !== latest?.date
        || !Number.isFinite(time) || time < session.closesAt - BEFORE_CLOSE_MS
        || time > session.closesAt + AFTER_CLOSE_MS || time > now)
        throw new Error("Broker quote outside latest completed session closing window or market is open");
    const price = typeof raw.price === "string" ? Number(raw.price.replace(/\s/g, "").replace(",", ".")) : raw.price;
    if (!Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(raw.currency ?? "")) throw new Error("Invalid broker closing quote");
    return { ...raw, price, timestamp: time, date: session.date, kind: "session_close", sourceMetadata: {
        provenance: "broker_latest_after_close", sessionDate: session.date,
        officialCloseAt: new Date(session.closesAt).toISOString(), quoteTimestamp: new Date(time).toISOString(),
        offsetFromCloseSeconds: (time - session.closesAt) / 1000, toleranceBeforeSeconds: BEFORE_CLOSE_MS / 1000,
        toleranceAfterSeconds: AFTER_CLOSE_MS / 1000,
    } };
}
// Calendar equality alone cannot establish a listing: First North and Spotlight
// share Stockholm hours but are distinct venues. Only spelling aliases are equivalent.
const listingKey = (value) => ({ ST: "XSTO", STOCKHOLM: "XSTO", NYSE: "XNYS", NASDAQ: "XNAS" })[normalizeMarketCode(value)] ?? normalizeMarketCode(value);
// Only explicitly allowed identity paths are inspected. Never serialize broker responses or headers.
const IDENTITY_PATHS = ["instrument_id", "orderbookId", "orderBookId", "id", "isin", "symbol", "ticker", "tickerSymbol",
    "name", "title", "market", "exchange", "exchangeCode", "marketCode", "marketPlace.marketCode", "marketPlace.code",
    "marketPlace.name", "marketPlaceName", "listing.market", "listing.ticker", "listing.isin"];
const safeIdentityValue = (value) => typeof value === "string" ? value.slice(0, 200)
    : typeof value === "number" && Number.isFinite(value) ? value : null;
function identityFields(raw) {
    const fields = [];
    for (const prefix of ["", "instrument_info."]) {
        for (const path of IDENTITY_PATHS) {
            const fullPath = prefix + path;
            let value = raw;
            let present = true;
            for (const key of fullPath.split(".")) {
                if (value == null || typeof value !== "object" || !Object.hasOwn(value, key)) { present = false; break; }
                value = value[key];
            }
            if (present) fields.push({ path: fullPath, value: safeIdentityValue(value), type: value === null ? "null" : typeof value });
        }
    }
    return fields;
}
function candidateDiagnostic(info, raw, failures) {
    return { candidate: { instrumentId: safeIdentityValue(info?.id), isin: safeIdentityValue(info?.isin),
        ticker: safeIdentityValue(info?.ticker), name: safeIdentityValue(info?.name), market: safeIdentityValue(info?.market) },
        failedChecks: failures, responseIdentityFields: identityFields(raw) };
}
const hasIdentityValue = (value) => value != null && String(value).trim() !== "";
function consistencyState(candidate, expected, matches) {
    if (!hasIdentityValue(candidate) || !hasIdentityValue(expected)) return "unknown";
    return matches(candidate, expected) ? "match" : "mismatch";
}
function verifyListing(info, holding, session, id, raw, record, sameProvider) {
    const fieldStates = {
        instrumentId: consistencyState(info.id, id, (actual, expected) => String(actual) === String(expected)),
        isin: consistencyState(info.isin, holding.isin, (actual, expected) => norm(actual) === norm(expected)),
        ticker: consistencyState(info.ticker, holding.ticker, (actual, expected) => norm(actual) === norm(expected)),
        market: consistencyState(info.market, holding.market, (actual, expected) =>
            LISTING_CALENDARS[normalizeMarketCode(actual)] === session.market && listingKey(actual) === listingKey(expected)),
    };
    const idMismatch = fieldStates.instrumentId === "mismatch";
    const isinMismatch = fieldStates.isin === "mismatch";
    const tickerMismatch = fieldStates.ticker === "mismatch";
    const marketMismatch = fieldStates.market === "mismatch";
    const verified = sameProvider ? fieldStates.instrumentId === "match" && !isinMismatch
        : fieldStates.isin === "match" && !idMismatch;
    const failures = [];
    if (idMismatch) failures.push("instrumentId mismatch");
    else if (sameProvider && fieldStates.instrumentId !== "match") failures.push("instrumentId missing");
    if (isinMismatch) failures.push("ISIN mismatch");
    else if (!sameProvider && fieldStates.isin !== "match") failures.push("ISIN missing");
    if (tickerMismatch) failures.push("ticker mismatch");
    if (marketMismatch) failures.push("market mismatch");
    record({ ...candidateDiagnostic(info, raw, failures), fieldStates, expectedInstrumentId: safeIdentityValue(id),
        identityBasis: verified ? (sameProvider ? "same_provider_instrument_id" : "verified_isin") : null });
    // Missing consistency fields are unknown. They cannot prove or contradict identity.
    if (idMismatch || (sameProvider && fieldStates.instrumentId !== "match")) throw new Error("Unverified broker instrument ID");
    if (isinMismatch || !verified) throw new Error("Unverified broker ISIN");
    if (tickerMismatch || marketMismatch) throw new Error("Unverified broker listing");
}

export function createListedProductProvider({ request, once, clock, yahooClose }) {
    const nordnetHeaders = { "Client-Id": "NEXT", Referer: "https://www.nordnet.se/", "X-Nn-Href": "https://www.nordnet.se/" };
    async function nordnet(ownId, holding, session, now, get, record, recordTime) {
        const filter = ownId ? `instrument_id%3D${encodeURIComponent(ownId)}` : `isin%3D${encodeURIComponent(holding.isin)}`;
        const data = await get(`https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=${filter}`, nordnetHeaders);
        const rows = data.results ?? [];
        const candidates = rows.map((item) => item.instrument_info ?? item);
        const info = candidates.find((item) => ownId ? String(item.instrument_id) === String(ownId) : norm(item.isin) === norm(holding.isin));
        if (!info?.instrument_id) {
            record({ failedChecks: ["no candidate found"], candidate: null, responseIdentityFields: [],
                candidates: rows.slice(0, 5).map((row) => { const item = row.instrument_info ?? row;
                    return candidateDiagnostic({ id: item.instrument_id, isin: item.isin, ticker: item.symbol, name: item.name, market: item.market }, row,
                        ownId ? (!hasIdentityValue(item.instrument_id) ? ["instrumentId missing"]
                            : String(item.instrument_id) !== String(ownId) ? ["instrumentId mismatch"] : [])
                            : [norm(item.isin) ? "ISIN mismatch" : "ISIN missing"]); }),
                candidateCount: rows.length, candidatesTruncated: rows.length > 5 });
            throw new Error("Listed product identity not found at Nordnet");
        }
        const id = info.instrument_id;
        verifyListing({ id, isin: info.isin, ticker: info.symbol, name: info.name, market: info.market }, holding, session, id, rows[candidates.indexOf(info)], record, ownId != null);
        const prices = await get(`https://www.nordnet.se/api/2/instruments/price/${encodeURIComponent(id)}?request_realtime=false`, nordnetHeaders);
        const quote = prices.find?.((item) => String(item.instrument_id) === String(id));
        if (!quote) {
            record({ stage: "price", failedChecks: ["no candidate found"], candidate: null,
                responseIdentityFields: [], candidates: Array.isArray(prices) ? prices.slice(0, 5).map((item) =>
                    candidateDiagnostic({ id: item.instrument_id }, item, [hasIdentityValue(item.instrument_id) ? "instrumentId mismatch" : "instrumentId missing"])) : [] });
            throw new Error("Unverified Nordnet quote instrument ID");
        }
        return closingQuote({ price: quote.last, currency: info.currency, timestamp: quote.tick_timestamp }, session, now, recordTime);
    }
    async function avanza(ownId, holding, session, now, get, record, recordTime) {
        let ids = ownId ? [ownId] : [];
        const headers = { Referer: "https://www.avanza.se/" };
        if (!ownId) {
            const search = await get("https://www.avanza.se/_api/search/filtered-search", { ...headers, "Content-Type": "application/json" }, {
                method: "POST", body: JSON.stringify({ query: holding.isin, searchFilter: { types: [] }, screenSize: "DESKTOP",
                    pagination: { from: 0, size: 30 }, originPath: "/", originPlatform: "PWA", searchSessionId: crypto.randomUUID() }),
            });
            const hits = search.hits ?? [];
            ids = hits.filter((hit) => !hit.isin || norm(hit.isin) === norm(holding.isin))
                .map((hit) => hit.orderBookId ?? hit.orderbookId).filter((id) => id != null).slice(0, 5);
            if (!ids.length) record({ stage: "search", failedChecks: ["no candidate found"], candidate: null, responseIdentityFields: [],
                candidates: hits.slice(0, 5).map((hit) => candidateDiagnostic({ id: hit.orderBookId ?? hit.orderbookId, isin: hit.isin,
                    ticker: hit.tickerSymbol ?? hit.ticker ?? hit.symbol, name: hit.title ?? hit.name, market: hit.marketPlaceName ?? hit.market }, hit,
                    holding.isin && hit.isin && norm(hit.isin) !== norm(holding.isin) ? ["ISIN mismatch"] : [])),
                candidateCount: hits.length, candidatesTruncated: hits.length > 5 });
        }
        if (!ids.length) record({ failedChecks: ["no candidate found"], candidate: null, responseIdentityFields: [] });
        let lastError;
        for (const id of ids) {
            try {
                // Reuse the existing market-api detail source; do not fabricate a daily bar.
                const data = await get(`https://www.avanza.se/_api/market-guide/stock/${encodeURIComponent(id)}`, headers);
                verifyListing({ id: data.orderbookId ?? data.orderBookId ?? data.id, isin: data.isin,
                    ticker: data.tickerSymbol ?? data.ticker ?? data.symbol, name: data.name ?? data.title,
                    market: data.marketPlace?.marketCode ?? data.marketPlace?.code ?? data.market }, holding, session, id, data, record, ownId != null);
                return closingQuote({ price: data.quote?.last, currency: data.quote?.currency ?? data.currency,
                    timestamp: data.quote?.timestamp }, session, now, recordTime);
            } catch (error) { lastError = error; }
        }
        throw lastError ?? new Error("Listed product identity not found at Avanza");
    }
    return function listedClose(holding, session) {
        const idProvider = providerName(holding.provider);
        const first = idProvider ?? (!norm(holding.provider) ? providerName(holding.platform) : null);
        return once(`listed:${first}:${holding.instrumentId}:${holding.isin}:${holding.ticker}:${holding.market}:${session.date}`, async () => {
            const attempts = [], httpErrors = [], attemptedProviders = [];
            const get = async (...args) => {
                try { return await request(...args); } catch (error) {
                    if (error.diagnostics?.code === "MARKET_PROVIDER_HTTP_ERROR") httpErrors.push(error.diagnostics);
                    throw error;
                }
            };
            let historicalAttempted = false;
            async function historicalClose() {
                historicalAttempted = true;
                attemptedProviders.push("Yahoo");
                const quote = await yahooClose(holding, session, true, get);
                if (!Number.isFinite(quote.price) || quote.price <= 0 || !/^[A-Z]{3}$/.test(quote.currency ?? "")
                    || quote.date !== session.date || quote.kind !== "session_close"
                    || !Number.isFinite(quote.timestamp) || quote.timestamp > clock())
                    throw new Error("Invalid historical listed-product close");
                return { ...quote, provider: "Yahoo", sourceMetadata: { provenance: "historical_session_close", sessionDate: session.date },
                    attemptedProviders: [...attemptedProviders] };
            }
            const order = first ? [first, ...["Avanza", "Nordnet"].filter((item) => item !== first)] : ["Avanza", "Nordnet"];
            for (const provider of [...order, "Yahoo"]) {
                if (provider === "Yahoo" && historicalAttempted) continue;
                if (provider === "Yahoo") {
                    try { return await historicalClose(); } catch (error) { attempts.push({ provider, reason: error.message }); }
                    continue;
                }
                const ownId = provider === idProvider && String(holding.instrumentId ?? "").trim() ? holding.instrumentId : null;
                if (provider !== "Yahoo" && !ownId && !holding.isin) continue;
                attemptedProviders.push(provider);
                const identityVerification = { requested: { provider, instrumentId: safeIdentityValue(ownId),
                    isin: safeIdentityValue(holding.isin), ticker: safeIdentityValue(holding.ticker), market: safeIdentityValue(holding.market) },
                    checks: [] };
                const record = (diagnostic) => identityVerification.checks.push(diagnostic);
                const timeVerification = [];
                const recordTime = (diagnostic) => timeVerification.push(diagnostic);
                try {
                    const quote = provider === "Avanza" ? await avanza(ownId, holding, session, clock(), get, record, recordTime)
                            : await nordnet(ownId, holding, session, clock(), get, record, recordTime);
                    // Prefer a verified daily bar over the broker approximation when available.
                    if (!historicalAttempted) {
                        try { return await historicalClose(); } catch (error) { attempts.push({ provider: "Yahoo", reason: error.message }); }
                    }
                    return { ...closingQuote(quote, session, clock(), (diagnostic) => recordTime({ ...diagnostic,
                        brokerQuotePrice: timeVerification.at(-1)?.brokerQuotePrice ?? diagnostic.brokerQuotePrice,
                        brokerQuoteTimestampRaw: timeVerification.at(-1)?.brokerQuoteTimestampRaw ?? diagnostic.brokerQuoteTimestampRaw,
                        rawTimestampType: timeVerification.at(-1)?.rawTimestampType ?? diagnostic.rawTimestampType, stage: "recheck" })), provider, attemptedProviders: [...attemptedProviders] };
                } catch (error) { attempts.push({ provider, reason: error.message, identityVerification, ...(timeVerification.length ? { timeVerification } : {}) }); }
            }
            const error = new Error("Verified listed-product closing price unavailable");
            error.diagnostics = { code: "LISTED_PRODUCT_CLOSE_UNAVAILABLE", instrument: diagnosticInstrument(holding),
                attemptedProviders, attempts, ...(httpErrors.length ? { httpErrors } : {}) };
            throw error;
        });
    };
}
