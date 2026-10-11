import {calculatePerformanceObservation} from '../../../src/utils/performanceObservation.js';
import {replayPerformanceLedger,valuePerformanceLedger} from '../../../src/utils/performanceLedger.js';
import {stockholmDate} from '../../../src/utils/calendarDate.js';
import {addCalendarDays,zonedInstant} from './marketCalendar.js';

// Runtime independent server job. Every dependency is injected; no browser session.
// The production scheduler and credentials are deliberately not configured here.
export async function updatePerformanceHistory({userId,database,market,now=Date.now()}) {
    const input=await database.input(userId);
    if(!input?.baseline)return {published:0,reason:'Öppningsbalans saknas.'};
    const target=addCalendarDays(stockholmDate(now),-1),existing=new Set(input.observations.map(o=>o.date)),batch=[];
    let date=addCalendarDays(input.baseline.date,1),publishing=false;
    const sourceRevision=await market.archiveRevision?.();
    const publish=async()=>{
        if(sourceRevision!==await market.archiveRevision?.())throw new Error('Kursunderlaget har rättats under värderingen. Kör historiken igen.');
        await database.publish(userId,input.revision,batch);
    };
    try {
        if(input.baseline.sourceReconciliationRequired===true)throw new Error('En kurs i öppningsbalansen har rättats. Startvärdet behöver stämmas av.');
        for(let count=0;date<=target;date=addCalendarDays(date,1),count++) {
            if(count>3660)throw new Error('Historiken behöver delas upp i mindre körningar.');
            if(existing.has(date))continue;
            const state=replayPerformanceLedger(input.baseline,input.events,date);
            const prices=await Promise.all(state.positions.map(p=>market.price(p,date)));
            const currencies=[...new Set([...state.positions,...state.cash].map(p=>p.currency))].filter(c=>c!=='SEK');
            const rates=await Promise.all(currencies.map(c=>market.fx(c,date)));
            const observation=calculatePerformanceObservation({baseline:input.baseline,events:input.events,date,
                asOf:new Date(zonedInstant(date,'23:59','Europe/Stockholm')+59999).toISOString(),revision:input.revision,
                source:market.source,journalCoverage:input.cashFlowCoverage,costCoverage:input.costCoverage,prices,rates},now);
            observation.flowValuations=await certifyFlowValuations(input,date,market);
            if(sourceRevision!=null)observation.sourceRevision=sourceRevision;
            batch.push(observation);
        }
        if(batch.length){publishing=true;await publish();}
        return {revision:input.revision,published:batch.length,target,source:market.source};
    } catch(error) {
        // Retain the complete contiguous prefix when a later NAV is delayed.
        // Publication still checks the portfolio/source revision atomically.
        if(batch.length&&!publishing)await publish();
        await database.failure(userId,input.revision,date,error.message);
        throw error;
    }
}

export async function certifyFlowValuations(input,date,market) {
    const daily=input.events.filter(e=>e.date===date),certificates=[];
    // Date-only trades cannot establish their order relative to an intraday flow.
    // Until actual times are available, use Dietz rather than an invented split.
    if(!market.instant||daily.length!==1)return certificates;
    const flow=daily[0];if(!['DEPOSIT','WITHDRAWAL'].includes(flow.kind)||!flow.occurredAt)return certificates;
    try {
        const before=replayPerformanceLedger(input.baseline,input.events.filter(e=>e.date<date),date);
        const after=replayPerformanceLedger(input.baseline,input.events.filter(e=>e.date<=date),date);
        const evidence=await market.instant(before.positions,flow.occurredAt);
        const points=[...(evidence?.prices??[]),...(evidence?.rates??[])];
        if(!evidence||points.some(p=>p.observedAt!==flow.occurredAt||p.verified!==true||!p.source))return certificates;
        const valueBeforeSek=valuePerformanceLedger(before,date,evidence.prices,evidence.rates),valueAfterSek=valuePerformanceLedger(after,date,evidence.prices,evidence.rates);
        const amountSek=flow.amount*flow.fxRateToSek*(flow.kind==='WITHDRAWAL'?-1:1);
        if(Math.abs(valueAfterSek-valueBeforeSek-amountSek)>1e-6)return certificates;
        certificates.push({id:flow.id,occurredAt:flow.occurredAt,amountSek,valueBeforeSek,valueAfterSek,valuationVerified:true,
            source:market.source,priceSources:evidence.prices,fxSources:evidence.rates});
    }catch{/* Missing instant evidence explicitly falls back to estimated Dietz. */}
    return certificates;
}

// Successful public market evidence is cached across portfolios; failures retry.
export function sharedHistoricalMarket(provider,cache) {
    const pending=new Map();
    const get=(key,load)=>{
        if(pending.has(key))return pending.get(key);
        const promise=(async()=>{const stored=await cache.read(key);if(stored)return stored;
            const point=await load();if(point?.verified!==true||!point.source)throw new Error('Verifierad historisk marknadsdata saknas.');
            await cache.write(key,point);return point;})();
        pending.set(key,promise);promise.finally(()=>pending.delete(key)).catch(()=>{});return promise;
    };
    return {source:provider.source,
        price:(position,date)=>get(`${provider.source}:price:${position.instrumentId}:${position.currency}:${date}`,()=>provider.price(position,date)),
        fx:(currency,date)=>get(`${provider.source}:fx:${currency}:SEK:${date}`,()=>provider.fx(currency,date))};
}
