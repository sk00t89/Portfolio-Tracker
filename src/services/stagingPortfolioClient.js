import {createClient} from '@supabase/supabase-js';
import {localLedgerError} from './localPerformanceClient.js';

export const STAGING_REF='vutjthqlgzokeylaxpzp';
export const STAGING_URL=`https://${STAGING_REF}.supabase.co`;
export function assertStagingConfiguration(env,origin) {
    if(env.VITE_STAGING_APP!=='true'||env.VITE_STAGING_SUPABASE_URL!==STAGING_URL
        ||origin!=='http://127.0.0.1:55810'||env.VITE_STAGING_API_URL!=='http://127.0.0.1:55811'
        ||env.VITE_SUPABASE_URL||env.VITE_MARKET_API_URL||env.VITE_LOCAL_PERFORMANCE_TEST==='true')
        throw new Error('Stagingkonfigurationen kunde inte verifieras. Ingen reservanslutning tillåts.');
    const key=env.VITE_STAGING_PUBLISHABLE_KEY;
    if(!key||key.startsWith('sb_secret_'))throw new Error('Endast stagingprojektets publika klientnyckel får användas.');
    if(!key.startsWith('sb_publishable_')) {
        try {
            const payload=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
            if(payload.role!=='anon'||payload.ref!==STAGING_REF)throw new Error();
        }catch{throw new Error('Ogiltig publik stagingnyckel.');}
    }
}
export function createStagingPortfolioClient(env,origin) {
    assertStagingConfiguration(env,origin);
    return createClient(STAGING_URL,env.VITE_STAGING_PUBLISHABLE_KEY,{auth:{storageKey:`portfolio-staging:${STAGING_REF}`,
        persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
}
export async function verifyStagingRuntime(client) {
    const {data,error}=await client.rpc('get_staging_performance_environment');
    if(error||data?.projectRef!==STAGING_REF||data?.environment!=='portfolio-performance-staging'
        ||data.syntheticOnly!==true||data.runtimeVersion!=='staging-runtime-v1')
        throw new Error('Stagingmotorn är inte verifierad eller installerad. Inga data ändras.');
}
export function createStagingTransports(client,fetcher=fetch) {
    const request=async(path,body,options={})=>{
        await verifyStagingRuntime(client);
        if(!/^\/(?:fixtures|recalculate|import\/(?:preview|commit))$/.test(path)
            &&!/^\/api\/index-(?:history|fx-history)\?[^#]*$/.test(path))throw new Error('Otillåten stagingrutt.');
        const {data,error}=await client.auth.getSession();
        if(error||!data.session?.access_token)throw new Error('Logga in i staging.');
        return fetcher(`http://127.0.0.1:55811${path}`,{...options,redirect:'error',
            method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
            ...(body===undefined?{}:{body:JSON.stringify(body)})});
    };
    const json=async(path,body)=>{const response=await request(path,body);const result=await response.json();
        if(!response.ok)throw new Error(result.error??'Stagingtjänsten kunde inte slutföra begäran.');return result;};
    return {
        importTransport:{fixtures:async()=>(await json('/fixtures')).files,
            request:(action,files,answers)=>json(`/import/${action}`,{files,answers})},
        marketRequest:(path,options)=>request(path,undefined,options),
        runtime:{runsTable:'staging_performance_runs',verify:()=>verifyStagingRuntime(client),
            initializeRpc:'initialize_staging_performance_portfolio',
            journalRpc:name=>{
                const names={register_local_portfolio_cash:'register_staging_portfolio_cash',correct_local_portfolio_trade:'correct_staging_portfolio_trade'};
                if(!names[name])throw new Error('Otillåten journalfunktion.');return names[name];
            },
            recalculate:()=>json('/recalculate',{}),
            async saveTrade(draft,revision,requestId,deposit) {
                await verifyStagingRuntime(client);
                const {data,error}=await client.rpc('register_staging_portfolio_trade',{p_draft:draft,p_request_id:requestId,p_expected_revision:revision,p_deposit:deposit});
                if(error)throw localLedgerError(error);return data;
            },
        },
    };
}
