import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalLedgerImportTransport} from '../src/services/localLedgerImportTransport.js';

test('local import transport sends only files/answers and the current session to the local routes', async()=>{
    const calls=[],files=[{name:'synthetic.csv',text:'fixture'}],answers={cash:0};
    const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token'}}})}};
    const transport=createLocalLedgerImportTransport(client,async(url,options)=>{
        calls.push({url,options});
        return {ok:true,json:async()=>options?{ready:true}:{files}};
    });
    assert.deepEqual(await transport.fixtures(),files);
    for(const action of ['preview','commit'])assert.deepEqual(await transport.request(action,files,answers),{ready:true});
    assert.equal(calls[0].url,'/api/local-test/fixtures');
    for(const [index,action] of ['preview','commit'].entries()) {
        const call=calls[index+1];assert.equal(call.url,`/api/local-test/import/${action}`);
        assert.equal(call.options.method,'POST');
        assert.equal(call.options.headers.Authorization,'Bearer synthetic-token');
        assert.deepEqual(JSON.parse(call.options.body),{files,answers});
    }
});

test('invalid actions and absent or failed sessions never issue import requests',async()=>{
    for(const session of [{data:{session:null}},{data:{session:{access_token:'synthetic-token'}},error:new Error('expired')}]) {
        const transport=createLocalLedgerImportTransport({auth:{getSession:async()=>session}},()=>assert.fail('No request permitted'));
        await assert.rejects(()=>transport.request('commit',[],{}),/Logga in/);
        await assert.rejects(()=>transport.request('../other',[],{}),/Ogiltigt/);
    }
});

test('failed fixture requests and import reconciliation errors remain failures',async()=>{
    const transport=createLocalLedgerImportTransport({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token'}}})}},
        async()=>({ok:false,json:async()=>({error:'Kassan behöver stämmas av.'})}));
    await assert.rejects(()=>transport.fixtures(),/lokala testservern/);
    await assert.rejects(()=>transport.request('commit',[],{}),/Kassan behöver stämmas av/);
});
