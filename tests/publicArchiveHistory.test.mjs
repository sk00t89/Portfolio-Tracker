import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createPublicMarketArchive} from '../scripts/publicMarketArchive.mjs';
import {createArchivedPortfolioMarket} from '../supabase/functions/_shared/archivedPortfolioMarket.js';
import {updatePerformanceHistory} from '../supabase/functions/_shared/performanceHistoryWorker.js';
import {reviewedFundPublicationCalendar,reviewedPublicFundRules} from '../supabase/functions/_shared/fundPublicationCalendar.js';
const fund={instrumentId:'test-fund',isin:'SE0000000010',currency:'SEK',assetType:'FUND',identityVerified:true};
const fx={instrumentId:'test-fx',isin:'ECB:USDSEK',currency:'USD',assetType:'FX',identityVerified:true};
const point=(date,price)=>({...fund,date,price,verified:true,source:'synthetic_test',collectedAt:'2026-10-10T12:00:00Z'});
const root=resolve('supabase-test/.archive-tests.local');
const fixture=async()=>{await mkdir(root,{recursive:true});return mkdtemp(join(root,'history-'));};
const cleanup=async dir=>{assert.ok(resolve(dir).startsWith(root+sep));await rm(dir,{recursive:true,force:true});};
test('durable public archive retains original dates, source versions and FX corrections; invalid batch is atomic and restart idempotent',async()=>{
    const dir=await fixture();
    try{
        const options={path:join(dir,'market.local'),catalog:[fund,fx]},archive=createPublicMarketArchive(options);
        assert.equal((await archive.commitBatch([point('2026-10-06',100)])).inserted,1);
        assert.equal((await createPublicMarketArchive(options).commitBatch([point('2026-10-06',100)])).unchanged,1);
        const before=await archive.snapshot();
        await assert.rejects(archive.commitBatch([point('2026-10-06',101),point('2026-10-07',NaN)]));assert.deepEqual(await archive.snapshot(),before);
        assert.equal((await archive.commitBatch([point('2026-10-06',101)])).corrected,1);
        assert.equal(Object.values((await archive.snapshot()).versions)[0]&&Object.keys(Object.values((await archive.snapshot()).versions)[0]).length,2);
        const rate={...fx,from:'USD',to:'SEK',date:'2026-10-06',rate:10,verified:true,source:'synthetic_test',collectedAt:'2026-10-10T12:00:00Z'};
        await archive.commitBatch([rate]);assert.equal((await archive.commitBatch([{...rate,rate:10.1}])).corrected,1);
        assert.equal((await archive.latestPrice(fx.instrumentId,'USD','2026-10-07')).rate,10.1);
    }finally{await cleanup(dir);}
});
test('late NAV preserves complete days, stops before the gap, retries after arrival and retains old revision after source correction',async()=>{
    const dir=await fixture();
    try{
        const input={revision:0,baseline:{source:'synthetic_test',verified:true,coverage:'complete',date:'2026-10-04',valueSek:1100,
            positions:[{accountId:'a',instrumentId:fund.instrumentId,currency:'SEK',quantity:10}],cash:[{accountId:'a',currency:'SEK',amount:100}]},events:[],observations:[],cashFlowCoverage:'complete',costCoverage:'complete'};
        const old=[],failures=[];
        const archive=createPublicMarketArchive({path:join(dir,'market.local'),catalog:[fund],onCorrection:async()=>{old.push(structuredClone(input));input.revision++;input.observations=[];}});
        await archive.commitBatch(['05','06','07','09'].map((d,i)=>point(`2026-10-${d}`,101+i)));
        const market={...createArchivedPortfolioMarket({catalog:[fund],archive}),source:'synthetic_test',archiveRevision:async()=>(await archive.snapshot()).revision};
        const database={input:async()=>input,publish:async(_u,r,rows)=>{assert.equal(r,input.revision);input.observations.push(...rows);},failure:async(...args)=>failures.push(args)};
        const run=()=>updatePerformanceHistory({userId:'synthetic',database,market,now:Date.parse('2026-10-10T12:00:00Z')});
        await assert.rejects(run());assert.deepEqual(input.observations.map(o=>o.date),['2026-10-05','2026-10-06','2026-10-07']);assert.equal(failures.length,1);
        await archive.commitBatch([point('2026-10-08',103.5)]);assert.equal((await run()).published,2);assert.equal((await run()).published,0);
        await archive.commitBatch([point('2026-10-06',105)]);assert.equal(old[0].observations.length,5);assert.equal(input.revision,1);
        assert.equal((await run()).published,5);assert.equal(input.observations[1].valueSek,1150);assert.notEqual(input.observations[1].valueSek,old[0].observations[1].valueSek);
    }finally{await cleanup(dir);}
});
test('source revision changed during valuation cannot publish a mixed return series',async()=>{
    let revision=0,published=0;
    const input={revision:0,baseline:{date:'2026-10-04',source:'synthetic_test',verified:true,coverage:'complete',valueSek:110,
        positions:[{accountId:'a',instrumentId:'s',currency:'SEK',quantity:1}],cash:[{accountId:'a',currency:'SEK',amount:10}]},events:[],observations:[],cashFlowCoverage:'complete',costCoverage:'complete'};
    await assert.rejects(updatePerformanceHistory({userId:'synthetic',now:Date.parse('2026-10-06T12:00:00Z'),
        database:{input:async()=>input,publish:async()=>published++,failure:async()=>{}},
        market:{source:'synthetic_test',archiveRevision:async()=>revision,price:async(_p,date)=>{revision++;return {instrumentId:'s',currency:'SEK',date,price:100,source:'synthetic_test',verified:true};}}}),/rättats/);
    assert.equal(published,0);
});
test('issuer-reviewed fund bank-day rule permits weekend carry but never excuses a missing weekday NAV or unknown class',async()=>{
    const calendar=reviewedFundPublicationCalendar(reviewedPublicFundRules),listing={isin:'SE0001718388',currency:'SEK'};
    assert.equal((await calendar(listing,'2026-10-10')).publicationExpected,false);
    const monday=await calendar(listing,'2026-10-12');assert.equal(monday.publicationExpected,true);assert.equal(monday.maxPublicationDelayBankDays,2);
    assert.equal((await calendar({...listing,isin:'unreviewed'},'2026-10-10')).verified,false);
    assert.equal((await calendar(listing,'2027-01-04')).verified,false);
});
