import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalPerformanceUrl,createLocalPerformanceClient,verifyLocalPerformanceEnvironment} from '../src/services/localPerformanceClient.js';
import {assertLocalApiUrl} from '../scripts/localPerformanceEnvironment.mjs';

test('local performance paths refuse remote projects, alternate ports and URL credentials',()=>{
    for(const url of ['https://example.supabase.co','http://localhost:55321','http://127.0.0.1:54321','http://127.0.0.1:55321/path','http://x:y@127.0.0.1:55321','http://127.0.0.1:55321?remote=true']) {
        assert.throws(()=>assertLocalApiUrl(url));assert.throws(()=>assertLocalPerformanceUrl(url));
        assert.throws(()=>createLocalPerformanceClient(url,'test-key'));
    }
    assert.doesNotThrow(()=>assertLocalApiUrl('http://127.0.0.1:55321'));
});
test('local write handshake refuses unverified server identity',async()=>{
    for(const data of [null,{environment:'production',syntheticOnly:true},{environment:'portfolio-performance-local-test',syntheticOnly:false}]) {
        await assert.rejects(()=>verifyLocalPerformanceEnvironment({rpc:async()=>({data,error:null})}));
    }
    await verifyLocalPerformanceEnvironment({rpc:async()=>({data:{environment:'portfolio-performance-local-test',syntheticOnly:true},error:null})});
});
