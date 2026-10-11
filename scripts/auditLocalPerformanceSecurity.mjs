import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runLocalSql} from './localPerformanceEnvironment.mjs';

export const reviewedSqlFiles=['supabase/proposals/portfolio-performance-v1.sql',
    'supabase-test/performance-runtime.sql','supabase-test/history-stage.sql',
    'supabase-test/cash-stage.sql','supabase-test/market-archive.sql','supabase-test/public-market-stage.sql'];
const ownerRpcs=new Set(['get_portfolio_performance_input','initialize_local_performance_portfolio',
    'register_local_portfolio_trade','correct_local_portfolio_trade','register_local_portfolio_cash']);
const serviceRpcs=new Set(['get_local_performance_worker_input','commit_local_performance_import',
    'publish_local_performance_observations','publish_local_history_batch','archive_local_market_batch',
    'archive_local_public_sources','publish_local_public_history']);
const environmentRpc='get_local_performance_environment';
const internalFunctions=new Set(['invalidate_performance_coverage','require_local_performance_test',
    'local_cash_delta','replay_local_performance_ledger']);
const invokerFunctions=new Set(['get_portfolio_performance_input','require_local_performance_test',
    'local_cash_delta','replay_local_performance_ledger']);
// These are the two exact owner-only expressions in the reviewed local SQL.
// Mentioning auth.uid/user_id alone does not rule out an OR true policy.
const ownerPolicies=new Set(['((selectauth.uid()asuid)=user_id)','(auth.uid()=user_id)']);

export function assertPerformanceSecurity(report,{tables,functions}){
    assert.equal(report.marker,'true','Local database marker required');
    assert.deepEqual(report.tables.map(t=>t.name).sort(),[...tables].sort(),'Missing/unexpected audited tables');
    assert.deepEqual(report.functions.map(f=>f.name).sort(),[...functions].sort(),'Missing/unexpected function overload');
    for(const table of report.tables){
        assert.equal(table.rls,true,`${table.name}: RLS disabled`);
        assert.equal(table.anonPrivileges,false,`${table.name}: anonymous table access`);
        assert.equal(table.authWrites,false,`${table.name}: direct authenticated writes`);
        const cache=table.name==='local_performance_market_cache';
        assert.equal(table.authSelect,!cache,`${table.name}: wrong SELECT grant`);
        assert.equal(table.ownerCanBypass,true,`${table.name}: RPC owner cannot bypass RLS; review owner/force-RLS design`);
        assert.equal(table.serviceWrites,true,`${table.name}: missing service permissions`);
        if(cache)assert.equal(table.policies.length,0,'Shared cache must have no client policy');
        else {
            assert.equal(table.policies.length,1,`${table.name}: unexpected policy set`);
            const [policy]=table.policies;
            assert.equal(policy.command,'r',`${table.name}: non-read policy`);
            assert.deepEqual(policy.roles,['authenticated'],`${table.name}: unexpected policy role`);
            assert.ok(ownerPolicies.has(policy.qual?.replace(/\s/g,'').toLowerCase()),`${table.name}: policy is not the reviewed owner-only expression`);
        }
    }
    for(const fn of report.functions){
        assert.ok(ownerRpcs.has(fn.name)||serviceRpcs.has(fn.name)||internalFunctions.has(fn.name)||fn.name===environmentRpc,`${fn.name}: unreviewed function`);
        assert.equal(fn.definer,!invokerFunctions.has(fn.name),`${fn.name}: changed security invoker/definer mode`);
        assert.ok(fn.config?.includes('search_path=""'),`${fn.name}: unsafe search_path`);
        assert.equal(fn.publicExecute,false,`${fn.name}: PUBLIC execute`);
        assert.equal(fn.anonExecute,fn.name===environmentRpc,`${fn.name}: anonymous execute`);
        assert.equal(fn.authExecute,ownerRpcs.has(fn.name)||fn.name===environmentRpc,`${fn.name}: authenticated execute`);
        if(serviceRpcs.has(fn.name))assert.equal(fn.serviceExecute,true,`${fn.name}: missing service execute`);
        if(fn.definer)assert.equal(fn.ownerCanBypass,true,`${fn.name}: unexpected definer owner`);
    }
    return {tables:report.tables.length,functions:report.functions.length};
}

export function reviewPerformanceSql(){
    const tables=new Set(),functions=new Set();
    const artifacts=reviewedSqlFiles.map(path=>{
        const sql=readFileSync(path,'utf8');
        for(const match of sql.matchAll(/create table public\.([a-z_]+)/gi))tables.add(match[1]);
        for(const match of sql.matchAll(/create (?:or replace )?function public\.([a-z_]+)/gi))functions.add(match[1]);
        // Local runtime stays local. This review is never a cloud migration executor.
        if(path.startsWith('supabase-test/'))assert.match(sql,/require_local_performance_test\(\)/);
        return {path,sha256:createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex')};
    });
    return {tables:[...tables],functions:[...functions],artifacts};
}

export function auditLocalPerformanceSecurity(){
    const expected=reviewPerformanceSql();
    const literals=values=>values.map(value=>`'${value}'`).join(','); // Source-derived identifiers only.
    const report=JSON.parse(runLocalSql(`begin read only;
        select jsonb_build_object('marker',current_setting('portfolio_tracker.test_only',true),
        'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
            'ownerCanBypass',r.rolsuper or r.rolbypassrls,
            'anonPrivileges',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
            'authSelect',has_table_privilege('authenticated',c.oid,'SELECT'),
            'authWrites',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
            'serviceWrites',has_table_privilege('service_role',c.oid,'SELECT') and has_table_privilege('service_role',c.oid,'INSERT') and has_table_privilege('service_role',c.oid,'UPDATE') and has_table_privilege('service_role',c.oid,'DELETE'),
            'policies',coalesce((select jsonb_agg(jsonb_build_object('command',p.polcmd,'qual',pg_get_expr(p.polqual,p.polrelid),
                'roles',(select jsonb_agg(case when role_oid=0 then 'public' else (select rolname from pg_roles where oid=role_oid) end) from unnest(p.polroles) role_oid)))
                from pg_policy p where p.polrelid=c.oid),'[]'::jsonb)))
            from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
            where n.nspname='public' and c.relname in (${literals(expected.tables)})),
        'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'config',p.proconfig,'definer',p.prosecdef,
            'ownerCanBypass',r.rolsuper or r.rolbypassrls,
            'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
            'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
            'authExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
            'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE')))
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
            where n.nspname='public' and p.proname in (${literals(expected.functions)})));
        rollback;`).split('\n').find(line=>line.startsWith('{')));
    return {...assertPerformanceSecurity(report,expected),artifacts:expected.artifacts};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const result=auditLocalPerformanceSecurity();
    console.log(`PASS LOCAL read-only security audit: ${result.tables} tables, ${result.functions} functions; RLS, role grants, fixed search paths, owners and overloads.`);
    console.log(JSON.stringify({reviewedLocalSql:result.artifacts},null,2));
}
