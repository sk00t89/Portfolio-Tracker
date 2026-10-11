import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createPublicMarketArchive} from './publicMarketArchive.mjs';
import {publicCatalog} from './publicPilotCatalog.mjs';
import {createArchivedPortfolioMarket} from '../supabase/functions/_shared/archivedPortfolioMarket.js';
import {reviewedFundPublicationCalendar,reviewedPublicFundRules} from '../supabase/functions/_shared/fundPublicationCalendar.js';
import {expectedEcbReferenceDate} from '../supabase/functions/_shared/ecbPublicationCalendar.js';
import {updatePerformanceHistory} from '../supabase/functions/_shared/performanceHistoryWorker.js';
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
export const publicFxListing={instrumentId:'public-fx-USD-SEK',isin:'ECB:USDSEK',currency:'USD',identityVerified:true,assetType:'FX'};

export async function mirrorPublicArchive(admin){
    const archive=createPublicMarketArchive({path:resolve('supabase-test/public-market.local'),catalog:[...publicCatalog,publicFxListing]});
    const snapshot=await archive.snapshot(),points=Object.values(snapshot.current);
    for(const point of points){
        const {collectedAt,contentSha256,...stable}=point;
        if(!collectedAt||createHash('sha256').update(JSON.stringify(stable)).digest('hex')!==contentSha256)
            throw new Error('Public file archive checksum mismatch');
    }
    // A complete read snapshot is mirrored in one DB transaction; no per-user fetch.
    if(points.length>500)throw new Error('Public archive needs a reviewed paginated ingestion protocol. No partial mirror.');
    return archive.withRevision(snapshot.revision,async()=>unwrap(await admin.rpc('archive_local_public_sources',{p_points:points})));
}

export function createPublicDatabaseHistory(admin){
    const latest=async(id,currency,date)=>unwrap(await admin.from('local_performance_market_cache').select('observation')
        .like('cache_key',`public:source:${id}:${currency}:%`).not('cache_key','like','%:version:%')
        .lte('cache_key',`public:source:${id}:${currency}:${date}`).order('cache_key',{ascending:false}).limit(1).maybeSingle())?.observation;
    const revision=async()=>unwrap(await admin.from('local_performance_market_cache').select('observation').eq('cache_key','public:revision').single()).observation.revision;
    const market={...createArchivedPortfolioMarket({catalog:publicCatalog,archive:{latestPrice:latest},
        publicationCalendar:reviewedFundPublicationCalendar(reviewedPublicFundRules),fx:async(currency,date)=>{
            if(currency!=='USD')throw new Error('Verifierad historisk valuta saknas.');
            const point=await latest(publicFxListing.instrumentId,currency,date);
            if(!point||point.date!==expectedEcbReferenceDate(date))throw new Error('Förväntad historisk valutakurs saknas.');
            return {...point,valuationDate:date,...(point.date!==date?{carryPolicy:'last_published',calendarVerified:true}:{})};
        }}),archiveRevision:revision};
    const database={input:async userId=>unwrap(await admin.rpc('get_local_performance_worker_input',{p_user_id:userId})),
        publish:async(userId,portfolioRevision,observations)=>unwrap(await admin.rpc('publish_local_public_history',{p_user_id:userId,p_revision:portfolioRevision,p_observations:observations})),
        failure:async(userId,portfolioRevision,date,reason)=>unwrap(await admin.from('local_performance_runs').upsert({user_id:userId,revision:portfolioRevision,valuation_date:date,status:'failed',reason},{onConflict:'user_id,revision,valuation_date'}))};
    return {market,database,update:(userId,now)=>updatePerformanceHistory({userId,database,market,now})};
}
