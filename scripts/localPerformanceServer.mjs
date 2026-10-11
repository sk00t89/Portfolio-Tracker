import express from 'express';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {localCredentials,assertLocalDatabase} from './localPerformanceEnvironment.mjs';
import {createLocalPerformanceClient,verifyLocalPerformanceEnvironment,localLedgerError} from '../src/services/localPerformanceClient.js';
import {createMarketQuoteRoutes} from '../supabase/functions/_shared/marketQuoteRoutes.js';
import {preparePortfolioCsvImport,reconcileManualImportTrades} from '../src/services/portfolioCsvImport.js';
import {syntheticFiles,syntheticCatalog,assertSyntheticFiles,fixtureKey} from './syntheticPortfolioFixtures.mjs';
import {createLocalHistoryRuntime} from './localHistoryRuntime.mjs';

assertLocalDatabase();
const credentials=localCredentials();
const admin=createClient(credentials.url,credentials.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const history=createLocalHistoryRuntime(admin),marketRoute=createMarketQuoteRoutes();
const demo=()=>JSON.parse(readFileSync('supabase-test/demo-users.local','utf8'));
const app=express();app.use(express.json({limit:'128kb'}));
app.use((req,res,next)=>{
    if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:55800')return res.status(403).json({error:'Local test origin required.'});
    next();
});
async function authorize(req) {
    assertLocalDatabase();
    const client=createLocalPerformanceClient(credentials.url,credentials.anonKey,{global:{headers:{Authorization:req.headers.authorization??''}}});
    await verifyLocalPerformanceEnvironment(client);
    const identity=await client.auth.getUser((req.headers.authorization??'').replace(/^Bearer /,''));
    if(identity.error||!demo().users.some(u=>u.id===identity.data.user?.id))throw new Error('Logga in med en syntetisk testanvändare.');
    return identity.data.user.id;
}
const friendly=error=>({
    'Cash differs from journal; reconcile account statement':'Kassan stämmer inte med journalen. Kontrollera kontobesked och eventuella insättningar eller uttag.',
    'Holdings differ from journal; register missing trades':'Innehaven stämmer inte med journalen. Registrera de affärer som saknas innan du importerar igen.',
    'Statement omits journal holdings':'Exporten saknar ett innehav som finns i journalen. Ta med hela kontot.',
    'Transaction reference conflict; reconcile original statement':'En tidigare importerad affär har andra uppgifter. Kontrollera originalunderlaget och rätta affären.',
    'Reload before import':'Portföljen ändrades. Läs in importen igen.',
    'Confirm potentially duplicated manual trade':'En möjlig dubblett behöver stämmas av innan affärsfilen sparas.',
    'Manual trade match changed; reconcile before import':'Den registrerade affären ändrades. Granska kopplingen igen.',
}[error.message]??(error.code?localLedgerError(error).message:error.message));
app.get('/api/local-test/users',(_req,res)=>res.json(demo()));
app.get('/api/local-test/fixtures',(_req,res)=>res.json({files:syntheticFiles,catalog:syntheticCatalog}));
app.post('/api/local-test/import/:action',async(req,res)=>{
    try {
        const userId=await authorize(req);assertSyntheticFiles(req.body.files);
        const input=await history.database.input(userId);
        const plan=reconcileManualImportTrades(preparePortfolioCsvImport(req.body.files,req.body.answers??{},syntheticCatalog),input,req.body.answers??{});
        if(plan.ready&&plan.kind==='opening') {
            plan.priceSources=await Promise.all(plan.positions.map(p=>history.market.price(p,plan.date)));
            plan.fxSources=await Promise.all([...new Set([...plan.positions,...plan.cash].map(p=>p.currency))].filter(c=>c!=='SEK').map(c=>history.market.fx(c,plan.date)));
            const fx=currency=>currency==='SEK'?1:plan.fxSources.find(p=>p.from===currency).rate;
            plan.positions=plan.positions.map(p=>({...p,price:plan.priceSources.find(q=>q.instrumentId===p.instrumentId).price,fxRateToSek:fx(p.currency)}));
            plan.cash=plan.cash.map(c=>({...c,fxRateToSek:fx(c.currency)}));
            plan.valueSek=plan.positions.reduce((sum,p)=>sum+p.quantity*p.price*p.fxRateToSek,0)+plan.cash.reduce((sum,c)=>sum+c.amount*c.fxRateToSek,0);
        }
        if(req.params.action==='preview')return res.json(plan);
        if(req.params.action!=='commit'||!plan.ready)throw new Error('Besvara avstämningsfrågorna innan du sparar.');
        const result=await admin.rpc('commit_local_performance_import',{p_user_id:userId,
            p_import_key:createHash('sha256').update(fixtureKey(req.body.files)).digest('hex'),p_plan:plan,p_revision:input?.revision??null});
        if(result.error)throw result.error;
        let warning;try{await history.update(userId);}catch(error){warning=`Importen är sparad. Historiken behöver kompletteras: ${friendly(error)}`;}
        res.json({...result.data,warning});
    }catch(error){res.status(422).json({error:friendly(error)});}
});
app.post('/api/local-test/recalculate',async(req,res)=>{
    try{const userId=await authorize(req);res.json(await history.update(userId));}
    catch(error){res.status(422).json({error:friendly(error)});}
});
app.get('/api/*path',async(req,res)=>{
    const result=await marketRoute(new URL(req.originalUrl,'http://127.0.0.1:55801'));
    if(!result)return res.status(404).json({error:'Unknown local route'});
    res.status(result.status).json(result.body);
});
let running=false;
async function cycle() {
    if(running)return;running=true;
    try{assertLocalDatabase();for(const user of demo().users) {
        try{const input=await history.database.input(user.id);
            if(input?.baseline?.syntheticPublicDemo===true||input?.baseline?.positions.every(p=>syntheticCatalog.some(i=>i.instrumentId===p.instrumentId)))await history.update(user.id);
        }catch(error){console.log(`Local history pending: ${friendly(error)}`);}
    }}finally{running=false;}
}
// Service processing has no dependency on a user's browser or login session.
setInterval(()=>void cycle().catch(error=>console.log(error.message)),60000).unref();
app.listen(55801,'127.0.0.1',()=>{console.log('LOCAL ONLY API 127.0.0.1:55801. Synthetic CSV and prices; public actual index/FX. Background history enabled locally.');void cycle().catch(error=>console.log(error.message));});
