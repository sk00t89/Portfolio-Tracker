import { createValueSeries, stockholmDate } from "./dashboardHistory.js";
import { normalizeQuoteTimestamp, validateValuationFreshness, VERIFIED_QUOTE_MAX_AGE } from "./valuationFreshness.js";

export const PORTFOLIO_PERIODS = [
    { id: "1D", label: "1D" }, { id: "1V", label: "1V" }, { id: "1M", label: "1M" },
    { id: "3M", label: "3M" }, { id: "YTD", label: "i år" }, { id: "1Å", label: "1Å" }, { id: "All", label: "ALL" },
];
export const BENCHMARKS = [{ id: "OMXS30", label: "OMXS30" }, { id: "SIXRX", label: "SIXRX" }, { id: "SP500", label: "S&P 500" }];
export function evaluateLiveValuation({ publication, inputs, ready }, now = Date.now()) {
    return { publication, userId: inputs.userId, evaluatedAt: now,
        verified: ready && validateValuationFreshness(inputs, now).ready };
}
// This is view data only. Publication time describes our completed batch, never a provider quote time.
export function livePortfolioPoint({ publication, verified, userId, valueSek, today, now }) {
    if (!userId || publication?.userId !== userId || verified !== true || !Number.isFinite(valueSek) || valueSek < 0
        || !Number.isFinite(publication.observedAt) || publication.observedAt > now
        || now - publication.observedAt > VERIFIED_QUOTE_MAX_AGE || stockholmDate(publication.observedAt) !== today) return null;
    return { date: today, valueSek, live: true, observedAt: publication.observedAt };
}

export function mergeLiveHistory(points, livePoint, today) {
    const history = validHistory(points, today);
    if (!livePoint?.live || livePoint.date !== today || !Number.isFinite(livePoint.valueSek) || livePoint.valueSek < 0) return history;
    return [...history.filter(point => point.date !== today), { ...livePoint }];
}

