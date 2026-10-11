import { validateIndexResponse, fetchIndexHistory } from "./indexHistory.js";
import { INDEX_FX_VERSION, parseHistoricalIndexFx } from "../../supabase/functions/_shared/historicalIndexFx.js";
import { PERFORMANCE_CONVENTION } from "../utils/performanceLedger.js";
import { COMPARISON_VERSION } from "../utils/performanceComparison.js";

export function convertPerformanceBenchmark(data, fx, now = Date.now()) {
    validateIndexResponse(data, data.id, data.period, now);
    let rates;
    if (data.currency === "USD") {
        if (fx?.apiVersion !== INDEX_FX_VERSION || fx.from !== "USD" || fx.to !== "SEK" || fx.provider !== "ECB"
            || fx.source !== "Frankfurter / ECB" || fx.kind !== "daily_reference"
            || fx.start !== data.points[0].date || fx.end !== data.points.at(-1).date) throw new Error("Historisk USD/SEK kunde inte verifieras.");
        const checked = parseHistoricalIndexFx(fx.points.map(point => ({ base: fx.from, quote: fx.to, date: point.date, rate: point.rate, providers: ["ecb"] })), fx.start, fx.end, now);
        rates = new Map(checked.points.map(point => [point.date, point.rate]));
    }
    const missingFxDates = [];
    const points = data.points.flatMap(point => {
        const rate = data.currency === "SEK" ? 1 : rates.get(point.date);
        if (rate == null) { missingFxDates.push(point.date); return []; }
        const value = point.value * rate;
        if (!Number.isFinite(value) || value <= 0) throw new Error("Ogiltigt indexvärde i SEK.");
        return [{ ...point, value, nativeValue: point.value, fxRateToSek: rate }];
    });
    return { apiVersion: COMPARISON_VERSION, verified: true, id: data.id, label: data.label,
        currency: "SEK", nativeCurrency: data.currency, source: data.source, returnBasis: data.returnBasis,
        convention: PERFORMANCE_CONVENTION, points, missingFxDates, missingIndexCount: data.missing,
        fxLabel: data.currency === "USD" ? "Historisk USD/SEK · ECB dagsreferens, inte samtidig USA-stängningskurs" : "Index i SEK" };
}

export async function fetchPerformanceBenchmark(apiFetch, id, period, signal) {
    const data = await fetchIndexHistory(apiFetch, id, period, signal);
    let fx;
    if (data.currency === "USD") {
        const params = new URLSearchParams({ start: data.points[0].date, end: data.points.at(-1).date });
        const response = await apiFetch(`/api/index-fx-history?${params}`, { signal });
        if (!response.ok) throw new Error("Historisk USD/SEK saknas. Indexöverlägg kan inte visas.");
        fx = await response.json();
    }
    return convertPerformanceBenchmark(data, fx);
}
