import { buildPortfolioPerformance, PERFORMANCE_VERSION } from "../utils/portfolioPerformance.js";
import { replayPerformanceLedger } from "../utils/performanceLedger.js";

export function performanceFromStoredInput(data, now = Date.now()) {
    if (data?.apiVersion !== PERFORMANCE_VERSION || !data.baseline) return buildPortfolioPerformance(null, now);
    try {
        if (!Array.isArray(data.events) || !Array.isArray(data.observations)) throw new Error("Transaktionsjournal eller dagsvärderingar saknas.");
        const throughDate = data.observations.at(-1)?.date ?? data.baseline.date;
        const { externalFlows } = replayPerformanceLedger(data.baseline, data.events, throughDate);
        const certificates=data.observations.flatMap(o=>o.flowValuations??[]);
        return buildPortfolioPerformance({ ...data,
            flows: externalFlows.map(event => {
                const certificate=certificates.find(c=>c.id===event.id&&c.occurredAt===event.occurredAt&&c.amountSek===event.amountSek&&c.valuationVerified===true&&c.source);
                return ({ id: event.id, source: event.source, verified: event.verified,
                amountSek: event.amountSek, occurredAt: event.occurredAt, date: event.date, timingPolicy: event.timingPolicy, valuationVerified: event.valuationVerified,
                valueBeforeSek: event.valueBeforeSek, valueAfterSek: event.valueAfterSek,
                ...(certificate?{valuationVerified:true,valueBeforeSek:certificate.valueBeforeSek,valueAfterSek:certificate.valueAfterSek}:{}) });}) }, now);
    } catch (error) { return { available: false, points: [], reason: error.message }; }
}

// Reads only. The proposed RPC is not called before explicitly enabled deployment.
export async function readPortfolioPerformance(client, enabled, now = Date.now()) {
    if (!enabled) return { available: false, points: [], reason: "Avkastningshistorik behöver aktiveras med verifierad öppningsbalans, kassa och transaktionsjournal." };
    const { data, error } = await client.rpc("get_portfolio_performance_input");
    if (error) return { available: false, points: [], reason: "Avkastningsunderlaget kunde inte läsas. Kontrollera anslutning och serverkonfiguration." };
    return performanceFromStoredInput(data, now);
}
