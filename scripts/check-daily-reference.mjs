// Read-only: public provider GETs, no portfolio SDK or database writes.
import {createReferenceDataRoutes} from '../supabase/functions/_shared/referenceDataRoutes.js';
import {createMarketApiFetch} from '../src/services/marketApiFetch.js';
import {REFERENCE_DATA_VERSION} from '../supabase/functions/_shared/referenceData.js';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const local=createReferenceDataRoutes();
let remote;
if(process.argv.includes('--deployed')) {
    const keys=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','npx --yes supabase projects api-keys --project-ref ertvxedbqcqydeypnorm --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    const anon=keys.find(k=>k.name==='anon')?.api_key;
    const apiKey=readFileSync('.env.local','utf8').match(/^VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
    if(!anon?.startsWith('eyJ') || !apiKey)throw new Error('READONLY_AUTH_UNAVAILABLE');
    remote=createMarketApiFetch({baseUrl:'https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api',apiKey,
        getSession:async()=>({data:{session:{access_token:anon,user:{id:'readonly-reference-check'}}}})});
}
async function request(path){
    if(!remote)return local(new URL(path,'https://local'));
    try{const r=await remote(path);return{status:r.status,body:await r.json()};}catch(e){return{status:e.httpStatus,body:{error:e.code}};}
}
let failures=0;
const fx=await request('/api/reference-fx/USD/SEK');
const fxOk=fx.status===200 && fx.body.apiVersion===REFERENCE_DATA_VERSION && fx.body.current?.sourceTimestamp===null
    && fx.body.previous?.sourceDate<fx.body.current.sourceDate && fx.body.current.rate>0 && fx.body.previous.rate>0;
console.log(JSON.stringify({check:'USD/SEK reference',verified:fxOk,status:fx.status,currentDate:fx.body.current?.sourceDate,previousDate:fx.body.previous?.sourceDate}));
if(!fxOk)failures++;
let funds=[{name:'Avanza Zero',provider:'Avanza',instrument_id:'41567',isin:'SE0001718388'}];
const index=process.argv.indexOf('--holdings-file');
if(index>=0)funds=JSON.parse(readFileSync(process.argv[index+1],'utf8').replace(/^\uFEFF/,'')).rows.filter(h=>h.asset_type==='FUND' && h.provider==='Avanza');
for(const fund of funds){
    const r=await request('/api/nav-comparison?'+new URLSearchParams({provider:fund.provider,instrumentId:fund.instrument_id,isin:fund.isin}));
    const verified=r.status===200 && r.body.apiVersion===REFERENCE_DATA_VERSION && r.body.current?.isin===fund.isin
        && r.body.current.sourceTimestamp===null && r.body.previous?.sourceDate<r.body.current.sourceDate && r.body.current.price>0 && r.body.previous.price>0;
    console.log(JSON.stringify({check:fund.name,verified,status:r.status,error:r.body.error,currentDate:r.body.current?.sourceDate,previousDate:r.body.previous?.sourceDate}));
    if(!verified)failures++;
}
const lysa=await request('/api/lysa-nav-comparisons');
for(const isin of ['SE0009268584','SE0017231947','SE0023260401','SE0023260468']){
    const pair=lysa.body.comparisons?.[isin];
    const verified=lysa.status===200 && lysa.body.apiVersion===REFERENCE_DATA_VERSION && pair?.current?.isin===isin
        && pair.current.currency==='SEK' && pair.current.sourceTimestamp===null && pair.previous?.sourceDate<pair.current.sourceDate
        && pair.current.price>0 && pair.previous.price>0;
    console.log(JSON.stringify({check:'Lysa '+isin,verified,status:lysa.status,currentDate:pair?.current?.sourceDate,previousDate:pair?.previous?.sourceDate}));
    if(!verified)failures++;
}
process.exitCode=failures?1:0;
