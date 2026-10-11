import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPerformanceSecurity,reviewPerformanceSql} from '../scripts/auditLocalPerformanceSecurity.mjs';

const expected={tables:['portfolio_ledger_events','local_performance_market_cache'],
    functions:['get_portfolio_performance_input','publish_local_public_history']};
function fixture(){
    return {marker:'true',tables:expected.tables.map(name=>({name,rls:true,anonPrivileges:false,
        authWrites:false,authSelect:name!=='local_performance_market_cache',ownerCanBypass:true,serviceWrites:true,
        policies:name==='local_performance_market_cache'?[]:[{command:'r',roles:['authenticated'],qual:'(( SELECT auth.uid() AS uid) = user_id)'}]})),
    functions:expected.functions.map(name=>({name,config:['search_path=""'],definer:name!=='get_portfolio_performance_input',
        publicExecute:false,anonExecute:false,authExecute:name==='get_portfolio_performance_input',serviceExecute:true,ownerCanBypass:true}))};
}

test('audit accepts reviewed local owner-read and service-only publication grants',()=>{
    assert.deepEqual(assertPerformanceSecurity(fixture(),expected),{tables:2,functions:2});
    const direct=fixture();direct.tables[0].policies[0].qual='(auth.uid() = user_id)';
    assert.doesNotThrow(()=>assertPerformanceSecurity(direct,expected));
});
test('audit rejects policy broadening, role leaks and altered RPC execution modes',()=>{
    const cases=[
        r=>{r.marker='false';},r=>{r.tables[0].rls=false;},r=>{r.tables[0].authWrites=true;},
        r=>{r.tables[0].policies[0].qual='(auth.uid() = user_id OR true)';},
        r=>{r.tables[0].policies[0].roles=['public'];},r=>{r.tables[1].authSelect=true;},
        r=>{r.functions[0].definer=true;},r=>{r.functions[1].publicExecute=true;},
        r=>{r.functions[1].authExecute=true;},r=>{r.functions[1].serviceExecute=false;},
        r=>{r.functions[1].config=['search_path=public'];},r=>{r.functions.push({...r.functions[1]});},
        r=>{r.tables.pop();},r=>{r.functions[1].ownerCanBypass=false;},
    ];
    for(const mutate of cases){const report=fixture();mutate(report);assert.throws(()=>assertPerformanceSecurity(report,expected));}
});
test('SQL review fingerprints only the six guarded local proposal/runtime artifacts',()=>{
    const review=reviewPerformanceSql();
    assert.equal(review.artifacts.length,6);assert.equal(review.tables.length,7);assert.equal(review.functions.length,17);
    assert.ok(review.artifacts.every(a=>/^[a-f0-9]{64}$/.test(a.sha256)));
});
