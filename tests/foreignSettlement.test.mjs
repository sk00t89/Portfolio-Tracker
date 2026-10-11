import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLedgerTradeDraft} from '../src/utils/ledgerTradeDraft.js';
import {ledgerCostBasis} from '../src/utils/ledgerCostBasis.js';
import {replayPerformanceLedger} from '../src/utils/performanceLedger.js';
const position={accountId:'a',instrumentId:'s',currency:'USD'};
const baseline={verified:true,coverage:'complete',source:'synthetic_test',date:'2026-10-04',positions:[{...position,quantity:10,averagePrice:10,averagePriceSek:90}],cash:[{accountId:'a',currency:'USD',amount:100},{accountId:'a',currency:'SEK',amount:1000}]};
const buy={...position,id:'buy',kind:'BUY',date:'2026-10-05',sequence:1,source:'synthetic_test',verified:true,quantity:2,amount:40,fee:{amount:1,currency:'USD'},settlement:'broker_conversion',settlementAmountSek:215};
const fx={id:'fx',tradeId:'buy',kind:'FX',accountId:'a',date:buy.date,sequence:0,source:'synthetic_test',verified:true,currency:'SEK',amount:215,toCurrency:'USD',toAmount:41,fee:{amount:0,currency:'SEK'},settlementEvidence:'broker_actual_amount'};
test('automatic conversion requires actual positive SEK total; native-cash trades do not need a reference FX',()=>{
    const draft={position,kind:'BUY',quantity:2,price:20,date:buy.date,feeAmount:1,funding:'existing_cash'};
    assert.equal(prepareLedgerTradeDraft(draft).settlementAmountSek,undefined);
    assert.throws(()=>prepareLedgerTradeDraft({...draft,settlement:'broker_conversion'}));
    assert.throws(()=>prepareLedgerTradeDraft({...draft,settlement:'broker_conversion',settlementAmountSek:215,funding:'external_money'}));
    assert.equal(prepareLedgerTradeDraft({...draft,settlement:'broker_conversion',settlementAmountSek:215}).settlementAmountSek,215);
});
test('linked actual broker conversion updates SEK GAV and cash without an external capital flow',()=>{
    const events=[fx,buy],state=replayPerformanceLedger(baseline,events,buy.date);
    assert.equal(state.cash.find(c=>c.currency==='USD').amount,100);assert.equal(state.cash.find(c=>c.currency==='SEK').amount,785);
    assert.deepEqual(state.externalFlows,[]);
    const cost=ledgerCostBasis(baseline,events).get('["a","s"]');assert.equal(cost.averagePrice,141/12);assert.equal(cost.averagePriceSek,1115/12);
    const sell={...buy,id:'sell',kind:'SELL',date:'2026-10-06',sequence:0,quantity:3,amount:75,fee:{amount:2,currency:'USD'},settlementAmountSek:800};
    const converted={...fx,id:'fx-sell',tradeId:'sell',date:sell.date,sequence:1,currency:'USD',amount:73,toCurrency:'SEK',toAmount:800};
    const after=replayPerformanceLedger(baseline,[...events,sell,converted],sell.date);
    assert.equal(after.cash.find(c=>c.currency==='SEK').amount,1585);assert.equal(after.cash.find(c=>c.currency==='USD').amount,100);
    assert.equal(ledgerCostBasis(baseline,[...events,sell,converted]).get('["a","s"]').averagePriceSek,1115/12);
});
test('mismatched, missing or unlinked FX never certifies SEK acquisition cost',()=>{
    for(const change of [{tradeId:'other'},{amount:216},{toAmount:40},{accountId:'b'},{sequence:2},{settlementEvidence:'ecb'}])
        assert.equal(ledgerCostBasis(baseline,[{...fx,...change},buy]).get('["a","s"]').averagePriceSek,null);
    assert.equal(ledgerCostBasis(baseline,[buy]).get('["a","s"]').averagePriceSek,null);
});
test('actual fractional native settlement tolerates binary arithmetic without substituting a reference rate',()=>{
    const small={...buy,amount:0.1,quantity:1,fee:{amount:0.2,currency:'USD'},settlementAmountSek:3};
    const conversion={...fx,amount:3,toAmount:0.3};
    assert.equal(ledgerCostBasis(baseline,[conversion,small]).get('["a","s"]').averagePriceSek,903/11);
});
test('SEK commission is included once in actual conversion and acquisition cost, and leaves native fee basis unknown',()=>{
    const purchase={...buy,fee:{amount:5,currency:'SEK'},settlementAmountSek:215};
    const conversion={...fx,amount:210,toAmount:40};
    const state=replayPerformanceLedger(baseline,[conversion,purchase],buy.date);
    assert.equal(state.cash.find(c=>c.currency==='SEK').amount,785);assert.equal(state.cash.find(c=>c.currency==='USD').amount,100);
    const cost=ledgerCostBasis(baseline,[conversion,purchase]).get('["a","s"]');assert.equal(cost.averagePriceSek,1115/12);assert.equal(cost.averagePrice,null);
    const sale={...purchase,id:'sale',kind:'SELL',date:'2026-10-06',sequence:0,quantity:1,amount:20,settlementAmountSek:200};
    const exchange={...fx,id:'sell-fx',tradeId:'sale',date:sale.date,sequence:1,currency:'USD',amount:20,toCurrency:'SEK',toAmount:205};
    const after=replayPerformanceLedger(baseline,[conversion,purchase,sale,exchange],sale.date);
    assert.equal(after.cash.find(c=>c.currency==='SEK').amount,985);assert.equal(after.cash.find(c=>c.currency==='USD').amount,100);
});
