import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPublishedMarket} from '../supabase/functions/_shared/publishedMarketCollector.js';
import {createArchivedPortfolioMarket} from '../supabase/functions/_shared/archivedPortfolioMarket.js';
const stock={instrumentId:'synthetic-stock',isin:'SE0000000010',currency:'SEK',assetType:'STOCK',market:'XSTO',identityVerified:true};
const fund={...stock,instrumentId:'synthetic-fund',assetType:'FUND'};
const etp={...stock,instrumentId:'synthetic-etp',assetType:'CERTIFICATE'};
const option={...stock,instrumentId:'synthetic-option',assetType:'SUBSCRIPTION_OPTION',lifecycleVerified:true,reviewRequiredFrom:'2027-05-10'};
const now=Date.parse('2026-10-10T12:00:00Z');
test('service collection uses native dated fund NAV and actual certificate close, shares duplicate instruments and records failed sources',async()=>{
    let requests=0,batch;
    const result=await collectPublishedMarket({catalog:[stock,fund,etp,option,stock,{...stock,instrumentId:'unknown',identityVerified:false}],now,
        provider:{fund:async p=>{requests++;return {isin:p.isin,currency:'SEK',price:100,date:'2026-10-08',kind:'published_nav',provider:'Avanza'};},
            close:async(p,session)=>{requests++;assert.equal(session.date,'2026-10-09');if(p.assetType==='SUBSCRIPTION_OPTION')assert.equal(p.productType,'ETP');
                return {currency:'SEK',price:10,date:session.date,kind:'session_close',provider:'Avanza',sourceMetadata:{provenance:'broker_latest_after_close'}};}},
        archive:{commitBatch:async points=>{batch=points;return {inserted:points.length};}}});
    assert.equal(requests,4);assert.equal(batch.length,4);assert.equal(result.failures[0].reason,'instrument_identity_unverified');
    assert.equal(batch.find(p=>p.instrumentId===fund.instrumentId).date,'2026-10-08');
    assert.equal(batch.find(p=>p.instrumentId===etp.instrumentId).sourceMetadata.provenance,'broker_latest_after_close');
});
test('archived valuation keeps real source date on weekends, rejects missing open-session quotes and missing fund publications',async()=>{
    const archive={latestPrice:async id=>({instrumentId:id,currency:'SEK',date:'2026-10-09',price:100,verified:true,source:'synthetic_test'})};
    const market=createArchivedPortfolioMarket({catalog:[stock,fund,etp],archive,publicationCalendar:async()=>({verified:true,publicationExpected:false,source:'synthetic_calendar'})});
    const point=await market.price(etp,'2026-10-11');assert.equal(point.date,'2026-10-09');assert.equal(point.valuationDate,'2026-10-11');assert.equal(point.carryPolicy,'last_published');
    await assert.rejects(()=>market.price(etp,'2026-10-12'),/produktkurs/);
    assert.equal((await market.price(fund,'2026-10-11')).price,100);
    const missing=createArchivedPortfolioMarket({catalog:[fund],archive,publicationCalendar:async()=>({verified:true,publicationExpected:true,source:'synthetic_calendar'})});
    await assert.rejects(()=>missing.price(fund,'2026-10-11'),/inte verifierats/);
});
test('option lifecycle stops valuations at review boundary; unsupported types, future dates, wrong currencies and nonnumeric quotes fail closed',async()=>{
    const archive={latestPrice:async id=>({instrumentId:id,currency:'SEK',date:'2027-05-10',price:1,verified:true,source:'synthetic_test'})};
    await assert.rejects(()=>createArchivedPortfolioMarket({catalog:[option],archive}).price(option,'2027-05-10'),/bolagshändelse/);
    const result=await collectPublishedMarket({catalog:[{...option,lifecycleVerified:false}],now,provider:{close:()=>assert.fail()},archive:{commitBatch:()=>assert.fail()}});
    assert.equal(result.failures[0].reason,'corporate_action_review_required');
    for(const patch of [{currency:'USD'},{date:'2026-10-12'},{price:'100'},{price:Infinity},{instrumentId:'OTHER'}]) {
        const invalid={latestPrice:async()=>({instrumentId:etp.instrumentId,currency:'SEK',date:'2026-10-09',price:100,verified:true,source:'synthetic_test',...patch})};
        await assert.rejects(()=>createArchivedPortfolioMarket({catalog:[etp],archive:invalid}).price(etp,'2026-10-09'));
    }
});
