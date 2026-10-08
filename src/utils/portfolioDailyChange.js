import { hasCompleteDailyQuote } from "./dailyQuote.js";
import { stockholmDate } from "./calendarDate.js";

export function calculatePortfolioDailyChange({ holdings = [], manualAssets = [], transactions = [], lysaTransactions = [] }, now = Date.now()) {
    let total = 0, covered = 0, previous = 0;
    let invalidValues = false;
    const reasons = new Set();
    for (const holding of holdings) {
        const raw = holding.currentValueSek ?? holding.valueSek;
        const value = Number(raw);
        if (raw == null || !Number.isFinite(value) || value < 0) { invalidValues = true; continue; }
        total += value;
        if (value === 0) continue;
        if (holding.quoteStale || !hasCompleteDailyQuote(holding, {
            price: holding.currentPrice, previousClose: holding.previousClose, timestamp: holding.priceUpdatedAt,
        }, now)) { reasons.add("Dagskurser eller föregående stängning saknas"); continue; }
        covered += value;
        // Use current FX on both legs: cash flows and FX changes are not invented as price returns.
        previous += value * Number(holding.previousClose) / Number(holding.currentPrice);
        if (holding.currency !== "SEK") reasons.add("Verifierad dagsförändring i valutakurs saknas");
    }
    for (const asset of manualAssets.filter((item) => item.source === "manual")) {
        const value = Number(asset.value);
        if (!Number.isFinite(value) || value < 0) { invalidValues = true; continue; }
        total += value;
        if (value > 0) reasons.add("Dagens jämförelse för manuella tillgångar saknas");
    }
    if ([...transactions, ...lysaTransactions].some((transaction) => stockholmDate(transaction.date) === stockholmDate(now))) {
        reasons.add("Dagens affärer eller insättningar/uttag saknar verifierad dagsjämförelse");
    }
    if (invalidValues) reasons.add("Portföljvärden saknas");
    const complete = !invalidValues && total > 0 && Math.abs(total - covered) < 0.01 && previous > 0 && reasons.size === 0;
    return { complete, changeSek: complete ? covered - previous : null,
        changePercent: complete ? (covered / previous - 1) * 100 : null,
        coveragePercent: total > 0 ? covered / total * 100 : 0, reasons: [...reasons] };
}
