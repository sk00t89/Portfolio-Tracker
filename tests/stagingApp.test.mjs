import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStagingAppServer,assertStagingServerEnvironment} from '../scripts/stagingAppServer.mjs';
import {assertStagingConfiguration,createStagingTransports,STAGING_URL,STAGING_REF} from '../src/services/stagingPortfolioClient.js';
import {buildStagingRuntimeDraft,draftPath} from '../scripts/buildStagingRuntimeDraft.mjs';
import {syntheticFiles,syntheticImportAnswers} from '../scripts/syntheticPortfolioFixtures.mjs';
import {syntheticHistoricalProvider} from '../scripts/localHistoryRuntime.mjs';

const identity={environment:'portfolio-performance-staging',projectRef:STAGING_REF,syntheticOnly:true,runtimeVersion:'staging-runtime-v1'};
const env={VITE_STAGING_APP:'true',VITE_STAGING_SUPABASE_URL:STAGING_URL,VITE_STAGING_PUBLISHABLE_KEY:'sb_publishable_synthetic',VITE_STAGING_API_URL:'http://127.0.0.1:55811'};
test('staging config has no production/legacy/local-demo fallback or service-key activation',()=>{
    assert.doesNotThrow(()=>assertStagingConfiguration(env,'http://127.0.0.1:55810'));
    for(const patch of [{VITE_STAGING_APP:'false'},{VITE_STAGING_SUPABASE_URL:'https://other.supabase.co'},{VITE_STAGING_API_URL:'https://production.example'},{VITE_SUPABASE_URL:STAGING_URL},{VITE_MARKET_API_URL:'https://production.example'},{VITE_LOCAL_PERFORMANCE_TEST:'true'},{VITE_STAGING_PUBLISHABLE_KEY:'sb_secret_synthetic'}])
        assert.throws(()=>assertStagingConfiguration({...env,...patch},'http://127.0.0.1:55810'));
    assert.throws(()=>assertStagingConfiguration(env,'https://production.example'));
    assert.throws(()=>assertStagingServerEnvironment({PORTFOLIO_STAGING_URL:'https://other.supabase.co'}));
});
test('staging transports handshake before traffic, stay on fixed routes and never call local writer RPCs',async()=>{
    const calls=[],http=[];
    const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_staging_performance_environment'?identity:{revision:1}};},
        auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token'}}})}};
    const transports=createStagingTransports(client,async(url,options)=>{http.push({url,options});return {ok:true,json:async()=>({files:[]})};});
    await transports.importTransport.fixtures();await transports.importTransport.request('preview',[],{});
    await transports.runtime.saveTrade({},0,'synthetic-request',null);
    assert.equal(calls.at(-1).name,'register_staging_portfolio_trade');
    assert.ok(http.every(c=>c.url.startsWith('http://127.0.0.1:55811/')&&c.options.redirect==='error'));
    assert.equal(transports.runtime.journalRpc('register_local_portfolio_cash'),'register_staging_portfolio_cash');
    assert.throws(()=>transports.runtime.journalRpc('get_local_performance_worker_input'));
    await assert.rejects(()=>transports.importTransport.request('../other',[],{}));
    const bad=createStagingTransports({...client,rpc:async()=>({data:{...identity,syntheticOnly:false}})},()=>assert.fail('No fallback permitted'));
    await assert.rejects(()=>bad.importTransport.fixtures(),/inte verifierad/);
});
test('approval draft is deterministic and keeps synthetic account guards on service-owner routes',()=>{
    const sql=readFileSync(draftPath,'utf8').replaceAll('\r\n','\n');assert.equal(sql,buildStagingRuntimeDraft());
    assert.equal([...sql.matchAll(/^begin;$/gm)].length,1);assert.equal([...sql.matchAll(/^commit;$/gm)].length,1);
    assert.doesNotMatch(sql,/portfolio_tracker\.test_only|public\.\w*local_performance|public\.\w*local_portfolio/);
    assert.doesNotMatch(sql,/set_config\s*\(/i);
    assert.match(sql,/register_staging_trade_for_owner\(p_user_id,e,gen_random_uuid\(\),b.revision,null\)/);
    for(const name of ['commit_staging_performance_import','get_staging_performance_worker_input','publish_staging_performance_observations','publish_staging_history_batch']) {
        const source=sql.slice(sql.indexOf(`create function public.${name}(`));
        assert.match(source.slice(0,source.indexOf('end $$;')),/require_staging_synthetic_user\(p_user_id\)/);
    }
});
test('synthetic staging HTTP chain derives owner from authenticated server identity and rejects owner/date/file injection',async()=>{
    const mutations=[],reads=[],updates=[];
    const admin={rpc:async(name,args)=>{if(name==='get_staging_performance_environment')return {data:identity};
        mutations.push({name,args});return {data:{initialized:true,revision:0}};}};
    const history={market:syntheticHistoricalProvider(),database:{input:async id=>{reads.push(id);return null;}},update:async id=>{updates.push(id);return {published:5};}};
    const app=createStagingAppServer({admin,history,authenticate:async header=>{if(header==='Bearer test-a')return 'synthetic-a';if(header==='Bearer test-b')return 'synthetic-b';throw new Error('Not authenticated');},marketRoute:async()=>({status:503,body:{error:'Index unavailable'}})});
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=(path,body,token='test-a',origin='http://127.0.0.1:55810')=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    try {
        assert.equal((await request('/fixtures',undefined,'invalid')).status,401);
        assert.equal((await request('/fixtures',undefined,'test-a','https://production.example')).status,403);
        const body={files:[syntheticFiles[0],syntheticFiles[1],syntheticFiles[5],syntheticFiles[3]],answers:syntheticImportAnswers};
        const preview=await request('/import/preview',body);assert.equal(preview.status,200);assert.equal((await preview.json()).valueSek,7200);
        assert.equal((await request('/import/commit',body)).status,200);assert.equal(mutations[0].args.p_user_id,'synthetic-a');
        assert.equal((await request('/import/commit',body,'test-b')).status,200);assert.equal(mutations[1].args.p_user_id,'synthetic-b');
        assert.deepEqual(updates,['synthetic-a','synthetic-b']);assert.ok(reads.every(id=>['synthetic-a','synthetic-b'].includes(id)));
        assert.equal((await request('/import/commit',{...body,user_id:'synthetic-b'})).status,422);
        assert.equal((await request('/import/commit',{files:[{name:'real.csv',text:'real data'}],answers:{}})).status,422);
        assert.equal(mutations.length,2);
        assert.equal((await request('/recalculate',{userId:'synthetic-b'})).status,422);
        assert.equal((await request('/recalculate',{})).status,200);
        assert.equal((await request('/api/index-history?id=OMXS30&period=1M')).status,503);
    }finally{await new Promise(resolve=>server.close(resolve));}
});
