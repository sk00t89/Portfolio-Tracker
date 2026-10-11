import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerCostBasis} from '../src/utils/ledgerCostBasis.js';
import {ledgerPortfolioHoldings} from '../src/utils/ledgerPortfolioView.js';
const baseline=(extra={})=>({date:'2026-10-04',positions:[{accountId:'a',instrumentId:'s',currency:'SEK',quantity:10,averagePrice:80,...extra}]});
const trade=(kind,quantity,amount,sequence=1,extra={})=>({id:`e${sequence}`,date:'2026-10-05',sequence,source:'synthetic_test',verified:true,
    accountId:'a',instrumentId:'s',currency:'SEK',kind,quantity,amount,fee:{amount:10,currency:'SEK'},...extra});
const result=(b,events)=>ledgerCostBasis(b,events).get('["a","s"]');
test('buy includes commission, partial sale preserves GAV, sale commission does not change remaining cost',()=>{
    const b=baseline(),events=[trade('BUY',10,1200),trade('SELL',5,750,2,{fee:{amount:25,currency:'SEK'}})];
    const before=structuredClone({b,events});
    const row=result(b,events);assert.equal(row.quantity,15);assert.equal(row.nativeCost,1507.5);
    assert.equal(row.averagePrice,100.5);assert.equal(row.averagePriceSek,100.5);assert.deepEqual({b,events},before);
    const view=ledgerPortfolioHoldings({baseline:b,events,observations:[],ledgerState:{positions:[{accountId:'a',instrumentId:'s',currency:'SEK',quantity:15}]}});
    assert.equal(view[0].positions[0].averagePriceSek,100.5);
});
test('unknown opening GAV stays unknown until a full sale and subsequent new purchase',()=>{
    const b=baseline({averagePrice:null});
    assert.equal(result(b,[trade('BUY',1,100)]).averagePrice,null);
    assert.equal(result(b,[trade('SELL',1,100)]).averagePrice,null);
    assert.equal(result(b,[trade('SELL',10,1000),trade('BUY',2,240,2)]).averagePriceSek,125);
});
test('foreign native GAV is computable but valuation FX must never be substituted for acquisition FX',()=>{
    const b=baseline({currency:'USD',averagePrice:10,averagePriceSek:90});
    const sell=trade('SELL',5,100,1,{currency:'USD',fee:{amount:1,currency:'USD'}});
    assert.equal(result(b,[sell]).averagePriceSek,90);
    const buy=trade('BUY',5,100,2,{currency:'USD',fee:{amount:1,currency:'USD'},fxRateToSek:11});
    assert.equal(result(b,[sell,buy]).averagePrice,15.1);assert.equal(result(b,[sell,buy]).averagePriceSek,null);
    const crossFee=trade('BUY',1,20,1,{currency:'USD',fee:{amount:10,currency:'SEK'}});
    assert.equal(result(b,[crossFee]).averagePrice,null);
});
test('backdated corrected events replay chronologically and invalid/duplicate histories cannot produce GAV',()=>{
    const b=baseline(),buy=trade('BUY',10,1200,2),sell=trade('SELL',5,750,1,{date:'2026-10-06'});
    assert.equal(result(b,[sell,buy]).averagePrice,100.5);
    assert.equal(result(b,[sell,{...buy,amount:1000}]).averagePrice,90.5);
    assert.throws(()=>result(b,[buy,buy]));assert.throws(()=>result(b,[trade('SELL',11,1100)]));
    assert.throws(()=>result(b,[{...buy,verified:false}]));
    const view=ledgerPortfolioHoldings({baseline:b,events:[buy],observations:[],displayCostInvalidated:true,
        ledgerState:{positions:[{accountId:'a',instrumentId:'s',currency:'SEK',quantity:20}]}});
    assert.equal(view[0].positions[0].averagePriceSek,null);
});
