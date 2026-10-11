import { PERFORMANCE_VERSION } from "./portfolioPerformance.js";
import { PERFORMANCE_CONVENTION, isDate, isAmount } from "./performanceLedger.js";
import { periodStart } from "./dashboardHistory.js";
import { stockholmDate } from "./calendarDate.js";

export const COMPARISON_VERSION = "daily-performance-comparison-v1";
export function buildDailyPerformanceView(portfolio, benchmark, period, today, now) {
    const blocked = reason => ({ available: false, reason });
    if (period === "1D") return blocked("Intradagsjämförelse saknas. Välj en längre period.");
    if (portfolio?.apiVersion !== PERFORMANCE_VERSION || portfolio.available !== true || portfolio.verified !== true
        || portfolio.currency !== "SEK" || portfolio.cashFlowCoverage !== "complete" || !portfolio.source?.trim()
        || portfolio.convention !== PERFORMANCE_CONVENTION || !["TWR", "DAILY_MODIFIED_DIETZ"].includes(portfolio.method)
        || (portfolio.method === "DAILY_MODIFIED_DIETZ" && portfolio.quality !== "estimated")
        || portfolio.returnBasis !== "net_total_return" || !Array.isArray(portfolio.points)) return blocked(portfolio?.reason ?? "Verifierad kassaflödesjusterad portföljavkastning saknas.");
    const requestedStart = period === "All" ? null : periodStart(period, today);
    if (portfolio.points.some((point, i) => !isDate(point.date) || point.date >= today || !isAmount(point.value) || point.value <= 0
        || !Number.isFinite(Date.parse(point.asOf)) || Date.parse(point.asOf) > now
        || stockholmDate(point.asOf) !== point.date || (i > 0 && point.date <= portfolio.points[i - 1].date))) return blocked("Portföljens avkastningsserie kunde inte verifieras.");
    // An import at noon establishes portfolio tracking but cannot be compared with
    // that day's market close. Start comparison at the first finalized valuation.
    const selected = portfolio.points.filter(point => point.finalized === true && (requestedStart == null || point.date >= requestedStart));
    if (selected.length < 2) return blocked("Minst två färdigställda observationer behövs inom perioden.");
    const portfolioSeries = selected.map(point => ({ ...point, value: (point.value / selected[0].value - 1) * 100 }));
    const performance = { series: portfolioSeries, methodLabel: portfolio.methodLabel, quality: portfolio.quality, reason: portfolio.reason };
    let comparison = blocked("Verifierad indexhistorik i SEK saknas för perioden.");
    if (benchmark) {
        if (benchmark.apiVersion !== COMPARISON_VERSION || benchmark.verified !== true || !benchmark.source?.trim()
            || !["OMXS30", "SP500"].includes(benchmark.id) || benchmark.currency !== "SEK" || benchmark.returnBasis !== "price_return"
            || benchmark.convention !== PERFORMANCE_CONVENTION || !Array.isArray(benchmark.points)
            || benchmark.points.some((point, i) => !isDate(point.date) || point.date >= today || !isAmount(point.value) || point.value <= 0
                || (i > 0 && point.date <= benchmark.points[i - 1].date))) return { available: true, points: selected, performance, comparison };
        const byDate = new Map(benchmark.points.map(point => [point.date, point]));
        const common = selected.filter(point => byDate.has(point.date));
        if (common.length >= 2) {
            const start = common[0], indexStart = byDate.get(start.date).value;
            const series = common.map(point => ({ ...point, value: (point.value / start.value - 1) * 100,
                benchmark: (byDate.get(point.date).value / indexStart - 1) * 100 }));
            comparison = { available: true, series, portfolioPercent: series.at(-1).value, benchmarkPercent: series.at(-1).benchmark,
                // Do not label a total-return vs price-return difference as excess return.
                excessPercentagePoints: null, distributionMismatch: true, methodLabel: portfolio.methodLabel,
                quality: portfolio.quality, start: start.date, end: common.at(-1).date,
                partial: (requestedStart != null && start.date !== requestedStart) || start.date !== selected[0].date || common.at(-1).date !== selected.at(-1).date,
                omittedDates: selected.filter(point => !byDate.has(point.date)).map(point => point.date),
                source: benchmark.source, fxLabel: benchmark.fxLabel, missingIndexCount: benchmark.missingIndexCount ?? 0,
                disclosure: "Portföljen inkluderar utdelningar och kostnader. Index är prisindex utan utdelningar; serierna har olika utdelningsbas." };
        }
    }
    return { available: true, points: selected, performance, comparison, requestedStart };
}
