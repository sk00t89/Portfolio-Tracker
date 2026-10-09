// Read-only live verification using the exact shared Express/Supabase adapter.
import { createIndexHistoryRoute } from '../supabase/functions/_shared/indexHistory.js';
import { validateIndexResponse } from '../src/services/indexHistory.js';
import { createMarketApiFetch } from '../src/services/marketApiFetch.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const route = createIndexHistoryRoute();
const deployed = process.argv.includes('--deployed');
const baseUrl = 'https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api';
let remoteFetch, apiKey;
if (deployed) {
    // Capture existing anonymous JWT in memory, never print keys or use service-role access.
    const keys = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
        'npx --no-install supabase projects api-keys --project-ref ertvxedbqcqydeypnorm --output json'],
    {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    const anon = keys.find(key => key.name === 'anon')?.api_key;
    apiKey = readFileSync('.env.local','utf8').match(/^VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
    if (!anon?.startsWith('eyJ') || !apiKey) throw new Error('READONLY_AUTH_UNAVAILABLE');
    remoteFetch = createMarketApiFetch({baseUrl,apiKey,
        getSession:async()=>({data:{session:{access_token:anon,user:{id:'readonly-index-check'}}}})});
}
async function request(path) {
    if (!deployed) return route(new URL(path,'http://localhost'));
    try { const response=await remoteFetch(path); return {status:response.status,body:await response.json()}; }
    catch(error) { return {status:error.httpStatus,body:{code:error.indexCode ?? error.code}}; }
}
let failures = 0;
for (const id of ['OMXS30', 'SP500']) {
    for (const period of ['1V', '1M', '3M', 'YTD', '1Å', 'All']) {
        const result = await request(`/api/index-history?id=${id}&period=${encodeURIComponent(period)}`);
        const data = result.body;
        let validated=false;
        if (result.status === 200) {
            try { validateIndexResponse(data,id,period); validated=true; } catch { /* Report failure without response/credentials. */ }
        }
        console.log(JSON.stringify({id,period,status:result.status,code:data.code,currency:data.currency,zone:data.zone,
            symbol:data.symbol,start:data.requestedStart,first:data.points?.[0]?.date,last:data.points?.at(-1)?.date,
            points:data.points?.length,missing:data.missing,validated}));
        if (!validated) failures++;
    }
}
for (const [id,period,code] of [['SIXRX','All','INDEX_UNSUPPORTED'],['OMXS30','1D','INDEX_PERIOD_UNSUPPORTED'],['SP500','bad','INDEX_PERIOD_UNSUPPORTED']]) {
    const result=await request(`/api/index-history?id=${id}&period=${period}`);
    const verified=result.status===400 && result.body.code===code;
    console.log(JSON.stringify({check:'unsupported choice',id,period,status:result.status,code:result.body.code,verified}));
    if (!verified) failures++;
}
if (deployed) {
    const url=`${baseUrl}/api/index-history?id=OMXS30&period=1M`;
    for (const [name,options,expected] of [
        ['no credentials',{},401],
        ['publishable key without explicit bearer',{headers:{apikey:apiKey}},200],
        ['invalid JWT',{headers:{apikey:apiKey,Authorization:'Bearer invalid'}},401],
        ['CORS preflight',{method:'OPTIONS',headers:{Origin:'https://example.com',
            'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,apikey,content-type'}},200],
    ]) {
        const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
        const cors=name!=='CORS preflight' || (response.headers.get('access-control-allow-origin')==='*'
            && response.headers.get('access-control-allow-headers')?.includes('authorization'));
        const verified=response.status===expected && cors;
        console.log(JSON.stringify({check:name,status:response.status,verified}));
        await response.body?.cancel();
        if(!verified) failures++;
    }
    // Publishable-key-only behavior must match an existing public market-data route.
    for (const [name,headers,expected] of [['no credentials',{},401],['publishable key',{apikey:apiKey},200]]) {
        const response=await fetch(`${baseUrl}/api/reference-fx/USD/SEK`,{headers,signal:AbortSignal.timeout(15000)});
        const verified=response.status===expected;
        console.log(JSON.stringify({check:'existing route auth parity',auth:name,status:response.status,verified}));
        await response.body?.cancel();
        if(!verified)failures++;
    }
}
process.exitCode = failures ? 1 : 0;
