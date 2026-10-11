// Review only; market valuation and acquisition cost have different meanings.
export function importReconciliationSummary(plan) {
    if(plan.kind!=='opening')return [];
    const accounts=new Map();
    const get=id=>{if(!accounts.has(id))accounts.set(id,{accountId:id,positions:[],cash:[],missingCost:0});return accounts.get(id);};
    for(const row of plan.positions??[]) {
        const account=get(row.accountId);account.positions.push(row);
        if(typeof row.averagePrice!=='number'||!Number.isFinite(row.averagePrice)||row.averagePrice<0
            ||(row.currency!=='SEK'&&(typeof row.averagePriceSek!=='number'||!Number.isFinite(row.averagePriceSek)||row.averagePriceSek<0)))account.missingCost++;
    }
    for(const row of plan.cash??[])get(row.accountId).cash.push(row);
    return [...accounts.values()];
}
