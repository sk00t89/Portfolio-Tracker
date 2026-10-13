// Offline by default. Starting against cloud requires a separate explicit approval.
import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {syntheticFiles,syntheticCatalog,assertSyntheticFiles,fixtureKey} from './syntheticPortfolioFixtures.mjs';
import {createSyntheticHistoryRuntime} from './localHistoryRuntime.mjs';
import {preparePortfolioCsvImport,reconcileManualImportTrades} from '../src/services/portfolioCsvImport.js';
import {createMarketQuoteRoutes} from '../supabase/functions/_shared/marketQuoteRoutes.js';
import {STAGING_URL,verifyStagingRuntime} from '../src/services/stagingPortfolioClient.js';
import {localLedgerError} from '../src/services/localPerformanceClient.js';

export function createStagingAppServer({admin,authenticate,history,marketRoute=createMarketQuoteRoutes()}) {
    const app=express();app.use(express.json({limit:'128kb'}));
    app.use((req,res,next)=>{
        if(req.headers.origin!=='http://127.0.0.1:55810')return res.status(403).json({error:'Endast stagingappen tillåts.'});
        res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:55810');res.setHeader('Vary','Origin');
        res.setHeader('Cache-Control','no-store');
        if(req.method==='OPTIONS'){
            res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST');return res.sendStatus(204);
        }
        next();
    });
    app.use(async(req,res,next)=>{
        try {await verifyStagingRuntime(admin);req.owner=await authenticate(req.headers.authorization);next();}
        catch {res.status(401).json({error:'Verifiera inloggningen och den syntetiska stagingmiljön.'});}
    });
    app.get('/fixtures',(_req,res)=>res.json({files:syntheticFiles,catalog:syntheticCatalog}));
    app.post('/import/:action',async(req,res)=>{
        try {
            if(!['preview','commit'].includes(req.params.action))throw new Error('Invalid import action');
            assertSyntheticFiles(req.body.files);
            if(Object.keys(req.body).some(key=>!['files','answers'].includes(key)))throw new Error('Invalid import fields');
            const userId=req.owner,input=await history.database.input(userId);
            const plan=reconcileManualImportTrades(preparePortfolioCsvImport(req.body.files,req.body.answers??{},syntheticCatalog),input,req.body.answers??{});
            if(plan.ready&&plan.kind==='opening') {
                plan.priceSources=await Promise.all(plan.positions.map(p=>history.market.price(p,plan.date)));
                plan.fxSources=await Promise.all([...new Set([...plan.positions,...plan.cash].map(p=>p.currency))].filter(c=>c!=='SEK').map(c=>history.market.fx(c,plan.date)));
                const fx=currency=>currency==='SEK'?1:plan.fxSources.find(p=>p.from===currency).rate;
                plan.positions=plan.positions.map(p=>({...p,price:plan.priceSources.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:fx(p.currency)}));
                plan.cash=plan.cash.map(c=>({...c,fxRateToSek:fx(c.currency)}));
                plan.valueSek=plan.positions.reduce((s,p)=>s+p.quantity*p.price*p.fxRateToSek,0)+plan.cash.reduce((s,c)=>s+c.amount*c.fxRateToSek,0);
            }
            if(req.params.action==='preview')return res.json(plan);
            if(!plan.ready)throw new Error('Incomplete reconciliation');
            const result=await admin.rpc('commit_staging_performance_import',{p_user_id:userId,p_import_key:createHash('sha256').update(fixtureKey(req.body.files)).digest('hex'),p_plan:plan,p_revision:input?.revision??null});
            if(result.error)throw result.error;
            let warning;try{await history.update(userId);}catch{warning='Importen är sparad. Historiken saknar fullständigt kursunderlag; försök uppdatera igen.';}
            res.json({...result.data,warning});
        }catch(error){res.status(422).json({error:error.code?localLedgerError(error).message:'Kontrollera testfiler och avstämning. Endast det syntetiska startpaketet kan importeras.'});}
    });
    app.post('/recalculate',async(req,res)=>{
        try {if(Object.keys(req.body??{}).length)throw new Error('No caller-selected owner/date');res.json(await history.update(req.owner));}
        catch{res.status(422).json({error:'Historiken kunde inte verifieras. Senast verifierade värderingar behålls; inga kurser fylls i.'});}
    });
    app.get(['/api/index-history','/api/index-fx-history'],async(req,res)=>{
        try{const result=await marketRoute(new URL(req.originalUrl,'http://127.0.0.1:55811'));
            if(!result)return res.status(404).json({error:'Indexkälla saknas.'});res.status(result.status).json(result.body);}
        catch{res.status(503).json({error:'Verifierad index- eller valutahistorik saknas.'});}
    });
    return app;
}

export function assertStagingServerEnvironment(env) {
    if(env.PORTFOLIO_STAGING_URL!==STAGING_URL||!env.PORTFOLIO_STAGING_ANON_KEY||!env.PORTFOLIO_STAGING_SERVICE_KEY)
        throw new Error('Exact staging URL and private staging process keys required.');
    if(env.PORTFOLIO_STAGING_SERVICE_KEY===env.PORTFOLIO_STAGING_ANON_KEY)throw new Error('Separate service and public keys required.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
    if(process.argv.length===2||process.argv[2]==='--plan') {
        console.log('OFFLINE PLAN: fixed staging project, loopback 55811, manual dated synthetic history only. Starting requires --run-approved and a new user approval. No keys read or network used.');
    } else if(process.argv.length===3&&process.argv[2]==='--run-approved') {
        assertStagingServerEnvironment(process.env);
        const fetcher=(url,options)=>{
            if(new URL(url).origin!==STAGING_URL)throw new Error('Non-staging request refused');
            return fetch(url,{...options,redirect:'error'});
        };
        const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}};
        const admin=createClient(STAGING_URL,process.env.PORTFOLIO_STAGING_SERVICE_KEY,options);
        const client=createClient(STAGING_URL,process.env.PORTFOLIO_STAGING_ANON_KEY,options);
        await verifyStagingRuntime(admin);
        const authenticate=async authorization=>{
            if(!authorization?.startsWith('Bearer '))throw new Error('Session required');
            const {data,error}=await client.auth.getUser(authorization.slice(7));
            if(error||!data.user?.email?.endsWith('@portfolio-test.invalid')||data.user.app_metadata?.portfolio_staging_synthetic!==true)throw new Error('Synthetic account required');
            return data.user.id;
        };
        const history=createSyntheticHistoryRuntime(admin,{staging:true,now:Date.parse('2026-10-10T12:00:00Z')});
        createStagingAppServer({admin,authenticate,history}).listen(55811,'127.0.0.1',()=>console.log('Staging test API listening on loopback. No scheduler. Synthetic scenario ends 2026-10-09.'));
    } else throw new Error('Only --plan or separately approved --run-approved supported');
}