export function availableBenchmarkIds(benchmarks = {}, now = Date.now()) {
    // No choice is activated merely because its name is known: a trusted adapter must be connected.
    return BENCHMARKS.filter(({ id }) => benchmarks[id]?.id === id && benchmarks[id]?.verified === true
        && benchmarks[id]?.currency === "SEK" && benchmarks[id]?.source?.trim()
        && Array.isArray(benchmarks[id]?.points) && benchmarks[id].points.length >= 2
        && returnSeries(benchmarks[id], benchmarks[id].points[0].date, benchmarks[id].points.at(-1).date, now)).map(({ id }) => id);
}
const validDate = (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

function validHistory(points, today) {
    const counts = new Map();
    for (const point of points) counts.set(point.date, (counts.get(point.date) ?? 0) + 1);
    return points.filter((point) => validDate(point.date) && point.date <= today && counts.get(point.date) === 1
        && typeof point.valueSek === "number" && Number.isFinite(point.valueSek) && point.valueSek >= 0)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function returnSeries(data, start, end, now) {
    if (data?.verified !== true || typeof data.source !== "string" || !data.source.trim() || data.currency !== "SEK" || data.cadence !== "daily_close"
        || !["price_return", "gross_total_return", "net_total_return"].includes(data.returnBasis) || !Array.isArray(data.points)) return null;
    const points = data.points.filter((point) => point.date >= start && point.date <= end);
    if (points.length < 2 || points[0].date !== start || points.at(-1).date !== end) return null;
    if (points.some((point, i) => !validDate(point.date) || !Number.isFinite(point.value) || point.value <= 0
        || !String(point.asOf ?? "").includes("T") || normalizeQuoteTimestamp(point.asOf) == null
        || normalizeQuoteTimestamp(point.asOf) > now || stockholmDate(point.asOf) !== point.date
        || (i > 0 && points[i - 1].date >= point.date))) return null;
    return points;
}

export function compareVerifiedBenchmark(points, portfolioReturns, benchmark, now = Date.now()) {
    const unavailable = (reason) => ({ available: false, reason });
    if (points.length < 2) return unavailable("Historiken räcker inte för vald period.");
    if (points.some(point => point.live)) return unavailable("Verifierad liveindexdata och tidsmässigt jämförbar liveavkastning saknas.");
    if (portfolioReturns?.method !== "TWR" || portfolioReturns.cashFlowCoverage !== "complete") {
        return unavailable("Verifierad investeringsavkastning och komplett kassaflödesunderlag saknas.");
    }
    const start = points[0].date, end = points.at(-1).date;
    const portfolio = returnSeries(portfolioReturns, start, end, now);
    if (!portfolio) return unavailable("Jämförbar portföljavkastning saknas för perioden.");
    if (!BENCHMARKS.some((item) => item.id === benchmark?.id)) return unavailable("Verifierad indexhistorik saknas.");
    const index = returnSeries(benchmark, start, end, now);
    if (!index) return unavailable("Verifierad indexhistorik i SEK saknas för perioden.");
    if (portfolioReturns.returnBasis !== benchmark.returnBasis) return unavailable("Index och portfölj har olika utdelnings- eller avkastningsbas.");
    const indexByDate = new Map(index.map((point) => [point.date, point]));
    if (portfolio.some((point) => !indexByDate.has(point.date)
        || Date.parse(indexByDate.get(point.date).asOf) !== Date.parse(point.asOf))) {
        return unavailable("Observationernas datum och värderingstidpunkter är inte jämförbara.");
    }
    const series = portfolio.map((point) => ({ date: point.date,
        value: (point.value / portfolio[0].value - 1) * 100,
        benchmark: (indexByDate.get(point.date).value / index[0].value - 1) * 100 }));
    const portfolioPercent = series.at(-1).value, benchmarkPercent = series.at(-1).benchmark;
    return { available: true, series, portfolioPercent, benchmarkPercent,
        excessPercentagePoints: portfolioPercent - benchmarkPercent };
}

export function buildPortfolioPeriod({ points = [], period = "All", now = Date.now(), today = stockholmDate(now), portfolioReturns, benchmark,
    livePoint = null, dailyChange }) {
    const valid = mergeLiveHistory(points, livePoint, today);
    let selected = [];
    if (PORTFOLIO_PERIODS.some((item) => item.id === period)) {
        if (period === "1D") {
            // Daily snapshots cannot establish an intraday path or a prior market close.
            selected = [];
        } else {
            const dates = new Set(createValueSeries(valid, period, today, { allowAnchorAfterStart: false }).points.map(point => point.date));
            selected = valid.filter(point => dates.has(point.date));
        }
    }
    const first = selected[0], last = selected.at(-1);
    const available = selected.length >= 2;
    const dailyAvailable = period === "1D" && dailyChange?.complete === true
        && Number.isFinite(dailyChange.changeSek) && Number.isFinite(dailyChange.changePercent);
    const changeSek = period === "1D" ? dailyAvailable ? dailyChange.changeSek : null : available ? last.valueSek - first.valueSek : null;
    const changePercent = period === "1D" ? dailyAvailable ? dailyChange.changePercent : null
        : available && first.valueSek > 0 ? changeSek / first.valueSek * 100 : null;
    const comparison = compareVerifiedBenchmark(selected, portfolioReturns, benchmark, now);
    return { available, points: selected, first, last, changeSek, changePercent, comparison,
        historyCount: valid.length, latestObservation: valid.at(-1), dailyAvailable,
        reason: period === "1D" ? dailyAvailable ? "Verifierad dagsförändring visas ovan. Intradagshistorik saknas; ingen intradagskurva ritas."
            : "Dagsförändringen saknar komplett verifierat underlag. Ingen intradagskurva ritas."
            : valid.length < 2 ? "Grafen visas när minst två verkliga dagsvärden har sparats."
                : "Historiken täcker ännu inte den valda perioden. Välj ALL för att se sparade värden.",
    };
}

export function nearestHistoryPoint(points, ratio) {
    if (!points.length) return null;
    const start = Date.parse(points[0].date), end = Date.parse(points.at(-1).date);
    const target = start + Math.max(0, Math.min(1, ratio)) * (end - start);
    return points.reduce((best, point) => Math.abs(Date.parse(point.date) - target) < Math.abs(Date.parse(best.date) - target) ? point : best, points[0]);
}
