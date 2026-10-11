// Public metadata only: no positions, account IDs, portfolio values, GAV or DB access.
import {writeFileSync} from 'node:fs';
import {createSnapshotProviders} from '../supabase/functions/_shared/snapshotProviders.js';
import {latestCompletedSession,holdingMarket} from '../supabase/functions/_shared/marketCalendar.js';
import {publicListedCatalog as entries} from './publicListedCatalog.mjs';
const fetcher=(url,options)=>{
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||!['www.avanza.se','www.nordnet.se','query1.finance.yahoo.com'].includes(parsed.hostname))
        throw new Error('Public audit refuses other hosts, including Supabase and crypto spot providers.');
    return fetch(url,options);
};
const now=Date.now(),results=[];
let next=0;
await Promise.all(Array.from({length:4},async()=>{
    while(next<entries.length) {
        const holding=entries[next++],session=latestCompletedSession(holdingMarket(holding),now);
        try {
            const point=await createSnapshotProviders({fetcher,clock:()=>now,budgetMs:25000}).close(holding.assetType==='SUBSCRIPTION_OPTION'?{...holding,productType:'ETP'}:holding,session);
            if(point.date!==session.date||point.currency!==holding.currency||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0)
                throw new Error('Invalid dated quote');
            results.push({name:holding.name,isin:holding.isin,market:holding.market,currency:point.currency,date:point.date,
                status:'dated_source_point_verified',kind:point.kind,price:point.price,
                provenance:point.sourceMetadata?.provenance??'mapped_listing_symbol_exchange_currency',
                historicalSeriesVerified:false,issuerListingReviewRequired:holding.assetType==='STOCK'});
        }catch(error) {
            results.push({name:holding.name,isin:holding.isin,market:holding.market,currency:holding.currency,
                status:'no_verified_source_point',reason:error.message,historicalSeriesVerified:false});
        }
    }
}));
results.sort((a,b)=>a.name.localeCompare(b.name));
const report={evaluatedAt:new Date(now).toISOString(),scope:'Public dated-quote probes only. No portfolio or DB access. User supplied metadata is not a server-certified instrument registry.',results};
writeFileSync('docs/pilot-public-listed-audit.json',`${JSON.stringify(report,null,2)}\n`);
console.log(`Public listed audit: ${results.filter(p=>p.status==='dated_source_point_verified').length}/${results.length} source points verified. Full result saved to docs/pilot-public-listed-audit.json. No database access.`);
