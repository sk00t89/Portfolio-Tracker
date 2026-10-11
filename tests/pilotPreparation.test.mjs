import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoricalNavSeries} from '../supabase/functions/_shared/historicalNavSeries.js';
import {createHistoricalPortfolioMarket} from '../supabase/functions/_shared/historicalPortfolioMarket.js';
import {importReconciliationSummary} from '../src/utils/importReconciliationSummary.js';
import parseNordnetCsv from '../src/parsers/parseNordnetCsv.js';
import {collectPublishedFundNav} from '../supabase/functions/_shared/publishedFundCollector.js';
const fund={instrumentId:'synthetic-fund',isin:'SE0000000036',currency:'SEK',assetType:'FUND',identityVerified:true};
const archive=()=>({...fund,reviewed:true,source:'synthetic_archive',sourceUrl:'https://synthetic.invalid/nav',contentSha256:'a'.repeat(64),
    points:[{date:'2026-10-02',price:100},{date:'2026-10-05',price:101}]});
const calendar=async(_,date)=>({verified:true,publicationExpected:![0,6].includes(new Date(date).getUTCDay()),source:'synthetic_calendar'});
test('reviewed historical NAV keeps real source date on a certified holiday and blocks missing expected NAV',async()=>{
    const historicalNav=createHistoricalNavSeries({catalog:[fund],series:[archive()],publicationCalendar:calendar});
    const market=createHistoricalPortfolioMarket({catalog:[fund],historicalNav});
    const point=await market.price(fund,'2026-10-04');assert.equal(point.date,'2026-10-02');assert.equal(point.valuationDate,'2026-10-04');
    assert.equal(point.price,100);assert.equal(point.contentSha256,'a'.repeat(64));assert.equal(point.carryPolicy,'last_published');
    assert.equal((await market.price(fund,'2026-10-05')).price,101);
    await assert.rejects(()=>market.price(fund,'2026-10-06'),/förväntad fondkurs/);
    await assert.rejects(()=>market.price(fund,'2026-10-01'),/saknas/);
    const unknown=createHistoricalNavSeries({catalog:[fund],series:[archive()]});
    await assert.rejects(()=>unknown(fund,'2026-10-04'),/förväntad fondkurs/);
});
test('NAV rejects unreviewed archives, wrong share classes, duplicates, invalid prices and mutated source input',async()=>{
    for(const patch of [{reviewed:false},{isin:'SE9999999999'},{currency:'USD'},{contentSha256:null},
        {points:[{date:'2026-10-02',price:'100'}]},{points:[{date:'2026-10-02',price:Infinity}]},
        {points:[{date:'2026-10-02',price:100},{date:'2026-10-02',price:101}]}])
        assert.throws(()=>createHistoricalNavSeries({catalog:[fund],series:[{...archive(),...patch}]}));
    const source=archive(),nav=createHistoricalNavSeries({catalog:[fund],series:[source]});source.points[0].price=1;
    assert.equal((await nav(fund,'2026-10-02')).price,100);
    await assert.rejects(()=>nav({...fund,isin:'OTHER'},'2026-10-02'));
});
test('subscription options cannot be treated as ordinary equity history; untyped/string fund prices fail closed',async()=>{
    const option={...fund,assetType:'SUBSCRIPTION_OPTION'};
    const market=createHistoricalPortfolioMarket({catalog:[option],fetcher:()=>assert.fail('unsupported option must not fetch equity price')});
    await assert.rejects(()=>market.price(option,'2026-10-05'),/Instrumenttypen/);
    for(const price of ['100',Infinity]) {
        const invalid=createHistoricalPortfolioMarket({catalog:[fund],historicalNav:async()=>({...fund,date:'2026-10-05',price,verified:true,source:'synthetic'})});
        await assert.rejects(()=>invalid.price(fund,'2026-10-05'));
    }
});
test('Nordnet SEK GAV remains known, foreign GAV stays separate, reconciliation separates cash and unknown cost',()=>{
    // Same eleven-column layout as the supplied export, entirely fictional rows.
    const text='Namn\tValuta\tAntal\tGAV\tIdag %\tSenaste kurs\tBelåningsv. SEK\tVärde\tVärde SEK\tAvkast. %\tAvkast. SEK\nTest A\tSEK\t3\t80\t0\t100\t0\t300\t300\t25\t60\nTest B\tUSD\t2\t10\t0\t20\t0\t40\t400\t100\t200';
    const rows=parseNordnetCsv(text);assert.equal(rows[0].averagePriceSek,80);assert.equal(rows[1].averagePriceSek,null);
    const plan={kind:'opening',positions:rows.map((p,i)=>({...p,accountId:'test-account',instrumentId:`test-${i}`})),cash:[{accountId:'test-account',currency:'SEK',amount:0}]};
    const summary=importReconciliationSummary(plan);assert.equal(summary[0].missingCost,1);assert.equal(summary[0].cash[0].amount,0);
    assert.equal(summary[0].positions.length,2);assert.equal(importReconciliationSummary({kind:'transactions'}).length,0);
});
test('forward NAV collector shares sources across accounts, retains actual NAV date and isolates failed sources',async()=>{
    let calls=0,saved=[];
    const failed={...fund,instrumentId:'missing-fund',isin:'SE0000000044'};
    const result=await collectPublishedFundNav({catalog:[fund,{...fund,accountId:'other-account'},failed,{...fund,identityVerified:false,instrumentId:'unverified'}],
        now:Date.parse('2026-10-10T12:00:00Z'),provider:{fund:async listing=>{
            calls++;if(listing.instrumentId===failed.instrumentId)throw new Error('missing');
            return {isin:fund.isin,currency:'SEK',date:'2026-10-08',price:100,kind:'published_nav',provider:'Avanza'};
        }},archive:{commitBatch:async points=>{saved=points;return {inserted:1,unchanged:0,corrected:0};}}});
    assert.equal(calls,2);assert.equal(saved.length,1);assert.equal(saved[0].date,'2026-10-08');
    assert.equal(saved[0].collectedAt,'2026-10-10T12:00:00.000Z');assert.equal(result.failures.length,2);
    assert.equal(result.portfolioPublicationAllowed,false);
});
test('forward NAV collection rejects mismatched or future source data and propagates archive transaction failures',async()=>{
    for(const patch of [{date:'2026-10-11'},{isin:'OTHER'},{currency:'USD'},{price:'100'},{date:'2026-09-01'}]) {
        const result=await collectPublishedFundNav({catalog:[fund],now:Date.parse('2026-10-10T12:00:00Z'),
            provider:{fund:async()=>({isin:fund.isin,currency:'SEK',date:'2026-10-09',price:100,kind:'published_nav',provider:'Avanza',...patch})},
            archive:{commitBatch:async()=>assert.fail('invalid quote must never be archived')}});
        assert.equal(result.points.length,0);assert.equal(result.failures.length,1);
    }
    await assert.rejects(()=>collectPublishedFundNav({catalog:[fund],now:Date.parse('2026-10-10T12:00:00Z'),
        provider:{fund:async()=>({isin:fund.isin,currency:'SEK',date:'2026-10-09',price:100,kind:'published_nav',provider:'Avanza'})},
        archive:{commitBatch:async()=>{throw new Error('atomic archive commit failed');}}}),/atomic archive commit failed/);
});
