import { INDEXES, INDEX_HISTORY_VERSION, indexDate, indexPeriodStart } from "../../supabase/functions/_shared/indexHistory.js";

export function validateIndexResponse(data, id, period, now = Date.now()) {
    const config = INDEXES[id];
    if (!config || data?.apiVersion !== INDEX_HISTORY_VERSION || data.id !== id || data.period !== period
        || data.symbol !== config.symbol || data.currency !== config.currency || data.zone !== config.zone
        || data.exchange !== config.exchange || data.source !== "Yahoo Finance" || data.returnBasis !== "price_return"
        || data.requestedStart !== indexPeriodStart(period, indexDate(now, config.zone))
        || data.requestedEnd !== indexDate(now, config.zone) || !Array.isArray(data.points) || !data.points.length
        || !Number.isInteger(data.missing) || data.missing < 0) throw new Error("Indexsvaret kunde inte verifieras. Försök igen.");
    if (data.points.some((point, i) => typeof point.value !== "number" || !Number.isFinite(point.value) || point.value <= 0
        || !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(Date.parse(point.barTimestamp))
        || Date.parse(point.barTimestamp) > now || indexDate(point.barTimestamp, config.zone) !== point.date
        || point.date < data.requestedStart || point.date >= data.requestedEnd
        || (i > 0 && point.date <= data.points[i - 1].date))) throw new Error("Indexhistoriken innehåller ogiltiga observationer. Försök igen.");
    return data;
}
export async function fetchIndexHistory(apiFetch, id, period, signal) {
    if (!apiFetch) throw new Error("Index-API är inte konfigurerat.");
    let response;
    try { response = await apiFetch(`/api/index-history?id=${encodeURIComponent(id)}&period=${encodeURIComponent(period)}`, { signal }); }
    catch (error) {
        if (signal.aborted) throw error;
        const reason = error.indexCode === "INDEX_IDENTITY_MISMATCH" ? "Källans indexidentitet, valuta eller tidszon stämmer inte."
            : error.indexCode === "INDEX_INVALID_DATA" ? "Källan returnerade ogiltiga historiska kurser."
                : error.indexCode === "INDEX_DATA_UNAVAILABLE" ? "Källan saknar slutkurser för perioden."
                    : error.httpStatus === 404 ? "Indexhistorik saknas på servern. Den nya market-api-versionen behöver driftsättas."
                        : "Källan är otillgänglig eller svaret kunde inte verifieras.";
        throw new Error(`Indexdata kunde inte hämtas${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ""}. ${reason} Försök igen.`, { cause: error });
    }
    return validateIndexResponse(await response.json(), id, period);
}

export function standaloneIndexView(data) {
    const base = data.points[0].value;
    const points = data.points.map(point => ({ ...point, valueSek: (point.value / base - 1) * 100 }));
    return { available: true, points, first: points[0], last: points.at(-1), visibleChangeSek: points.at(-1).valueSek,
        comparison: { available: false }, standaloneIndex: data,
        reason: "", historyCount: points.length };
}
