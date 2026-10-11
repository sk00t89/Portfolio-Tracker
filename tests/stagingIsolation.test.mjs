import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGING_URL,STAGING_REF,TABLES,stagingFetch,assertUserToken,denied,fixture,assertDisposableUser,verifyIsolation} from '../scripts/stagingIsolation.mjs';

test('staging transport rejects other projects and redirects without contacting them',async()=>{
    const calls=[];const request=stagingFetch(async(...args)=>{calls.push(args);return {ok:true};});
    assert.throws(()=>request('https://another-project.supabase.co/rest/v1/test'));
    assert.throws(()=>request('https://127.0.0.1/rest/v1/test'));
    assert.throws(()=>request('https://user:pass@vutjthqlgzokeylaxpzp.supabase.co/rest/v1/test'));
    assert.equal(calls.length,0);
    await request(`${STAGING_URL}/rest/v1/test`,{redirect:'follow'});
    assert.equal(calls[0][1].redirect,'error');
});
test('test tokens must name the staging issuer, authenticated role and correct owner',()=>{
    const token=claims=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    const good={iss:`${STAGING_URL}/auth/v1`,sub:'owner-a',role:'authenticated'};
    assertUserToken(token(good),'owner-a');
    for(const change of [{iss:'https://another.supabase.co/auth/v1'},{sub:'owner-b'},{role:'service_role'}])
        assert.throws(()=>assertUserToken(token({...good,...change}),'owner-a'));
});
test('denial requires insufficient privilege, not a constraint or network error',async()=>{
    await denied(Promise.resolve({error:{code:'42501'}}));
    for(const error of [null,{code:'23505'},{code:'23503'},{code:'PGRST301'},{code:'500'}])
        await assert.rejects(denied(Promise.resolve({error})));
});
test('cleanup identity check rejects unmarked users, changed email and wrong IDs',()=>{
    const receipt={projectRef:STAGING_REF,runId:'test-run'};
    const entry={id:'test-a',email:'test-a@portfolio-test.invalid'};
    const user={...entry,app_metadata:{portfolio_isolation_run:receipt.runId}};
    assertDisposableUser(user,receipt,entry);
    for(const change of [{id:'other'},{email:'real@example.com'},{app_metadata:{}},{app_metadata:{portfolio_isolation_run:'other-run'}}])
        assert.throws(()=>assertDisposableUser({...user,...change},receipt,entry));
});
test('fixtures have distinct markers, valid journal values and matching observation revision',()=>{
    const a=fixture('a','run','a'),b=fixture('b','run','b');
    assert.notEqual(a.marker,b.marker);assert.notEqual(a.event.event_id,b.event.event_id);
    assert.equal(a.baseline.baseline.synthetic,true);
    assert.equal(a.event.event.marker,a.marker);assert.equal(a.observation.observation.marker,a.marker);
    assert.equal(a.event.sequence,1);assert.equal(a.observation.revision,1);
});

// Test the harness against deliberately faulty API responses, not Supabase RLS.
function fakeScenario(fault){
    const users=['a','b'].map(id=>({id,fixture:fixture(id,'offline-test',id)}));
    const writes=[];
    function client(id){return {
        from(table){
            let filter=null,write=false;
            const q={select(){return q;},eq(_,value){filter=value;return q;},in(){return q;},order(){return q;},
                insert(){write=true;return q;},upsert(){write=true;return q;},update(){write=true;return q;},delete(){write=true;return q;},
                then(resolve,reject){
                    let result;
                    if(write){writes.push({id,table});result={error:{code:'42501'}};}
                    else if(id==='anon')result={error:{code:'42501'}};
                    else {
                        const visible=users.filter(u=>(id==='admin'||u.id===id||(fault==='table-leak'&&id==='a'))&&(!filter||u.id===filter));
                        const key=['baseline','event','observation'][TABLES.indexOf(table)];
                        result={data:visible.map(u=>({...u.fixture[key],...(key==='baseline'?{revision:1}:{})})),error:null};
                    }
                    return Promise.resolve(result).then(resolve,reject);
                }};
            return q;
        },
        async rpc(name,args={}){
            if(name!=='get_portfolio_performance_input'||Object.keys(args).length)
                return fault==='internal-route'&&name==='invalidate_performance_coverage'?{data:{},error:null}:{error:{code:'PGRST202'}};
            if(id==='anon')return {error:{code:'42501'}};
            const u=users.find(u=>u.id===id),other=users.find(u=>u.id!==id);
            return {data:{baseline:u.fixture.baseline.baseline,revision:1,events:[u.fixture.event.event],observations:[u.fixture.observation.observation],
                ...(fault==='rpc-leak'?{foreign:other.fixture.marker}:{})},error:null};
        },
    };}
    for(const u of users)u.client=client(u.id);
    return {admin:client('admin'),anon:client('anon'),users,writes};
}
test('harness covers both owners and all 72 denied writes without real API calls',async()=>{
    const scenario=fakeScenario();const result=await verifyIsolation(scenario);
    assert.equal(result.writeAttempts,72);assert.equal(scenario.writes.length,72);
});
test('harness fails for table leakage, RPC leakage and an accessible internal route',async()=>{
    for(const fault of ['table-leak','rpc-leak','internal-route'])
        await assert.rejects(verifyIsolation(fakeScenario(fault)));
});
