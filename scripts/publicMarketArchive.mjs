import {readFile,writeFile,rename,open,unlink,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDate} from '../src/utils/performanceLedger.js';
const key=p=>JSON.stringify([p.instrumentId,p.currency,p.date]);
export function createPublicMarketArchive({path,catalog,onCorrection=async()=>{}}){
    const read=async()=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return {format:1,revision:0,current:{},versions:{}};throw e;}};
    return {snapshot:read,async withRevision(revision,publish){
        const lock=await open(`${path}.lock`,'wx');
        try{if((await read()).revision!==revision)throw new Error('Public source revision changed');return await publish();}
        finally{await lock.close();await unlink(`${path}.lock`);}
    },async latestPrice(id,currency,date){const data=await read();return Object.values(data.current).filter(p=>p.instrumentId===id&&p.currency===currency&&p.date<=date).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);},
        async commitBatch(points){
            if(!Array.isArray(points)||points.length>500)throw new Error('Invalid public market batch');
            await mkdir(dirname(path),{recursive:true});
            const lock=await open(`${path}.lock`,'wx'),temporary=`${path}.${randomUUID()}.tmp`;
            try{
                const data=await read(),seen=new Set(),changes=[],counts={inserted:0,unchanged:0,corrected:0};
                for(const p of points){
                    const listing=catalog.find(i=>i.instrumentId===p.instrumentId&&i.currency===p.currency&&i.isin===p.isin&&i.identityVerified===true);
                    const value=listing?.assetType==='FX'?p.rate:p.price;
                    if(!listing||p.verified!==true||!p.source?.trim()||!isDate(p.date)||typeof value!=='number'||!Number.isFinite(value)||value<=0
                        ||listing.assetType==='FX'&&(p.from!==listing.currency||p.to!=='SEK')
                        ||!Number.isFinite(Date.parse(p.collectedAt))||p.date>p.collectedAt.slice(0,10))throw new Error('Unverified public market evidence');
                    const k=key(p);if(seen.has(k))throw new Error('Duplicate public source date');seen.add(k);
                    const stable={instrumentId:p.instrumentId,isin:p.isin,currency:p.currency,date:p.date,
                        ...(listing.assetType==='FX'?{rate:p.rate,from:p.from,to:p.to}:{price:p.price}),source:p.source,verified:true,
                        ...(p.sourceMetadata?{sourceMetadata:p.sourceMetadata}:{})};
                    const hash=createHash('sha256').update(JSON.stringify(stable)).digest('hex');
                    const previous=data.current[k];
                    if(previous?.contentSha256===hash){counts.unchanged++;continue;}
                    const point={...stable,collectedAt:p.collectedAt,contentSha256:hash};
                    data.versions[k]??={};data.versions[k][hash]??=point;data.current[k]=point;
                    if(previous){counts.corrected++;changes.push({previous,current:point});}else counts.inserted++;
                }
                if(counts.inserted||counts.corrected){data.revision++;await writeFile(temporary,JSON.stringify(data,null,2));await rename(temporary,path);}
                // Consumers must compare archive revision before publication. If notification fails,
                // changed source versions are still durable and a later run can detect the revision.
                if(changes.length)await onCorrection(changes,data.revision);
                return {...counts,revision:data.revision};
            }finally{await lock.close();await unlink(`${path}.lock`);await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
        }};
}
