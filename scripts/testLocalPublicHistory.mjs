import assert from 'node:assert/strict';
import {writeFile,readFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertLocalDatabase} from './localPerformanceEnvironment.mjs';
import {publicCatalog} from './localPublicMarketJob.mjs';
import {createPublicMarketArchive} from './publicMarketArchive.mjs';
import {createArchivedPortfolioMarket} from '../supabase/functions/_shared/archivedPortfolioMarket.js';
import {updatePerformanceHistory} from '../supabase/functions/_shared/performanceHistoryWorker.js';
import {performanceFromStoredInput} from '../src/services/portfolioPerformance.js';
import {fetchPerformanceBenchmark} from '../src/services/performanceBenchmarks.js';
import {buildDailyPerformanceView} from '../src/utils/performanceComparison.js';
assertLocalDatabase();
const fxListing={instrumentId:'public-fx-USD-SEK',isin:'ECB:USDSEK',currency:'USD',identityVerified:true,assetType:'FX'};
const archive=createPublicMarketArchive({path:resolve('supabase-test/public-market.local'),catalog:[...publicCatalog,fxListing]});
const listing=publicCatalog.find(p=>p.isin==='CA00288U1066'),date='2026-10-05',first=await archive.latestPrice(listing.instrumentId,'USD',date),rate=await archive.latestPrice(fxListing.instrumentId,'USD',date);
assert.equal(first.date,date);assert.equal(rate.date,date);
// Deliberately fictional quantity, account and cash. This is not the user's export.
const baseline={date,asOf:'2026-10-05T23:59:59+02:00',finalized:true,priceSources:[first],fxSources:[rate],source:'synthetic_test',verified:true,coverage:'complete',valueSek:1000+2*first.price*rate.rate,
    positions:[{accountId:'fictional-public-test',instrumentId:listing.instrumentId,currency:'USD',quantity:2}],cash:[{accountId:'fictional-public-test',currency:'SEK',amount:1000}]};
const sourceRevision=(await archive.snapshot()).revision;
const input={apiVersion:'portfolio-performance-v1',convention:'stockholm_end_of_day_v1',returnBasis:'net_total_return',baseline,revision:sourceRevision,events:[],observations:[],cashFlowCoverage:'complete',costCoverage:'complete'},versionsPath=resolve('supabase-test/public-history-demo.local');
let versions;try{versions=JSON.parse(await readFile(versionsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;versions={scope:'Synthetic quantity and cash with public real market data',versions:{}};}
const market={...createArchivedPortfolioMarket({catalog:[listing],archive,fx:async(currency,day)=>{
    const point=await archive.latestPrice(fxListing.instrumentId,currency,day);
    if(!point||point.date!==day)throw new Error('Verifierad historisk valutakurs saknas.');return point;
}}),archiveRevision:async()=>(await archive.snapshot()).revision};
const database={input:async()=>input,failure:async(_u,_r,_d,reason)=>{throw new Error(reason);},
    publish:async(_u,r,points)=>archive.withRevision(r,async()=>{
        input.observations.push(...points);versions.versions[r]=structuredClone(input);
        await writeFile(`${versionsPath}.tmp`,JSON.stringify(versions,null,2));await rename(`${versionsPath}.tmp`,versionsPath);
    })};
await updatePerformanceHistory({userId:'fictional-public-test',database,market,now:Date.parse('2026-10-10T12:00:00Z')});
const portfolio=performanceFromStoredInput(input);assert.equal(portfolio.available,true);assert.equal(portfolio.method,'TWR');assert.equal(portfolio.points[0].value,100);assert.equal(input.observations.length,4);
for(const id of ['OMXS30','SP500']){
    const benchmark=await fetchPerformanceBenchmark((url,options)=>fetch(`http://127.0.0.1:55801${url}`,options),id,'1M',new AbortController().signal);
    const view=buildDailyPerformanceView(portfolio,benchmark,'1M','2026-10-10',Date.parse('2026-10-10T12:00:00Z'));
    assert.equal(view.comparison.available,true);assert.equal(view.comparison.series[0].value,0);assert.equal(view.comparison.series[0].benchmark,0);
}
console.log('PASS LOCAL: fictional two-unit portfolio, real archived stock/ECB data over five trading days, persisted source revisions, exact no-flow TWR and both actual index comparisons start at common zero. No actual portfolio imported.');
