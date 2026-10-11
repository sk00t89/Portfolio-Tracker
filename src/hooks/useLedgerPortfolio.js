import {useEffect,useState,useCallback,useRef} from 'react';
import {verifyLocalPerformanceEnvironment,saveLocalLedgerTrade,localLedgerError} from '../services/localPerformanceClient.js';

export default function useLedgerPortfolio(client,userId) {
    const [input,setInput]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const epoch=useRef(0);
    const read=useCallback(async()=>{
        const identity=await client.auth.getUser();
        if(identity.error||identity.data.user?.id!==userId)throw new Error('Sessionen har ändrats. Logga in igen.');
        const result=await client.rpc('get_portfolio_performance_input');if(result.error)throw result.error;
        const run=result.data?.baseline?await client.from('local_performance_runs').select('status,reason,valuation_date').eq('user_id',userId).eq('revision',result.data.revision).order('valuation_date',{ascending:false}).limit(1):null;
        const after=await client.auth.getUser();
        if(after.error||after.data.user?.id!==userId)throw new Error('Sessionen ändrades under läsningen.');
        return result.data?{...result.data,lastHistoryRun:run?.data?.[0]??null}:{baseline:null,events:[],observations:[]};
    },[client,userId]);
    const reload=useCallback(async()=>{const started=++epoch.current;const result=await read();if(started===epoch.current)setInput(result);return result;},[read]);
    useEffect(()=>{
        let active=true,reading=false;
        const refresh=async()=>{if(reading)return;reading=true;const started=epoch.current;try{const result=await read();if(active&&started===epoch.current){setInput(result);setError('');}}
            catch(failure){if(active)setError(failure.message);}finally{reading=false;}};
        void refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);
        return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
    },[read]);
    const recalculate=async()=>{
        await verifyLocalPerformanceEnvironment(client);
        const session=await client.auth.getSession();
        const response=await fetch('/api/local-test/recalculate',{method:'POST',headers:{Authorization:`Bearer ${session.data.session?.access_token}`}});
        const result=await response.json();if(!response.ok)throw new Error(result.error);await reload();
    };
    const saveTrade=async(draft,requestId,deposit)=>{
        if(busy||!input?.baseline)throw new Error('Läs in portföljen innan du sparar.');
        setBusy(true);setError('');
        try{
            const identity=await client.auth.getUser();if(identity.error||identity.data.user?.id!==userId)throw new Error('Sessionen har ändrats. Logga in igen.');
            const saved=await saveLocalLedgerTrade(client,draft,input.revision,requestId,deposit);
            epoch.current++;
            setInput(current=>({...current,revision:saved.revision,ledgerState:saved.ledgerState,
                displayCostInvalidated:true,
                displayPriceSources:current.observations.at(-1)?.priceSources??current.displayPriceSources,
                displayFxSources:current.observations.at(-1)?.fxSources??current.displayFxSources,observations:[]}));
            try{await reload();await recalculate();return {};}
            catch(failure){return {warning:`Affären är sparad. Historiken kunde inte uppdateras: ${failure.message} Försök med Uppdatera historik.`};}
        }catch(failure){
            epoch.current++;
            try{await reload();}catch{/* Retain request-id in the review for a safe retry. */}
            throw failure;
        }finally{setBusy(false);}
    };
    const initialize=async(baseline)=>{
        setBusy(true);setError('');
        try{await verifyLocalPerformanceEnvironment(client);const result=await client.rpc('initialize_local_performance_portfolio',{p_baseline:baseline});
            if(result.error)throw result.error;await reload();await recalculate();}
        catch(failure){setError(failure.message);}finally{setBusy(false);}
    };
    const updateHistory=async()=>{setBusy(true);setError('');try{await recalculate();}catch(failure){setError(failure.message);}finally{setBusy(false);}};
    const mutateJournal=async(name,args)=>{
        if(busy||!input?.baseline)throw new Error('Läs in portföljen innan du sparar.');
        setBusy(true);setError('');
        try {
            await verifyLocalPerformanceEnvironment(client);
            const result=await client.rpc(name,{...args,p_expected_revision:input.revision});if(result.error)throw localLedgerError(result.error);
            epoch.current++;await reload();
            try{await recalculate();return 'Sparat. Historiken har räknats om.';}
            catch(failure){return `Sparat. Historiken behöver uppdateras: ${failure.message}`;}
        }catch(failure){epoch.current++;try{await reload();}catch{/* Preserve the original save error. */}throw failure;}
        finally{setBusy(false);}
    };
    return {input,error,busy,saveTrade,initialize,updateHistory,reload,mutateJournal};
}
