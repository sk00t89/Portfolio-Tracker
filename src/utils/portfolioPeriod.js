import { createValueSeries, stockholmDate } from "./dashboardHistory.js";
import { normalizeQuoteTimestamp } from "./valuationFreshness.js";

export const PORTFOLIO_PERIODS = [
    { id: "1D", label: "1D" }, { id: "1V", label: "1V" }, { id: "1M", label: "1M" },
    { id: "3M", label: "3M" }, { id: "YTD", label: "i år" }, { id: "1Å", label: "1Å" }, { id: "All", label: "ALL" },
];
export const BENCHMARKS = [{ id: "OMXS30", label: "OMXS30" }, { id: "SIXRX", label: "SIXRX" }, { id: "SP500", label: "S&P 500" }];
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

export function buildPortfolioPeriod({ points = [], period = "All", now = Date.now(), today = stockholmDate(now), portfolioReturns, benchmark }) {
    const valid = validHistory(points, today);
    let selected = [];
    if (PORTFOLIO_PERIODS.some((item) => item.id === period)) {
        if (period === "1D") {
            const previous = new Date(`${today}T12:00:00Z`);
            previous.setUTCDate(previous.getUTCDate() - 1);
            selected = valid.filter((point) => point.date === today || point.date === previous.toISOString().slice(0, 10));
            if (selected.length !== 2) selected = [];
        } else {
            selected = createValueSeries(valid, period, today, { allowAnchorAfterStart: false }).points
                .map((point) => ({ date: point.date, valueSek: point.value }));
        }
    }
    const first = selected[0], last = selected.at(-1);
    const available = selected.length >= 2;
    const changeSek = available ? last.valueSek - first.valueSek : null;
    const changePercent = available && first.valueSek > 0 ? changeSek / first.valueSek * 100 : null;
    const comparison = compareVerifiedBenchmark(selected, portfolioReturns, benchmark, now);
    return { available, points: selected, first, last, changeSek, changePercent, comparison,
        historyCount: valid.length, latestObservation: valid.at(-1),
        reason: period === "1D" ? "1D behöver sparade värden för idag och igår. Intradagshistorik finns ännu inte."
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
