// Preparation only: no network or credentials are used without an explicit mode.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

export const STAGING_REF='vutjthqlgzokeylaxpzp';
export const STAGING_URL=`https://${STAGING_REF}.supabase.co`;
export const TABLES=['portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations'];
const RECEIPT='artifacts.local/staging-isolation-receipt.json';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};

export function stagingFetch(fetchImpl=fetch){
    return (input,init={})=>{
        const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
        assert.equal(url.origin,STAGING_URL,'Only the approved staging origin is allowed');
        assert.equal(url.username,'');assert.equal(url.password,'');
        return fetchImpl(input,{...init,redirect:'error'});
    };
}
export function assertUserToken(token,id){
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    assert.equal(claims.iss,`${STAGING_URL}/auth/v1`);
    assert.equal(claims.role,'authenticated');assert.equal(claims.sub,id);
    // This checks identity routing, not the JWT signature; Supabase validates it.
}
export function fixture(id,runId,label){
    const marker=`synthetic-isolation:${runId}:${label}`;
    return {
        baseline:{user_id:id,baseline:{marker,synthetic:true},cash_flow_coverage:'unknown',cost_coverage:'unknown'},
        event:{user_id:id,event_id:randomUUID(),trade_date:'2026-10-09',sequence:1,account_key:`synthetic-${label}`,source:'synthetic_isolation',external_reference:marker,event:{marker,synthetic:true}},
        observation:{user_id:id,valuation_date:'2026-10-09',revision:1,observation:{marker,synthetic:true}},
        marker,
    };
}
async function ok(request){const result=await request;assert.ifError(result.error);return result.data;}
export async function denied(request){
    const result=await request;
    // A constraint error, expired token, or gateway failure is not a security pass.
    assert.equal(result.error?.code,'42501','Expected PostgreSQL insufficient_privilege');
}
async function privateRpcDenied(client,name,args={}){
    const result=await client.rpc(name,args);
    assert.ok(['42501','PGRST202'].includes(result.error?.code),`Unexpected outcome for ${name}`);
    // PGRST202 proves no accessible matching RPC, not a catalog EXECUTE assertion.
}
async function snapshot(admin,ids){
    const result=[];
    for(const table of TABLES)result.push(await ok(admin.from(table).select('*').in('user_id',ids).order('user_id')));
    return result;
}
export async function verifyIsolation({admin,anon,users}){
    assert.equal(users.length,2);assert.notEqual(users[0].id,users[1].id);
    const ids=users.map(u=>u.id),before=await snapshot(admin,ids);
    for(const user of users){
        const other=users.find(u=>u.id!==user.id);
        for(const table of TABLES){
            const rows=await ok(user.client.from(table).select('*'));
            assert.equal(rows.length,1);assert.equal(rows[0].user_id,user.id);
            assert.deepEqual(await ok(user.client.from(table).select('*').eq('user_id',other.id)),[]);
        }
        const input=await ok(user.client.rpc('get_portfolio_performance_input'));
        assert.equal(input.baseline.marker,user.fixture.marker);
        assert.equal(input.revision,1);
        assert.equal(input.events.length,1);assert.equal(input.events[0].marker,user.fixture.marker);
        assert.equal(input.observations.length,1);assert.equal(input.observations[0].marker,user.fixture.marker);
        assert.ok(!JSON.stringify(input).includes(other.fixture.marker));
        await privateRpcDenied(user.client,'get_portfolio_performance_input',{p_user_id:other.id});
    }
    await privateRpcDenied(anon,'get_portfolio_performance_input');
    for(const table of TABLES)await denied(anon.from(table).select('*'));
    for(const client of [anon,...users.map(u=>u.client)]){
        // Both owners are targeted, covering own and cross-user writes.
        for(const user of users){
            const payloads=[{...user.fixture.baseline},
                {...user.fixture.event,event_id:randomUUID(),sequence:2,external_reference:randomUUID()},
                {...user.fixture.observation,valuation_date:'2026-10-10'}];
            for(const [i,table] of TABLES.entries()){
                await denied(client.from(table).insert(payloads[i]));
                await denied(client.from(table).upsert(payloads[i]));
                const column=['baseline','event','observation'][i];
                await denied(client.from(table).update({[column]:{synthetic:true,attempt:'denied'}}).eq('user_id',user.id));
                await denied(client.from(table).delete().eq('user_id',user.id));
            }
        }
        await privateRpcDenied(client,'invalidate_performance_coverage');
        // No journal/import/publisher write RPC is authorized in foundation v1.
        for(const name of ['initialize_local_performance_portfolio','register_local_portfolio_trade','publish_local_performance_observations'])
            await privateRpcDenied(client,name,{});
    }
    assert.deepEqual(await snapshot(admin,ids),before,'Denied calls changed rows or revisions');
    return {owners:2,tables:3,writeAttempts:72,unchanged:true};
}

