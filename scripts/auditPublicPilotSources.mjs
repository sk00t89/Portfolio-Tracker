// Public instrument metadata only. No holdings, accounts, auth or database access.
import {writeFileSync} from 'node:fs';
import {createSnapshotProviders} from '../supabase/functions/_shared/snapshotProviders.js';
import {stockholmDate} from '../src/utils/calendarDate.js';
const funds=[
    ['Avanza Zero','SE0001718388'],['Kavaljer Quality Focus A SEK','LU1232457504'],
    ['Länsförsäkringar USA Index','SE0002793943'],['Spiltan Aktiefond Investmentbolag','SE0004297927'],
    ['Swedbank Robur Access Asien A','SE0007074117'],
].map(([name,isin])=>({name,isin,currency:'SEK',assetType:'FUND',platform:'Avanza'}));
const fetcher=(url,options)=>{
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||!['www.avanza.se','www.nordnet.se','api.lysa.se'].includes(parsed.hostname))
        throw new Error('Public market audit refuses any other host, including Supabase.');
    return fetch(url,options);
};
const now=Date.now();
const results=await Promise.all(funds.map(async holding=>{
    try {
        const point=await createSnapshotProviders({fetcher,clock:()=>now,budgetMs:25000}).fund(holding,now);
        return {name:holding.name,isin:holding.isin,status:'latest_nav_verified',date:point.date,currency:point.currency,price:point.price,
            provider:point.provider,historicalSeriesVerified:false};
    }catch {return {name:holding.name,isin:holding.isin,status:'no_verified_latest_nav_from_existing_adapters',historicalSeriesVerified:false};}
}));
try {
    const response=await fetcher('https://api.lysa.se/funds',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Lysa unavailable');
    const rows=await response.json();
    const entries=Object.entries(rows).filter(([isin,p])=>/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)&&typeof p.price==='number'&&p.price>0&&Number.isFinite(p.price));
    results.push({name:'Lysa public fund endpoint',status:entries.length?'latest_nav_records_present_identity_and_dates_need_review':'no_valid_records',recordCount:entries.length,historicalSeriesVerified:false});
}catch {results.push({name:'Lysa public fund endpoint',status:'unavailable',historicalSeriesVerified:false});}
const report={evaluatedAt:new Date(now).toISOString(),stockholmDate:stockholmDate(now),scope:'Public latest NAV probe only; no portfolio or database access. This cannot certify historical coverage.',results};
writeFileSync('docs/pilot-public-market-audit.json',`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
