import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assertLocalDatabase, runLocalSql, localCredentials, LOCAL_PROJECT } from './localPerformanceEnvironment.mjs';

assertLocalDatabase();
console.log('Verified target: isolated Docker database, port 55322. No remote link.');
runLocalSql("alter database postgres set portfolio_tracker.test_only='true';", {admin:true});
const exists=runLocalSql("select to_regclass('public.portfolio_performance_baselines') is not null;");
if(exists==='f') {
    // Execute only the reviewed, explicit proposal. No repository migrations.
    runLocalSql(readFileSync('supabase/proposals/portfolio-performance-v1.sql','utf8'));
}
if(runLocalSql("select to_regprocedure('public.register_local_portfolio_trade(jsonb,uuid,bigint,jsonb)') is not null;")==='f') {
    runLocalSql(readFileSync('supabase-test/performance-runtime.sql','utf8'));
}
// Restart only this local REST service to pick up the DB's test-only setting.
execFileSync('docker',['restart',`supabase_rest_${LOCAL_PROJECT}`],{stdio:'ignore'});
const {url,anonKey}=localCredentials();
mkdirSync('performance-test',{recursive:true});
writeFileSync('performance-test/.env.local',`VITE_LOCAL_PERFORMANCE_TEST=true\nVITE_LOCAL_TEST_SUPABASE_URL=${url}\nVITE_LOCAL_TEST_SUPABASE_KEY=${anonKey}\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}\nVITE_MARKET_API_URL=http://127.0.0.1:55801\n`);
console.log('Local schema installed. Only local publishable credentials saved to ignored test app config.');
