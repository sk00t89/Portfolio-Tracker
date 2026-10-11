import { isAmount, isDate, PERFORMANCE_CONVENTION } from "./performanceLedger.js";
import { stockholmDate } from "./calendarDate.js";

export const PERFORMANCE_VERSION = "portfolio-performance-v1";
const fail = reason => ({ available: false, reason, points: [] });
const validTime = time => typeof time === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(time) && Number.isFinite(Date.parse(time));
const sameValue = (a, b) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-9);

// Modified Dietz, geometrically linked across completed daily intervals.
// Weights use recorded instants or an explicitly selected end-of-day assumption.
export function modifiedDietz(startValue, endValue, startTime, endTime, flows) {
    const start = Date.parse(startTime), end = Date.parse(endTime);
    if (!isAmount(startValue) || startValue <= 0 || !isAmount(endValue) || endValue < 0
        || !validTime(startTime) || !validTime(endTime) || end <= start) throw new Error("Värderingsunderlaget är ogiltigt.");
    let net = 0, weighted = 0;
    for (const flow of flows) {
        const time = Date.parse(flow.occurredAt);
        const assumed = flow.occurredAt == null && flow.timingPolicy === "end_of_day_assumption" && isDate(flow.date)
            && flow.date > stockholmDate(startTime) && flow.date <= stockholmDate(endTime);
        if ((!assumed && (!validTime(flow.occurredAt) || time <= start || time > end)) || !isAmount(flow.amountSek)) throw new Error("Kapitalflödets belopp eller tidpunkt saknas.");
        net += flow.amountSek;
        // Daily linked intervals: date-only flows are assumed at this day's end.
        // No timestamp is fabricated or represented as an actual observed instant.
        if (assumed && flow.date !== stockholmDate(endTime)) throw new Error("Datumantagandet kräver dagliga delperioder.");
        weighted += assumed ? 0 : (end - time) / (end - start) * flow.amountSek;
    }
    const denominator = startValue + weighted;
    if (denominator <= 0) throw new Error("Avkastning kan inte beräknas med noll eller negativ kapitalbas.");
    const result = (endValue - startValue - net) / denominator;
    if (!Number.isFinite(result) || result <= -1) throw new Error("Avkastningskedjan kan inte fortsätta efter total kapitalförlust.");
    return result;
}

export function exactTimeWeightedReturn(startValue, endValue, flows) {
    let factor = 1, opening = startValue;
    if (!isAmount(opening) || opening <= 0 || !isAmount(endValue) || endValue < 0) throw new Error("Värdering saknas.");
    for (const flow of flows) {
        const before = flow.valueBeforeSek, after = flow.valueAfterSek;
        if (flow.valuationVerified !== true || !isAmount(before) || before <= 0 || !isAmount(after) || after <= 0
            || !isAmount(flow.amountSek) || !sameValue(after - before, flow.amountSek)) throw new Error("Verifierad värdering före och efter kapitalflödet saknas.");
        factor *= before / opening;
        opening = after;
    }
    const result = factor * endValue / opening - 1;
    if (!Number.isFinite(result) || result <= -1) throw new Error("Avkastningskedjan kan inte fortsätta efter total kapitalförlust.");
    return result;
}

