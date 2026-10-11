import { replayPerformanceLedger, valuePerformanceLedger, isDate, PERFORMANCE_CONVENTION } from "./performanceLedger.js";
import { stockholmDate } from "./calendarDate.js";

// Calculation only. The isolated server worker persists approved test observations.
// Never reads/writes legacy portfolio snapshots.
export function calculatePerformanceObservation({ baseline, events, date, asOf, revision, prices, rates, source, journalCoverage, costCoverage }, now = Date.now()) {
    if (journalCoverage !== "complete" || costCoverage !== "complete") throw new Error("Komplett journal- och avgiftsunderlag måste verifieras före dagsvärderingen.");
    if (!isDate(date) || date >= stockholmDate(now) || !source?.trim() || !Number.isSafeInteger(revision) || revision < 0
        || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(asOf ?? "") || stockholmDate(asOf) !== date
        || Date.parse(asOf) > now) throw new Error("Färdigställt värderingsdatum eller revision saknas.");
    const time = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(asOf));
    if (time < "23:30") throw new Error("Dagsvärderingen kräver avstämning tidigast 23:30 Stockholm.");
    const state = replayPerformanceLedger(baseline, events, date);
    const valueSek = valuePerformanceLedger(state, date, prices, rates);
    return { date, asOf, revision, valueSek, source, verified: true, finalized: true, coverage: "complete",
        convention: PERFORMANCE_CONVENTION, positions: state.positions, cash: state.cash,
        priceSources: prices.map(point => ({ ...point })), fxSources: rates.map(point => ({ ...point })) };
}
