import {readFileSync} from 'node:fs';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
assertLocalDatabase();
if(runLocalSql("select to_regclass('public.local_performance_imports') is not null;")==='f')runLocalSql(readFileSync('supabase-test/history-stage.sql','utf8'));
if(runLocalSql("select to_regprocedure('public.register_local_portfolio_cash(jsonb,uuid,bigint)') is not null;")==='f')runLocalSql(readFileSync('supabase-test/cash-stage.sql','utf8'));
// Updating a local test function is explicit and does not touch existing ledger rows.
const sql=readFileSync('supabase-test/history-stage.sql','utf8');
const start=sql.indexOf('create function public.commit_local_performance_import('),end=sql.indexOf('\nrevoke all on function public.commit_local_performance_import',start);
if(start<0||end<0)throw new Error('Reviewed local import function not found.');
runLocalSql("begin;select public.require_local_performance_test();"+sql.slice(start,end).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
for(const [file,name] of [['supabase-test/performance-runtime.sql','register_local_portfolio_trade'],['supabase-test/cash-stage.sql','register_local_portfolio_cash'],['supabase-test/history-stage.sql','publish_local_history_batch'],['supabase-test/history-stage.sql','correct_local_portfolio_trade']]) {
    const source=readFileSync(file,'utf8'),from=source.indexOf(`create function public.${name}(`),to=source.indexOf(`\nrevoke all on function public.${name}`,from);
    if(from<0||to<0)throw new Error('Reviewed local function not found.');
    runLocalSql("begin;select public.require_local_performance_test();"+source.slice(from,to).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
}
console.log('Reviewed history-stage SQL executed only in isolated local PostgreSQL on port 55322.');
runLocalSql(readFileSync('supabase-test/market-archive.sql','utf8'));
console.log('Reviewed local market archive RPC installed; no production target and no new tables.');
runLocalSql(readFileSync('supabase-test/public-market-stage.sql','utf8'));
console.log('Reviewed public source bridge installed locally; only fictional public demo portfolios can be published.');
