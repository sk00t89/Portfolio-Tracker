import { valuePortfolio } from "./snapshotEngine.js";
import { zonedParts } from "./marketCalendar.js";

export async function runUserSnapshot({ userId, database, providers, dryRun = true, clock = Date.now, logger = console }) {
    // Capture before reading inputs/fetching quotes, so a slow request cannot outrank a newer request.
    const started = clock();
    const date = zonedParts(started).date;
    try {
        const input = await database.input(userId);
        const valuation = await valuePortfolio(input, providers, started);
        if (clock() - started > 20 * 60000 || zonedParts(clock()).date !== date) throw new Error("Snapshot expired during valuation");
        if (dryRun) return { status: "dry_run", totalValueSek: valuation.totalValueSek, sources: valuation.sources };
        const saved = await database.save({ userId, revision: input.revision, date,
            totalValueSek: valuation.totalValueSek, observedAt: new Date(started).toISOString(), metadata: valuation });
        const status = saved ? "saved" : "superseded";
        await database.outcome(userId, date, started, status, null);
        return { status };
    } catch (error) {
        // Provider messages are deliberately sanitized and never include URLs/API keys.
        const reason = error instanceof Error ? error.message : "Snapshot failed";
        const diagnostics = ["UNSUPPORTED_TRADING_CALENDAR", "UNSUPPORTED_LISTING_IDENTIFIER", "FUND_NAV_UNAVAILABLE", "MARKET_PROVIDER_HTTP_ERROR", "LISTED_PRODUCT_CLOSE_UNAVAILABLE"].includes(error?.diagnostics?.code) ? error.diagnostics : null;
        if (diagnostics) logger.warn("Portfolio snapshot blocked", { userId, ...diagnostics });
        if (!dryRun) await database.outcome(userId, date, started, "failed", reason);
        return { status: "failed", reason, ...(diagnostics ? { diagnostics } : {}) };
    }
}
