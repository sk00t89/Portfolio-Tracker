// Standalone service job: independent of browser, Express and user login tokens.
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {localCredentials,assertLocalDatabase} from './localPerformanceEnvironment.mjs';
import {syntheticCatalog} from './syntheticPortfolioFixtures.mjs';
import {createLocalHistoryRuntime} from './localHistoryRuntime.mjs';
assertLocalDatabase();const credentials=localCredentials();
const admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const history=createLocalHistoryRuntime(admin),demo=JSON.parse(readFileSync('supabase-test/demo-users.local','utf8'));
await history.collect();
let failures=0;
for(const user of demo.users) {
    if(!user.email.endsWith('@portfolio-test.invalid'))throw new Error('Only synthetic test users are permitted.');
    const input=await history.database.input(user.id);
    if(!input?.baseline)continue;
    if(input.baseline.syntheticPublicDemo!==true&&!input.baseline.positions.every(p=>syntheticCatalog.some(i=>i.instrumentId===p.instrumentId)))continue;
    try {const result=await history.update(user.id);console.log(`LOCAL service job: ${result.published} observations saved at revision ${result.revision}.`);}
    catch(error){failures++;console.log(`LOCAL history pending: ${error.message}`);}
}
if(failures)process.exitCode=1;
console.log('Local service job finished without browser sessions. No production access.');
