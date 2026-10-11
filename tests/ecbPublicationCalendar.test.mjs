import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedEcbReferenceDate} from '../supabase/functions/_shared/ecbPublicationCalendar.js';
import {createHistoricalPortfolioMarket} from '../supabase/functions/_shared/historicalPortfolioMarket.js';
test('ECB follows TARGET closures independently from USA and Stockholm holidays; unknown years fail closed',()=>{
    assert.equal(expectedEcbReferenceDate('2026-10-11'),'2026-10-09');
    assert.equal(expectedEcbReferenceDate('2026-04-06'),'2026-04-02');
    assert.equal(expectedEcbReferenceDate('2026-07-03'),'2026-07-03');
    assert.equal(expectedEcbReferenceDate('2026-12-31'),'2026-12-31');
    assert.throws(()=>expectedEcbReferenceDate('2028-01-04'));
});
test('missing weekday FX is rejected; calendar-approved weekend carry preserves actual source date',async()=>{
    const market=createHistoricalPortfolioMarket({catalog:[],fetcher:async()=>({ok:true,json:async()=>[{base:'USD',quote:'SEK',date:'2026-10-09',rate:10,
        providers:[{key:'ECB',date:'2026-10-09',rate:10}]}]})});
    const weekend=await market.fx('USD','2026-10-11');assert.equal(weekend.date,'2026-10-09');assert.equal(weekend.calendarVerified,true);
    await assert.rejects(()=>market.fx('USD','2026-10-12'),/Förväntad/);
});
