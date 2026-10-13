import {syntheticCatalog} from './syntheticPortfolioFixtures.mjs';
import {latestCompletedSession,zonedInstant,tradingSession} from '../supabase/functions/_shared/marketCalendar.js';
import {sharedHistoricalMarket,updatePerformanceHistory} from '../supabase/functions/_shared/performanceHistoryWorker.js';
import {createArchivedPortfolioMarket} from '../supabase/functions/_shared/archivedPortfolioMarket.js';
import {createPublicDatabaseHistory} from './publicMarketDatabase.mjs';

// Fixed, explicitly fictional observations; never used by the production app.
const dates=['2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'];
const fixtures={
    'synthetic-sek-equity':[100,102,101,104,103,105],
    'synthetic-us-equity':[20,21,20.5,22,21.5,23],
    'synthetic-nordnet-equity':[50,51,51,52,53,52],
    'synthetic-fund':[100,101,100.5,102,103,104],
    'synthetic-lysa-fund':[100,100.5,101,101.5,102,102.5],
    'synthetic-certificate':[10,10.5,9,11,12,11.5],
};
const fxFixtures=[10,10.1,10.2,10.15,10.05,10];
const evidence=(day,date)=>({date:day,valuationDate:date,verified:true,source:'synthetic_test',
    ...(day!==date?{carryPolicy:'last_published',calendarVerified:true}:{})});
export function syntheticHistoricalProvider() {
    return {source:'synthetic_test',async price(position,date) {
        const instrument=syntheticCatalog.find(i=>i.instrumentId===position.instrumentId&&i.currency===position.currency);
        if(!instrument)throw new Error('Instrumentet saknar verifierade testkurser. Ingen historik har hittats på.');
        const session=latestCompletedSession(instrument.market==='XNAS'?'USA':'STOCKHOLM',zonedInstant(date,'23:30','Europe/Stockholm'));
        const index=dates.indexOf(session?.date);
        if(index<0)throw new Error(`Historisk ${instrument.assetType==='FUND'?'fond-NAV':'kurs'} saknas för ${date}.`);
        return {...evidence(session.date,date),instrumentId:instrument.instrumentId,currency:instrument.currency,price:fixtures[instrument.instrumentId][index]};
    },async fx(currency,date) {
        const day=[...dates].reverse().find(d=>d<=date);
        if(currency!=='USD'||!day||date>'2026-10-11')throw new Error('Historisk valutakurs saknas.');
        return {...evidence(day,date),from:'USD',to:'SEK',rate:fxFixtures[dates.indexOf(day)]};
    }};
}
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
export function createSyntheticHistoryRuntime(rawAdmin,{staging=false,now}={}) {
    // Explicit adapter selection, never inferred from a URL or an environment file.
    const admin=staging?{
        rpc:(name,args)=>rawAdmin.rpc(name.replaceAll('local_performance','staging_performance').replaceAll('local_history','staging_history').replace('archive_local_market_batch','archive_staging_market_batch'),args),
        from:name=>rawAdmin.from(name.replace('local_performance','staging_performance')),
    }:rawAdmin;
    const provider=syntheticHistoricalProvider();
    const archiveKey=p=>`archive:price:${p.instrumentId}:${p.currency}:${p.date}`;
    const archive={read:async p=>unwrap(await admin.from('local_performance_market_cache').select('observation').eq('cache_key',archiveKey(p)).maybeSingle())?.observation,
        latestPrice:async(instrumentId,currency,date)=>unwrap(await admin.from('local_performance_market_cache').select('observation')
            .like('cache_key',`archive:price:${instrumentId}:${currency}:%`).not('cache_key','like','%:version:%')
            .lte('cache_key',`archive:price:${instrumentId}:${currency}:${date}`).order('cache_key',{ascending:false}).limit(1).maybeSingle())?.observation,
        commitBatch:async points=>unwrap(await admin.rpc('archive_local_market_batch',{p_points:points}))};
    let seeding;
    const seed=()=>{
        if(!seeding)seeding=(async()=>{
            // Explicit dated fixtures only; restarting must retain archived source corrections.
            const points=[];
            for(const instrument of syntheticCatalog)for(const date of dates) {
                const point=await provider.price(instrument,date);
                if(!await archive.read(point))points.push(point);
            }
            if(points.length)await archive.commitBatch(points);
        })().catch(error=>{seeding=null;throw error;});
        return seeding;
    };
    const cache={read:async key=>key.includes(':price:')?undefined:unwrap(await admin.from('local_performance_market_cache').select('observation').eq('cache_key',key).maybeSingle())?.observation,
        write:async(key,point)=>key.includes(':price:')?undefined:unwrap(await admin.from('local_performance_market_cache').upsert({cache_key:key,observation:point},{onConflict:'cache_key',ignoreDuplicates:true}))};
    const archived=createArchivedPortfolioMarket({catalog:syntheticCatalog.map(p=>({...p,identityVerified:true})),archive,fx:provider.fx,
        publicationCalendar:async(_listing,date)=>{const session=tradingSession('STOCKHOLM',date);
            return {verified:session.known,publicationExpected:!session.closed,source:'synthetic_test_calendar'};}});
    const market=sharedHistoricalMarket({source:provider.source,fx:provider.fx,async price(position,date){
        await seed();return archived.price(position,date);
    }},cache);
    const database={input:async userId=>unwrap(await admin.rpc('get_local_performance_worker_input',{p_user_id:userId})),
        publish:async(userId,revision,observations)=>unwrap(await admin.rpc('publish_local_history_batch',{p_user_id:userId,p_revision:revision,p_observations:observations})),
        failure:async(userId,revision,date,reason)=>unwrap(await admin.from('local_performance_runs').upsert({user_id:userId,revision,valuation_date:date,status:'failed',reason},{onConflict:'user_id,revision,valuation_date'}))};
    const publicHistory=staging?null:createPublicDatabaseHistory(admin);
    return {market,database,archive,collect:seed,update:async userId=>{
        const input=await database.input(userId);
        if(input?.baseline?.syntheticPublicDemo===true){
            if(!publicHistory)throw new Error('Only synthetic prices are enabled in staging.');
            return publicHistory.update(userId);
        }
        await seed();return updatePerformanceHistory({userId,database,market,...(now===undefined?{}:{now})});
    }};
}
export function createLocalHistoryRuntime(admin){return createSyntheticHistoryRuntime(admin);}
