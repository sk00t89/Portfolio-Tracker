import { quoteValuationKey } from "./valuationFreshness.js";
export function attachDailyReferences(holdings, checks, userId) {
    return holdings.map(holding => {
        const check = checks[holding.id];
        return { ...holding, dailyReference: holding.platform === "Lysa" ? holding.dailyReference
            : check?.userId === userId && check?.valueKey === quoteValuationKey(holding) ? check.dailyReference : null };
    });
}

export function portfolioDisplayValue({ currentValue, savedValue, valuesLoading, updating, refreshDisplay, userId }) {
    if (updating && refreshDisplay?.userId === userId) return refreshDisplay.value ?? savedValue ?? null;
    return valuesLoading ? savedValue ?? null : currentValue;
}

export async function runAtomicQuoteRefresh({ holdings, refresh, commit, isCurrent = () => true, concurrency = 6 }) {
    const results = new Array(holdings.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, holdings.length) }, async () => {
        while (cursor < holdings.length && isCurrent()) {
            const index = cursor++;
            const original = holdings[index];
            try { results[index] = { original, ...await refresh(original) }; }
            catch { results[index] = { original, holding: null, checkedAt: null, diagnostics: [] }; }
        }
    }));
    if (isCurrent()) await commit(results.filter(Boolean));
    return results;
}

export function mergeQuoteRefresh(current, results, userId) {
    const byId = new Map(results.map((result) => [result.original.id, result]));
    const checks = {};
    const holdings = current.map((holding) => {
        const result = byId.get(holding.id);
        if (!result) return holding;
        // Edits/deletions made while requests were running must not be undone by the batch.
        const unchanged = quoteValuationKey(holding) === quoteValuationKey(result.original);
        const saved = unchanged && result.holding;
        checks[holding.id] = { userId, success: Boolean(saved), checkedAt: result.checkedAt,
            dailyReference: saved ? result.dailyReference : null,
            diagnostics: result.diagnostics, valueKey: saved ? quoteValuationKey(saved) : null };
        return saved ? { ...saved, quoteStale: false } : { ...holding, quoteStale: true };
    });
    return { holdings, checks };
}
