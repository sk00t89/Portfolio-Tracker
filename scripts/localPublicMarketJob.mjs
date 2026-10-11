// Public market evidence only. No actual holdings, accounts or trade imports.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertLocalDatabase} from './localPerformanceEnvironment.mjs';
import {createPublicMarketArchive} from './publicMarketArchive.mjs';
import {createSnapshotProviders} from '../supabase/functions/_shared/snapshotProviders.js';
import {collectPublishedMarket} from '../supabase/functions/_shared/publishedMarketCollector.js';
import {createHistoricalPortfolioMarket} from '../supabase/functions/_shared/historicalPortfolioMarket.js';
import {tradingSession,addCalendarDays} from '../supabase/functions/_shared/marketCalendar.js';
import {publicCatalog} from './publicPilotCatalog.mjs';
export {publicCatalog} from './publicPilotCatalog.mjs';
import {stockholmDate} from '../src/utils/calendarDate.js';
import {createClient} from '@supabase/supabase-js';
import {localCredentials} from './localPerformanceEnvironment.mjs';
export function publicOnlyFetch(url,options){
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||!['www.avanza.se','www.nordnet.se','query1.finance.yahoo.com','api.frankfurter.dev'].includes(u.hostname))throw new Error('Public source host refused');
    return fetch(url,options);
}
export async function runLocalPublicMarketJob(){
    assertLocalDatabase();const now=Date.now();
    const fxListing={instrumentId:'public-fx-USD-SEK',isin:'ECB:USDSEK',currency:'USD',identityVerified:true,assetType:'FX'};
    const archive=createPublicMarketArchive({path:resolve('supabase-test/public-market.local'),catalog:[...publicCatalog,fxListing]});
    // A new provider per run refreshes the latest NAV; no stale forever-cached response.
    const result=await collectPublishedMarket({catalog:publicCatalog,archive,now,provider:{
        fund:(listing,time)=>createSnapshotProviders({fetcher:publicOnlyFetch,budgetMs:25000}).fund(listing,time),
        close:(listing,session)=>createSnapshotProviders({fetcher:publicOnlyFetch,budgetMs:25000}).close(listing,session),
    }});
    const historical=createHistoricalPortfolioMarket({catalog:publicCatalog,fetcher:publicOnlyFetch}),points=[],failures=[];
    // Re-fetch a rolling window to recover missed runs and provider corrections.
    // Only genuine daily bars; no assumption that yesterday's latest is historical.
    const today=stockholmDate(now),recoveryDates=Array.from({length:8},(_,i)=>addCalendarDays(today,i-7));
    for(const listing of publicCatalog.filter(p=>p.assetType==='STOCK'))for(const date of recoveryDates){
        if(tradingSession(listing.currency==='USD'?'USA':'STOCKHOLM',date).closed)continue;
        if(date===today)continue; // Latest completed close is collected separately.
        try{points.push({...await historical.price(listing,date),source:'Yahoo / session_close',isin:listing.isin,collectedAt:new Date(now).toISOString()});}
        catch(e){failures.push({instrumentId:listing.instrumentId,date,reason:e.message});}
    }
    let fxPoints=0;
    for(const date of recoveryDates){
        try{
            const point={...await historical.fx('USD',date),...fxListing,collectedAt:new Date(now).toISOString()};
            const existing=points.find(p=>p.instrumentId===point.instrumentId&&p.date===point.date);
            if(existing&&existing.rate!==point.rate)throw new Error('Conflicting ECB source revision');
            if(!existing){points.push(point);fxPoints++;}
        }
        catch(e){failures.push({instrumentId:fxListing.instrumentId,date,reason:e.message});}
    }
    const historicalCommit=points.length?await archive.commitBatch(points):null;
    const credentials=localCredentials(),admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false}});
    const {mirrorPublicArchive}=await import('./publicMarketDatabase.mjs');
    const databaseMirror=await mirrorPublicArchive(admin);
    const report={evaluatedAt:new Date(now).toISOString(),scope:'Local public source archive; no portfolio import or production access',
        latest:result,databaseMirror,historical:{stockPoints:points.length-fxPoints,fxPoints,failures,committed:historicalCommit},
        limits:['Latest fund NAV is archived by its real source date; missing older NAV is never manufactured.',
            'Certificate older daily bars remain unavailable unless their own product identity is verified.',
            'Fund calendars not explicitly reviewed remain unknown; they cannot authorize carrying a stale NAV.']};
    writeFileSync('docs/local-public-market-job.json',JSON.stringify(report,null,2)+'\n');
    console.log(`LOCAL public archive: ${result.points.length}/${publicCatalog.length} latest sources, ${points.length-fxPoints} verified stock bars and ${fxPoints} historical FX points. Missing sources: ${result.failures.length+failures.length}. No real portfolio imported.`);
    return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    await runLocalPublicMarketJob();
    if(process.argv.includes('--watch'))setInterval(()=>void runLocalPublicMarketJob().catch(e=>console.error('LOCAL collector retry needed:',e.message)),3600000);
}
