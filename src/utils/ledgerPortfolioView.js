import {ledgerCostBasis} from './ledgerCostBasis.js';
// Display only: opening market price is never repurposed as GAV.
export function ledgerPortfolioHoldings(input) {
    if(!input?.baseline||!input?.ledgerState)return [];
    const observation=input.observations.at(-1);
    let costs=new Map();
    try { if(!input.displayCostInvalidated)costs=ledgerCostBasis(input.baseline,input.events??[]); } catch { /* Incomplete cost evidence remains unavailable. */ }
    return input.ledgerState.positions.map(position=>{
        const imported=input.baseline.positions?.find(p=>p.accountId===position.accountId&&p.instrumentId===position.instrumentId)??{};
        const quote=(observation?.priceSources??input.displayPriceSources??[]).find(p=>p.instrumentId===position.instrumentId&&p.currency===position.currency);
        const fx=(observation?.fxSources??input.displayFxSources??[]).find(r=>r.from===position.currency&&r.to==='SEK');
        const price=quote?.verified===true&&quote.source?.trim()&&typeof quote.price==='number'&&Number.isFinite(quote.price)&&quote.price>0?quote.price:null;
        const rate=position.currency==='SEK'?1:fx?.verified===true&&fx.source?.trim()&&typeof fx.rate==='number'&&Number.isFinite(fx.rate)&&fx.rate>0?fx.rate:null;
        const id=JSON.stringify([position.accountId,position.instrumentId]);
        const cost=costs.get(id),consistent=cost&&Math.abs(cost.quantity-position.quantity)<1e-8;
        const holding={...imported,...position,id,name:imported.name??(position.instrumentId==='test-sek-stock'?'Syntetisk testaktie':position.instrumentId),
            platform:position.accountId,assetType:imported.assetType??'STOCK',currentPrice:price??null,currentValueSek:price==null||rate==null?null:position.quantity*price*rate,
            quoteStale:true,averagePrice:consistent?cost.averagePrice:null,averagePriceSek:consistent?cost.averagePriceSek:null,
            costBasisUnavailable:!consistent||cost.costBasisUnavailable};
        return {id,instrumentKey:id,name:holding.name,totalValue:holding.currentValueSek??0,valueUnavailable:holding.currentValueSek==null,positions:[holding]};
    });
}
