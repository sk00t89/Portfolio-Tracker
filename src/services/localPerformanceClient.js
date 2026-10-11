import { createClient } from "@supabase/supabase-js";

export function assertLocalPerformanceUrl(value) {
    const url = new URL(value);
    if (url.origin !== "http://127.0.0.1:55321" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Testfunktionen får bara ansluta till lokal Supabase på port 55321.");
    }
}
export function createLocalPerformanceClient(url, key, options = {}) {
    assertLocalPerformanceUrl(url);
    return createClient(url, key, { ...options, auth: { storageKey:"portfolio-performance-local-test", detectSessionInUrl:false,
        persistSession:false, autoRefreshToken:false, ...options.auth } });
}
export async function verifyLocalPerformanceEnvironment(client) {
    const { data, error } = await client.rpc("get_local_performance_environment");
    if (error || data?.environment !== "portfolio-performance-local-test" || data.syntheticOnly !== true) {
        throw new Error("Serverns lokala testidentitet kunde inte verifieras. Inga data ändras.");
    }
}
export function localLedgerError(error) {
    const message=String(error.message??'').toLowerCase();
    if(error.code==='40001')return new Error('Portföljen har ändrats i en annan session. Läs om innan du sparar.');
    if(error.code==='23505'||message.includes('conflict')||message.includes('reused'))return new Error('Affären eller sparförsöket finns redan med andra uppgifter. Läs om och stäm av journalen.');
    if(message.includes('settlement'))return new Error('Bekräfta mäklarens faktiska totala SEK-belopp inklusive avgifter och välj hur affären avräknades.');
    if(message.includes('fx'))return new Error('Historisk valuta för kapitalflödet behöver verifieras.');
    if(message.includes('cash'))return new Error('Kassan saknas eller räcker inte på affärsdatumet. Stäm av kontobeskedet.');
    if(message.includes('fee'))return new Error('Bekräfta courtage, även om det är 0.');
    if(message.includes('position'))return new Error('Försäljningen överstiger innehavet på affärsdatumet.');
    if(message.includes('date')||message.includes('timestamp')||message.includes('history'))return new Error('Välj ett giltigt datum efter öppningsbalansen, senast idag. Bekräfta eventuell tidpunkt.');
    return new Error('Uppgifterna kunde inte sparas. Kontrollera konto, belopp och affärsuppgifter och försök igen.');
}
export async function saveLocalLedgerTrade(client, draft, revision, requestId, deposit = null) {
    await verifyLocalPerformanceEnvironment(client);
    const { data, error } = await client.rpc("register_local_portfolio_trade", {
        p_draft:draft, p_request_id:requestId, p_expected_revision:revision, p_deposit:deposit,
    });
    if (error) {
        throw localLedgerError(error);
    }
    return data;
}
