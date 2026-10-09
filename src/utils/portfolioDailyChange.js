import { hasCompleteDailyQuote } from "./dailyQuote.js";
import { stockholmDate } from "./calendarDate.js";
import { dailyHoldingCoverage } from "./dailyChangeCoverage.js";
import { buildDailySubsets } from "./dailySubsets.js";

export function calculatePortfolioDailyChange({ holdings = [], manualAssets = [], transactions = [], lysaTransactions = [] }, now = Date.now()) {
    let total = 0, covered = 0, previous = 0, current = 0, instrumentCovered = 0, sekCovered = 0;
    let invalidValues = false;
    const reasons = new Set();
    const positions = [];
    for (const holding of holdings) {
        const raw = holding.currentValueSek ?? holding.valueSek;
        const value = Number(raw);
        if (raw == null || !Number.isFinite(value) || value < 0) { invalidValues = true;
            positions.push({ id: holding.id, name: holding.name, covered: false, reasons: ["Portföljvärde saknas"] }); continue; }
        total += value;
        if (value === 0) continue;
        const position = dailyHoldingCoverage(holding, now);
        position.portfolioValueSek = value;
        positions.push(position);
        if (position.instrumentCovered) instrumentCovered += value;
        if (!holding.quoteStale && hasCompleteDailyQuote(holding, {
            price: holding.currentPrice, previousClose: holding.previousClose, timestamp: holding.priceUpdatedAt,
        }, now)) covered += value;
        for (const reason of position.reasons) reasons.add(reason);
        if (position.covered) { sekCovered += value; current += position.currentValue; previous += position.previousValue; }
    }
    for (const asset of manualAssets.filter((item) => item.source === "manual")) {
        const value = Number(asset.value);
        if (!Number.isFinite(value) || value < 0) { invalidValues = true; continue; }
        total += value;
        if (value > 0) { reasons.add("Dagens jämförelse för manuella tillgångar saknas");
            positions.push({ id: asset.id, name: asset.name, covered: false, reasons: ["Dagens jämförelse för manuella tillgångar saknas"] }); }
    }
    const startDate = positions.filter(p => p.previousDate).map(p => p.previousDate).sort()[0] ?? stockholmDate(now);
    const flowsUnverified = [...transactions, ...lysaTransactions].some((transaction) => {
        const date = transaction.date == null ? null : stockholmDate(transaction.date);
        return date == null || date === stockholmDate(now) || (date > startDate && date <= stockholmDate(now));
    });
    if (flowsUnverified) {
        reasons.add("Dagens affärer eller insättningar/uttag saknar verifierad dagsjämförelse");
    }
    if (invalidValues) reasons.add("Portföljvärden saknas");
    const dates = new Set(positions.filter(p => p.covered).map(p => `${p.previousDate}/${p.currentDate}`));
    if (dates.size > 1) reasons.add("Blandade handelskalendrar: jämförelsedagarna skiljer sig");
    const complete = !invalidValues && total > 0 && Math.abs(total - sekCovered) < 0.01 && previous > 0 && reasons.size === 0;
    const currentDates = [...new Set(positions.map(p => p.currentDate).filter(Boolean))];
    const coverageKnown = !invalidValues && Number.isFinite(total) && total > 0;
    const subsets = buildDailySubsets(positions, { totalValueSek: total, coverageKnown, flowsUnverified, today: stockholmDate(now) });
    // Preserve dated/session comparisons, but never present yesterday or a NAV pair as IDAG.
    const todayPositions = positions.map(p => ({ ...p, covered: p.todayCovered === true }));
    const todaySubsets = buildDailySubsets(todayPositions, { totalValueSek: total, coverageKnown, flowsUnverified, today: stockholmDate(now) });
    const todayValue = todayPositions.filter(p => p.covered).reduce((sum, p) => sum + p.portfolioValueSek, 0);
    const todayComplete = complete && todayPositions.filter(p => p.covered).length === positions.length;
    const todayGroup = todaySubsets[0] ?? null;
    const todayReasons = [...new Set([...reasons, ...positions.flatMap(p => p.todayReasons ?? p.reasons)])];
    const latestSessionSubsets = buildDailySubsets(positions.filter(p => p.kind === "listed" && !p.todayCovered),
        { totalValueSek: total, coverageKnown, flowsUnverified, today: stockholmDate(now) });
    const today = { complete: todayComplete, changeSek: todayComplete ? current - previous : null,
        changePercent: todayComplete ? (current / previous - 1) * 100 : null,
        currentDate: stockholmDate(now), previousDate: todayGroup?.previousDate ?? null,
        subset: todayComplete ? null : todayGroup, subsets: todaySubsets, reasons: todayReasons,
        instrumentCoveragePercent: coverageKnown ? instrumentCovered / total * 100 : null,
        sekCoveragePercent: coverageKnown ? todayValue / total * 100 : null,
        coveragePercent: coverageKnown ? todayValue / total * 100 : null, referenceFx: positions.some(p => p.referenceFx) };
    return { complete, changeSek: complete ? current - previous : null,
        changePercent: complete ? (current / previous - 1) * 100 : null,
        coveragePercent: total > 0 ? covered / total * 100 : 0,
        instrumentCoveragePercent: total > 0 ? instrumentCovered / total * 100 : 0,
        sekCoveragePercent: total > 0 ? sekCovered / total * 100 : 0,
        referenceFx: positions.some(p => p.referenceFx), positions, reasons: [...reasons], today, latestSessionSubsets,
        subsets, subset: subsets[0] ?? null, flowsUnverified, coverageKnown, totalValueSek: coverageKnown ? total : null,
        currentDate: currentDates.length === 1 ? currentDates[0] : null,
        label: currentDates.length === 1 && currentDates[0] !== stockholmDate(now) ? `Senaste handelsdag · ${currentDates[0]}` : "Idag" };
}
