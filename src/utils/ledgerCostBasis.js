import {validateLedgerEvent} from './performanceLedger.js';

const key = row => JSON.stringify([row.accountId, row.instrumentId]);
const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameAmount=(a,b)=>known(a)&&known(b)&&Math.abs(a-b)<=Math.max(1e-8,Math.abs(b)*1e-10);

// Acquisition cost is independent of market valuation and the return anchor.
// Foreign purchases need actual broker acquisition FX before SEK GAV is known.
export function ledgerCostBasis(baseline, events = []) {
    const positions = new Map();
    for (const row of baseline?.positions ?? []) {
        if (!known(row.quantity) || positions.has(key(row))) throw new Error('Ogiltigt GAV-underlag.');
        const nativeCost = row.quantity === 0 ? 0 : known(row.averagePrice) ? row.quantity * row.averagePrice : null;
        positions.set(key(row), {...row, nativeCost,
            sekCost: row.quantity === 0 ? 0 : row.currency === 'SEK' ? nativeCost : known(row.averagePriceSek) ? row.quantity * row.averagePriceSek : null});
    }
    const seen = new Set(), order = new Set();
    for (const event of [...events].sort((a,b) => a.date.localeCompare(b.date) || a.sequence - b.sequence)) {
        validateLedgerEvent(event);
        if (event.date <= baseline.date || seen.has(event.id) || !Number.isSafeInteger(event.sequence)
            || event.sequence < 0 || order.has(`${event.date}:${event.sequence}`)) throw new Error('GAV kräver entydig affärsordning.');
        seen.add(event.id); order.add(`${event.date}:${event.sequence}`);
        if (!['BUY','SELL'].includes(event.kind)) continue;
        const id = key(event), current = positions.get(id) ?? {...event, quantity: 0, nativeCost: 0, sekCost: 0};
        if (current.currency !== event.currency) throw new Error('GAV-valutan stämmer inte med innehavet.');
        const next = {...current};
        if (event.kind === 'SELL') {
            if (event.quantity > current.quantity + 1e-8) throw new Error('Försäljningen överstiger innehavet.');
            next.quantity = Math.max(0, current.quantity - event.quantity);
            for (const field of ['nativeCost','sekCost']) next[field] = next.quantity === 0 ? 0
                : current[field] == null ? null : current[field] * next.quantity / current.quantity;
        } else {
            next.quantity += event.quantity;
            const cost = event.fee.currency === event.currency || event.fee.amount === 0 ? event.amount + event.fee.amount : null;
            next.nativeCost = current.nativeCost == null || cost == null ? null : current.nativeCost + cost;
            // Valuation FX (including ECB daily rates) is not evidence of actual acquisition cost.
            const conversions=events.filter(f=>f.kind==='FX'&&f.tradeId===event.id);
            const conversion=conversions[0];
            const nativeSettlement=event.amount+(event.fee.currency===event.currency?event.fee.amount:0);
            const feeSek=event.fee.currency==='SEK'?event.fee.amount:0;
            const actual=conversions.length===1&&conversion.verified===true&&conversion.settlementEvidence==='broker_actual_amount'
                &&conversion.accountId===event.accountId&&conversion.date===event.date&&conversion.sequence===event.sequence-1
                &&conversion.currency==='SEK'&&conversion.toCurrency===event.currency
                &&sameAmount(conversion.toAmount,nativeSettlement)&&sameAmount(conversion.amount+feeSek,event.settlementAmountSek)
                &&conversion.fee?.amount===0&&known(conversion.amount)&&conversion.amount>0;
            next.sekCost = event.currency === 'SEK' ? next.nativeCost
                : actual&&current.sekCost!=null ? current.sekCost+event.settlementAmountSek : null;
        }
        positions.set(id, next);
    }
    return new Map([...positions].map(([id,row]) => [id, {...row,
        averagePrice: row.quantity > 0 && row.nativeCost != null ? row.nativeCost / row.quantity : null,
        averagePriceSek: row.quantity > 0 && row.sekCost != null ? row.sekCost / row.quantity : null,
        costBasisUnavailable: row.nativeCost == null || row.sekCost == null}]));
}
