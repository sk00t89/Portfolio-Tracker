import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { referenceFx, navPair, REFERENCE_DATA_VERSION } from "../../supabase/functions/_shared/referenceData.js";
import { getMarketStatus, LISTING_CALENDARS, normalizeMarketCode, zonedParts } from "../../supabase/functions/_shared/marketCalendar.js";

export function dailyReferenceTargets(holdings) {
    return holdings.map(h => ({ id: h.id, currency: h.currency, market: h.market,
        fund: isMutualFund(h) || h.platform === "Lysa", platform: h.platform, provider: h.provider,
        isin: h.isin, instrumentId: h.instrumentId,
        // A newly loaded NAV can require a new comparison even within the polling interval.
        navDate: isMutualFund(h) || h.platform === "Lysa" ? h.priceUpdatedAt : null,
        navPrice: isMutualFund(h) || h.platform === "Lysa" ? h.currentPrice : null,
    })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function verifyNav(data, target, now) {
    const provider = target.platform === "Lysa" ? "Lysa" : target.provider;
    if (!data?.current || data.error) throw new Error(data?.error ?? "NAV_CURRENT_MISSING");
    const checkedAt = data.current.checkedAt;
    if (!Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > now) throw new Error("NAV_CHECK_INVALID");
    const points = [data.previous, data.current].filter(Boolean).map(p => {
        if (p.verified !== true || p.provider !== provider || p.isin !== target.isin || p.currency !== target.currency
            || p.sourceTimestamp !== null || p.kind !== "published_nav" || p.checkedAt !== checkedAt
            || p.sourceDate > zonedParts(checkedAt, "Europe/Stockholm").date) throw new Error("NAV_IDENTITY_INVALID");
        return { date: p.sourceDate, price: p.price };
    });
    return navPair(points, { isin: target.isin, currency: target.currency, provider, checkedAt });
}
function verifyFx(data, from, date, now) {
    const checkedAt = data?.current?.checkedAt;
    if (!Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > now || !Array.isArray(data.observations)) throw new Error("FX_CHECK_INVALID");
    return referenceFx(data.observations.map(p => {
        if (p.verified !== true || p.provider !== "Frankfurter" || p.kind !== "daily_reference" || p.sourceTimestamp !== null
            || p.from !== from || p.to !== "SEK" || p.checkedAt !== checkedAt
            || p.sourceDate > zonedParts(checkedAt, "Europe/Stockholm").date) throw new Error("FX_SOURCE_INVALID");
        return { base: p.from, quote: p.to, date: p.sourceDate, rate: p.rate };
    }), from, "SEK", date, checkedAt);
}

// This module has no portfolio SDK, database, quote-saving or snapshot dependency.
// Cache expiry schedules another GET; it never changes source dates or invalidates the last real observation.
export function createDailyReferenceRefresh({ request, clock = Date.now }) {
    const cache = new Map();
    const lastNav = new Map();
    async function read(scope, key, context, path, ttl, now) {
        const scopedKey = `${scope}:${key}`;
        const previous = cache.get(scopedKey);
        const interval = previous?.error ? 2 * 60_000 : ttl;
        if (previous?.context === context && (previous.promise || now - previous.lastAttemptAt < interval)) {
            if (previous.promise) await previous.promise;
            return cache.get(scopedKey);
        }
        const entry = { data: previous?.data, context, lastAttemptAt: now, error: null };
        cache.set(scopedKey, entry);
        entry.promise = (async () => {
            try {
                const response = await request(path);
                const data = await response.json();
                if (!response.ok || data.apiVersion !== REFERENCE_DATA_VERSION) {
                    const error = new Error(data.error ?? "REFERENCE_RESPONSE_INVALID");
                    error.httpStatus = response.status;
                    throw error;
                }
                // Validate observations before they replace a previously verified cache entry.
                const validated = key.startsWith("fx:") ? verifyFx(data, key.slice(3), context.split("|")[0], clock())
                    : data;
                if (cache.get(scopedKey) === entry) entry.data = validated;
            } catch (error) {
                const reason = /^[A-Z][A-Z_0-9]{2,79}$/.test(error.message) ? `; ${error.message}` : "";
                if (cache.get(scopedKey) === entry) entry.error = `Referenshämtningen misslyckades${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ""}${reason}`;
            } finally { entry.promise = null; }
        })();
        await entry.promise;
        // A session change may have started a newer request while this one was pending.
        const newest = cache.get(scopedKey);
        if (newest !== entry && newest.promise) await newest.promise;
        return cache.get(scopedKey);
    }
    return {
        async refresh(targets, scope, now = clock()) {
            const today = zonedParts(now, "Europe/Stockholm").date;
            const sessions = [...new Set(targets.map(h => h.fund ? "STOCKHOLM" : LISTING_CALENDARS[normalizeMarketCode(h.market)]).filter(Boolean))]
                .sort().map(market => { const s = getMarketStatus(market, now); return `${market}:${s.date}:${s.status}`; }).join(",");
            const references = {};
            await Promise.all(targets.map(async target => {
                const reference = {}, attempts = [], errors = [];
                if (target.currency && target.currency !== "SEK") {
                    const entry = await read(scope, `fx:${target.currency}`, `${today}|${sessions}`,
                        `/api/reference-fx/${encodeURIComponent(target.currency)}/SEK?date=${today}`, 10 * 60_000, now);
                    if (entry.data) reference.fx = entry.data;
                    attempts.push(entry.lastAttemptAt);
                    if (entry.error) errors.push(entry.error);
                }
                if (target.fund) {
                    const lysa = target.platform === "Lysa";
                    const params = new URLSearchParams({ provider: target.provider ?? "", instrumentId: target.instrumentId ?? "", isin: target.isin ?? "" });
                    const key = lysa ? "lysa" : `nav:${params}`;
                    // Lysa's bulk response is shared by all four funds, independently of position count.
                    const expected = lysa ? targets.filter(h => h.platform === "Lysa").map(h => `${h.isin}:${h.navDate}:${h.navPrice}`).sort().join(",")
                        : `${target.navDate}:${target.navPrice}`;
                    const entry = await read(scope, key, `${today}|${sessions}|${expected}`,
                        lysa ? "/api/lysa-nav-comparisons" : `/api/nav-comparison?${params}`, 15 * 60_000, now);
                    if (entry.data) {
                        try {
                            reference.nav = verifyNav(lysa ? entry.data.comparisons?.[target.isin] : entry.data, target, clock());
                            lastNav.set(`${scope}:${key}:${target.isin}:${target.currency}`, reference.nav);
                        }
                        catch (error) { errors.push(`NAV-underlaget kunde inte verifieras (${error.message})`); }
                    }
                    if (!reference.nav) reference.nav = lastNav.get(`${scope}:${key}:${target.isin}:${target.currency}`);
                    attempts.push(entry.lastAttemptAt);
                    if (entry.error) errors.push(entry.error);
                }
                if (attempts.length) reference.lastAttemptAt = Math.max(...attempts);
                if (errors.length) reference.refreshError = [...new Set(errors)].join("; ");
                references[target.id] = reference;
            }));
            return references;
        },
    };
}

export function watchDailyReferences({ refresh, eventTarget, clock = Date.now,
    schedule = setInterval, unschedule = clearInterval }) {
    const update = () => { if (eventTarget.visibilityState !== "hidden") refresh(clock()); };
    update();
    const timer = schedule(update, 30_000);
    eventTarget.addEventListener("visibilitychange", update);
    return () => { unschedule(timer); eventTarget.removeEventListener("visibilitychange", update); };
}
