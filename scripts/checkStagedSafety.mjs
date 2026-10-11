import {execFileSync} from 'node:child_process';
const names=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const failures=[];
for(const name of names){
    if(/(^|\/)\.env(?:\.|$)|\.local(?:\.|\/|$)|(^|\/)(?:node_modules|dist)\/|docs\/(?:local-public-market-job|pilot-public-(?:listed|market)-audit)\.json$|\.(?:bin|dump|csv|xlsx|jpg|png)$/.test(name)){
        failures.push(`${name}: forbidden runtime/data artifact`);continue;
    }
    const content=execFileSync('git',['show',`:${name}`],{encoding:'utf8',maxBuffer:4*1024*1024});
    if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sb_secret_|ghp_|github_pat_)[A-Za-z0-9_]{16,}|\bsk-[A-Za-z0-9_-]{24,}|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(content))failures.push(`${name}: credential-shaped literal`);
}
if(failures.length)throw new Error(failures.join('\n'));
console.log(`PASS staged safety: ${names.length} source/document files; no env, local archives/backups, images, credential-shaped literals. Manual diff review remains required.`);
