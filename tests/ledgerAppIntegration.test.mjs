import test from 'node:test';
import assert from 'node:assert/strict';
import {localPerformanceMode} from '../src/utils/localPerformanceMode.js';
import {ledgerPortfolioHoldings} from '../src/utils/ledgerPortfolioView.js';

test('journal integration defaults off and explicit activation cannot target production',()=>{
    assert.equal(localPerformanceMode({},'https://portfolio.example'),false);
    assert.equal(localPerformanceMode({VITE_PORTFOLIO_PERFORMANCE_READ_ENABLED:'true'},'https://portfolio.example'),false);
    const env={VITE_LOCAL_PERFORMANCE_TEST:'true',VITE_LOCAL_TEST_SUPABASE_URL:'http://127.0.0.1:55321'};
    assert.equal(localPerformanceMode(env,'http://127.0.0.1:55800'),true);
    assert.throws(()=>localPerformanceMode(env,'https://portfolio.example'));
    assert.throws(()=>localPerformanceMode({...env,VITE_LOCAL_TEST_SUPABASE_URL:'https://example.supabase.co'},'http://127.0.0.1:55800'));
    assert.throws(()=>localPerformanceMode({...env,VITE_SUPABASE_URL:'https://example.supabase.co'},'http://127.0.0.1:55800'));
});
const input=()=>({baseline:{},ledgerState:{positions:[{accountId:'a',instrumentId:'stock',currency:'USD',quantity:3}]},
    observations:[{priceSources:[{instrumentId:'stock',currency:'USD',price:100,verified:true,source:'synthetic_test'}],fxSources:[{from:'USD',to:'SEK',rate:10,verified:true,source:'synthetic_test'}]}]});
test('holdings project journal quantities with historical FX, without inventing GAV or mutating input',()=>{
    const source=input(),before=structuredClone(source);const groups=ledgerPortfolioHoldings(source);
    assert.equal(groups[0].totalValue,3000);assert.equal(groups[0].positions[0].quantity,3);
    assert.equal(groups[0].positions[0].averagePrice,null);assert.equal(groups[0].positions[0].averagePriceSek,null);
    assert.equal(groups[0].positions[0].quoteStale,true);assert.deepEqual(source,before);
});
test('missing historical FX or price never becomes a zero or native-currency SEK valuation',()=>{
    const source=input();source.observations[0].fxSources=[];
    let group=ledgerPortfolioHoldings(source)[0];assert.equal(group.valueUnavailable,true);assert.equal(group.positions[0].currentValueSek,null);
    source.observations[0].priceSources=[];group=ledgerPortfolioHoldings(source)[0];assert.equal(group.valueUnavailable,true);
    assert.equal(group.positions[0].currentPrice,null);
    for(const bad of [0,-1,'10',NaN]) {
        const invalid=input();invalid.observations[0].fxSources[0].rate=bad;
        assert.equal(ledgerPortfolioHoldings(invalid)[0].valueUnavailable,true);
    }
    const unverified=input();unverified.observations[0].priceSources[0].verified=false;
    assert.equal(ledgerPortfolioHoldings(unverified)[0].valueUnavailable,true);
});
test('public price observations can remain display data while return observations are invalidated',()=>{
    const source=input();source.displayPriceSources=source.observations[0].priceSources;source.displayFxSources=source.observations[0].fxSources;source.observations=[];
    assert.equal(ledgerPortfolioHoldings(source)[0].totalValue,3000);assert.deepEqual(source.observations,[]);
});
