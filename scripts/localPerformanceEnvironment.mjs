import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

export const LOCAL_PROJECT = 'portfolio-performance-local-test';
export const LOCAL_DB_CONTAINER = `supabase_db_${LOCAL_PROJECT}`;
export const LOCAL_API_URL = 'http://127.0.0.1:55321';

export function assertLocalApiUrl(value) {
    const url = new URL(value);
    if (url.origin !== LOCAL_API_URL || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Database/API operation refused: only http://127.0.0.1:55321 is authorized.');
    }
    return LOCAL_API_URL;
}
export function assertLocalDatabase() {
    const config = readFileSync('supabase-test/supabase/config.toml', 'utf8');
    if (!config.includes(`project_id = "${LOCAL_PROJECT}"`) || existsSync('supabase-test/supabase/.temp/project-ref')) {
        throw new Error('Local test configuration is missing or linked to a remote project.');
    }
    const [container] = JSON.parse(execFileSync('docker', ['inspect', LOCAL_DB_CONTAINER], { encoding:'utf8' }));
    const binding = container.NetworkSettings.Ports['5432/tcp'];
    if (container.Name !== `/${LOCAL_DB_CONTAINER}` || !container.State.Running || !binding?.some(port => port.HostPort === '55322')) {
        throw new Error('Refusing SQL: unexpected Docker database identity or port.');
    }
    return LOCAL_DB_CONTAINER;
}
export function runLocalSql(sql, { admin = false } = {}) {
    const container = assertLocalDatabase();
    const result = spawnSync('docker', ['exec','-i',container,'psql','-U',admin ? 'supabase_admin' : 'postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],
        { input:sql, encoding:'utf8', maxBuffer:8*1024*1024 });
    if (result.status !== 0) throw new Error(`Local SQL failed: ${result.stderr}`);
    return result.stdout.trim();
}
export function localCredentials() {
    assertLocalDatabase();
    // Read keys from this isolated stack's configuration, never .env.local.
    const output = process.platform === 'win32'
        ? execFileSync('cmd.exe',['/d','/s','/c','npx --yes supabase status --workdir supabase-test -o json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
        : execFileSync('npx',['--yes','supabase','status','--workdir','supabase-test','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const values = JSON.parse(output);
    assertLocalApiUrl(values.API_URL);
    if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error('Local credentials unavailable.');
    return { url:LOCAL_API_URL, anonKey:values.ANON_KEY, serviceKey:values.SERVICE_ROLE_KEY };
}
