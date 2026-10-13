import {verifyLocalPerformanceEnvironment,saveLocalLedgerTrade} from './localPerformanceClient.js';

export function createLocalLedgerRuntime(client) {
    return {
        runsTable:'local_performance_runs',
        verify:()=>verifyLocalPerformanceEnvironment(client),
        initializeRpc:'initialize_local_performance_portfolio',
        journalRpc:name=>name,
        saveTrade:(draft,revision,requestId,deposit)=>saveLocalLedgerTrade(client,draft,revision,requestId,deposit),
        async recalculate() {
            await verifyLocalPerformanceEnvironment(client);
            const session=await client.auth.getSession();
            const response=await fetch('/api/local-test/recalculate',{method:'POST',headers:{Authorization:`Bearer ${session.data.session?.access_token}`}});
            const result=await response.json();if(!response.ok)throw new Error(result.error);
        },
    };
}
