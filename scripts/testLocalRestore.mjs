// Synthetic local backup/restore rehearsal. Never accepts a URL or project ref.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {assertLocalDatabase,runLocalSql} from './localPerformanceEnvironment.mjs';
const container=assertLocalDatabase();
assert.equal(runLocalSql("select count(*) from auth.users where email is null or email not like '%@portfolio-test.invalid';"),'0','Only fictional Auth data may be backed up');
const database=`portfolio_restore_${randomBytes(5).toString('hex')}`;
const tables=['auth.users','auth.identities','public.holdings','public.portfolio_daily_values','public.portfolio_performance_baselines','public.portfolio_ledger_events',
    'public.portfolio_performance_observations','public.local_performance_market_cache','public.local_performance_corrections','public.local_performance_imports','public.local_performance_runs'];
const fingerprintSql=tables.map(t=>`select '${t}',count(*),md5(coalesce(string_agg(j::text,',' order by j::text),'')) from (select to_jsonb(x) j from ${t} x) s;`).join('\n');
const original=runLocalSql(fingerprintSql);
const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema=public','--schema=auth','--no-owner'],{maxBuffer:32*1024*1024});
// Encrypt even this fictional dump. Key stays in memory for this rehearsal;
// production requires separate retained keys/retention and external backup storage.
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const encrypted=Buffer.concat([cipher.update(dump),cipher.final()]);mkdirSync('supabase-test/backups.local',{recursive:true});
const backupPath=`supabase-test/backups.local/${database}.bin`,header=Buffer.concat([iv,cipher.getAuthTag()]);writeFileSync(backupPath,Buffer.concat([header,encrypted]));
const saved=readFileSync(backupPath),decipher=createDecipheriv('aes-256-gcm',key,saved.subarray(0,12));decipher.setAuthTag(saved.subarray(12,28));
const restoredDump=Buffer.concat([decipher.update(saved.subarray(28)),decipher.final()]);assert.deepEqual(restoredDump,dump);
runLocalSql(`create database ${database};`,{admin:true});
const sql=(text)=>{
    assertLocalDatabase();
    const result=spawnSync('docker',['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8',maxBuffer:32*1024*1024});
    if(result.status!==0)throw new Error(`Local restore failed: ${result.stderr}`);return result.stdout.trim();
};
sql('create schema if not exists extensions;');
// PostgreSQL creates an empty public schema in a new database already.
const restoreSql=restoredDump.toString('utf8');
assert.equal(restoreSql.split('CREATE SCHEMA public;').length,2);
sql(restoreSql.replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;'));
assert.equal(sql(fingerprintSql),original,'Restored journal, Auth identities, cash, revisions and archive must match');
assert.equal(runLocalSql(fingerprintSql),original,'Source database must remain unchanged');
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations') and c.relrowsecurity;"),'3');
assert.equal(sql("select has_function_privilege('authenticated','public.publish_local_public_history(uuid,bigint,jsonb)','EXECUTE');"),'f');
assert.equal(sql("select has_function_privilege('authenticated','public.archive_local_public_sources(jsonb)','EXECUTE');"),'f');
writeFileSync('supabase-test/restore-report.local',JSON.stringify({database,backupSha256:createHash('sha256').update(saved).digest('hex'),syntheticOnly:true,
    matchingTables:tables.length,rls:true,servicePermissions:true,scope:'Local PostgreSQL public+Auth schemas only; same cluster roles, no Storage/PITR/cloud/scheduler restore',rehearsalKeyNotRetained:true},null,2));
console.log(`PASS LOCAL RESTORE: encrypted synthetic backup restored into ${database}; ${tables.length} table fingerprints, RLS and service-only permissions match; source DB unchanged. No cloud/production access.`);