function clients(){
    // No dotenv and no production environment files. These are staging-only vars.
    assert.equal(process.env.PORTFOLIO_STAGING_URL,STAGING_URL);
    assert.ok(process.env.PORTFOLIO_STAGING_SERVICE_KEY);
    assert.ok(process.env.PORTFOLIO_STAGING_ANON_KEY);
    const transport={fetch:stagingFetch()};
    return {
        admin:createClient(STAGING_URL,process.env.PORTFOLIO_STAGING_SERVICE_KEY,{...options,global:transport}),
        anon:createClient(STAGING_URL,process.env.PORTFOLIO_STAGING_ANON_KEY,{...options,global:transport}),
        newUserClient:()=>createClient(STAGING_URL,process.env.PORTFOLIO_STAGING_ANON_KEY,{...options,global:transport}),
    };
}
function save(receipt){mkdirSync('artifacts.local',{recursive:true});writeFileSync(RECEIPT,JSON.stringify(receipt,null,2));}
export function assertDisposableUser(user,receipt,entry){
    assert.equal(user.id,entry.id);
    assert.equal(user.email,entry.email);
    assert.ok(user.email.endsWith('@portfolio-test.invalid'));
    assert.equal(user.app_metadata?.portfolio_isolation_run,receipt.runId);
}
async function cleanup(admin,receipt){
    assert.equal(receipt.projectRef,STAGING_REF);
    assert.match(receipt.runId,/^[0-9a-f-]{36}$/);
    assert.equal(receipt.users.length,2);
    // Validate both identities before any deletion. Resolve interrupted creates
    // by their exact intended email AND server-managed run marker.
    const listed=await ok(admin.auth.admin.listUsers({page:1,perPage:10}));
    assert.ok(listed.users.length<=2,'Unexpected Auth users; stop for review');
    const targets=[];
    for(const entry of receipt.users){
        const user=listed.users.find(u=>u.email===entry.email);
        if(!user){assert.ok(!listed.users.some(u=>u.id===entry.id));continue;}
        if(!entry.id)entry.id=user.id;
        assertDisposableUser(user,receipt,entry);targets.push(user);
    }
    assert.ok(listed.users.every(u=>targets.some(t=>t.id===u.id)),'Unexpected Auth identity');
    for(const user of targets)await ok(admin.auth.admin.deleteUser(user.id));
    const ids=receipt.users.map(u=>u.id).filter(Boolean);
    if(ids.length)assert.ok((await snapshot(admin,ids)).every(rows=>rows.length===0),'Cascade cleanup incomplete');
    assert.equal((await ok(admin.auth.admin.listUsers({page:1,perPage:1}))).users.length,0);
    receipt.cleaned=true;save(receipt);
}
async function main(){
    const mode=process.argv[2]??'--plan';
    assert.equal(process.argv.length<=3,true);
    if(mode==='--plan'){
        console.log(`PREPARATION ONLY. Target ${STAGING_REF}. Two disposable synthetic Auth users; owner-only reads and RPC, 72 denied writes, internal-RPC checks, unchanged rows, scoped cascade cleanup. No network or secrets read. Approval required before --run-approved or --cleanup-approved.`);return;
    }
    assert.ok(['--run-approved','--cleanup-approved'].includes(mode));
    const {admin,anon,newUserClient}=clients();
    if(mode==='--cleanup-approved'){
        const receipt=JSON.parse(readFileSync(RECEIPT,'utf8'));await cleanup(admin,receipt);
        console.log('PASS: only receipt-matched synthetic users cleaned up.');return;
    }
    if(existsSync(RECEIPT))assert.equal(JSON.parse(readFileSync(RECEIPT,'utf8')).cleaned,true,'Previous run needs review/cleanup');
    assert.equal((await ok(admin.auth.admin.listUsers({page:1,perPage:1}))).users.length,0,'Staging must have no Auth users');
    for(const table of TABLES)assert.deepEqual(await ok(admin.from(table).select('user_id').limit(1)),[],'Staging fixture tables must be empty');
    const runId=randomUUID(),receipt={projectRef:STAGING_REF,runId,cleaned:false,users:['a','b'].map(label=>({label,email:`isolation-${label}-${runId}@portfolio-test.invalid`,id:null}))};
    receipt.phase='users';save(receipt);const users=[];
    try{
        for(const entry of receipt.users){
            const password=randomBytes(32).toString('base64url');
            const created=await ok(admin.auth.admin.createUser({email:entry.email,password,email_confirm:true,app_metadata:{portfolio_isolation_run:runId}}));
            entry.id=created.user.id;save(receipt);
            const client=newUserClient();const login=await ok(client.auth.signInWithPassword({email:entry.email,password}));
            assertUserToken(login.session.access_token,entry.id);
            users.push({...entry,client,fixture:fixture(entry.id,runId,entry.label)});
        }
        receipt.phase='fixtures';save(receipt);
        for(const user of users){
            await ok(admin.from(TABLES[0]).insert(user.fixture.baseline));
            await ok(admin.from(TABLES[1]).insert(user.fixture.event));
            await ok(admin.from(TABLES[2]).insert(user.fixture.observation));
        }
        receipt.phase='isolation';save(receipt);
        const result=await verifyIsolation({admin,anon,users});
        receipt.result=result;save(receipt);console.log('PASS: two real Auth logins, owner reads/RPC, denied writes and internal routes, rows and revisions unchanged.');
    }catch(error){
        receipt.failure={phase:receipt.phase,category:error instanceof assert.AssertionError?'assertion':'transport_or_api'};
        save(receipt);throw error;
    }finally{
        // Stop test requests on failure; cleanup only these approved disposable fixtures.
        try{for(const user of users)await user.client.auth.signOut({scope:'local'});}
        finally{await cleanup(admin,receipt);}
    }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
    main().catch(()=>{console.error('STOP: staging isolation failed. Do not retry or broaden access. Review the synthetic receipt and approval scope; no keys/tokens are logged.');process.exitCode=1;});
}