// Trusted read adapter must certify scope/coverage/revision. Never infer completeness
// from an empty transaction array, CSV of today's holdings, or legacy total snapshots.
export function buildPortfolioPerformance(input, now = Date.now()) {
    if (input?.apiVersion !== PERFORMANCE_VERSION || !input.baseline) return fail("Verifierad öppningsbalans, kassa och kassaflödeshistorik behöver registreras.");
    const { baseline, observations, flows } = input;
    if(baseline.sourceReconciliationRequired===true)return fail('En kurs i öppningsbalansen har rättats. Startvärdet behöver stämmas av innan avkastningen kan visas.');
    if (baseline.verified !== true || baseline.coverage !== "complete" || !baseline.source?.trim()
        || !Array.isArray(baseline.positions) || !Array.isArray(baseline.cash) || baseline.cash.length === 0
        || !isDate(baseline.date) || !validTime(baseline.asOf) || stockholmDate(baseline.asOf) !== baseline.date
        || baseline.date >= stockholmDate(now) || !isAmount(baseline.valueSek) || baseline.valueSek <= 0) return fail("Öppningsbalansen är ofullständig eller saknar verifierat värde.");
    if (!Array.isArray(observations) || !Array.isArray(flows) || !Number.isSafeInteger(input.revision)
        || input.revision < 0 || input.cashFlowCoverage !== "complete" || input.costCoverage !== "complete") return fail("Komplett kassaflödes- och avgiftsunderlag saknas.");
    if (input.convention !== PERFORMANCE_CONVENTION || input.returnBasis !== "net_total_return") return fail("Värderings- eller utdelningskonventionen kunde inte verifieras.");
    const today = stockholmDate(now);
    const seen = new Set();
    for (const flow of flows) {
        const assumed = flow.occurredAt == null && flow.timingPolicy === "end_of_day_assumption" && isDate(flow.date)
            && flow.date > baseline.date && flow.date < today;
        if (!flow.id || seen.has(flow.id) || flow.verified !== true || !flow.source?.trim()
            || (!assumed && (!validTime(flow.occurredAt) || Date.parse(flow.occurredAt) <= Date.parse(baseline.asOf) || Date.parse(flow.occurredAt) > now))
            || !isAmount(flow.amountSek) || flow.amountSek === 0) return fail("Kapitalflöden är ofullständiga, dubbla eller har ogiltig tidpunkt.");
        seen.add(flow.id);
    }
    let previous = { date: baseline.date, asOf: baseline.asOf, valueSek: baseline.valueSek }, value = 100;
    const points = [{ ...previous, value, finalized: baseline.finalized === true }];
    let method = "TWR";
    for (const observation of observations) {
        if (observation.verified !== true || observation.finalized !== true || observation.coverage !== "complete"
            || !observation.source?.trim() || observation.revision !== input.revision || !isDate(observation.date)
            || observation.date >= today || !validTime(observation.asOf) || stockholmDate(observation.asOf) !== observation.date
            || Date.parse(observation.asOf) > now || !isAmount(observation.valueSek) || observation.valueSek < 0
            || observation.date <= previous.date || (Date.parse(observation.date) - Date.parse(previous.date)) !== 86400000
            || Date.parse(observation.asOf) <= Date.parse(previous.asOf)) return fail("Färdigställda dagsvärderingar saknas, har luckor eller behöver räknas om efter en affär.");
        const intervalFlows = flows.filter(flow => flow.occurredAt == null ? flow.date > previous.date && flow.date <= observation.date
            : Date.parse(flow.occurredAt) > Date.parse(previous.asOf) && Date.parse(flow.occurredAt) <= Date.parse(observation.asOf))
            .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
        if (intervalFlows.some((flow, i) => i > 0 && flow.occurredAt && Date.parse(flow.occurredAt) === Date.parse(intervalFlows[i - 1].occurredAt))) return fail("Samtidiga kapitalflöden kräver verifierad ordning eller ett avstämt gemensamt flöde.");
        const exact = intervalFlows.every(flow => validTime(flow.occurredAt) && flow.valuationVerified === true && isAmount(flow.valueBeforeSek) && isAmount(flow.valueAfterSek));
        try {
            const change = exact ? exactTimeWeightedReturn(previous.valueSek, observation.valueSek, intervalFlows)
                : modifiedDietz(previous.valueSek, observation.valueSek, previous.asOf, observation.asOf, intervalFlows);
            if (!exact) method = "DAILY_MODIFIED_DIETZ";
            value *= 1 + change;
            if (!Number.isFinite(value) || value <= 0) return fail("Ogiltigt avkastningsindex.");
        } catch (error) { return fail(error.message); }
        points.push({ date: observation.date, asOf: observation.asOf, value, valueSek: observation.valueSek, finalized: true });
        previous = observation;
    }
    if (points.length < 2) return fail("Öppningsbalansen är verifierad. Nästa färdigställda dagsvärdering behövs för avkastning.");
    return { available: true, apiVersion: PERFORMANCE_VERSION, verified: true, source: baseline.source, currency: "SEK",
        cadence: "daily_close", convention: input.convention, returnBasis: input.returnBasis, cashFlowCoverage: "complete",
        method, quality: method === "TWR" ? "verified" : "estimated", points,
        methodLabel: method === "TWR" ? "TWR" : "Daglig Modified Dietz · uppskattad",
        reason: method === "TWR" ? "" : "Kassaflödesjusterad uppskattning. Värdering vid varje kapitalflöde saknas; stora flöden och kursrörelser kan ge avvikelse från exakt TWR." };
}
