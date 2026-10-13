import {useEffect,useState} from 'react';
import {Routes,Route,Link} from 'react-router-dom';
import NavigationLinks from '../components/NavigationLinks.jsx';
import LedgerDashboard from '../components/LedgerDashboard.jsx';
import LedgerCsvImport from '../components/LedgerCsvImport.jsx';
import LedgerTradePanel from '../components/LedgerTradePanel.jsx';
import LedgerJournalTools from '../components/LedgerJournalTools.jsx';
import useLedgerPortfolio from '../hooks/useLedgerPortfolio.js';
import {ledgerPortfolioHoldings} from '../utils/ledgerPortfolioView.js';
import {performanceFromStoredInput} from '../services/portfolioPerformance.js';
import {createStagingPortfolioClient,createStagingTransports,verifyStagingRuntime,STAGING_REF} from '../services/stagingPortfolioClient.js';

function Workspace({client,user,transports,onBusy}) {
    const ledger=useLedgerPortfolio(client,user.id,transports.runtime);
    const [importBusy,setImportBusy]=useState(false);
    useEffect(()=>{onBusy(ledger.busy||importBusy);return()=>onBusy(false);},[onBusy,ledger.busy,importBusy]);
    const {input,busy,error}=ledger,groups=ledgerPortfolioHoldings(input);
    const opening=<LedgerCsvImport client={client} transport={transports.importTransport} onImported={ledger.reload} busy={busy} onWorking={setImportBusy}/>;
    return <main className="page">
        {error&&<p role="alert">{error}</p>}
        {!input&&<p role="status">Läser journal och historik…</p>}
        {input&&!input.baseline&&<p>Öppningsbalans saknas. <Link to="/import">Importera syntetiska startinnehav</Link>.</p>}
        <Routes>
            <Route path="/" element={input?.baseline?<LedgerDashboard userId={user.id} input={input} performance={performanceFromStoredInput(input)}
                groupedHoldings={groups} marketRequest={transports.marketRequest} busy={busy} onRecalculate={ledger.updateHistory}
                preferenceScope={`staging:${STAGING_REF}:${user.id}`}/>:opening}/>
            <Route path="/import" element={<section className="card">{opening}</section>}/>
            <Route path="/holdings" element={input?.baseline?<>
                <h1>Innehav</h1>{groups.map(group=><section className="card" key={group.id}>
                    <h2>{group.name}</h2><p>{group.positions[0].accountId} · {group.positions[0].quantity} st</p>
                    <details><summary>Registrera köp eller försäljning</summary>
                        <LedgerTradePanel position={group.positions[0]} busy={busy} onSave={ledger.saveTrade}/>
                    </details></section>)}
                <LedgerJournalTools input={input} busy={busy} onMutate={ledger.mutateJournal}/>
            </>:opening}/>
            <Route path="*" element={<p><Link to="/">Till dashboard</Link>. Staging visar endast import, innehav och historik.</p>}/>
        </Routes>
    </main>;
}

export default function StagingApp() {
    const [setup]=useState(()=>{
        try{const client=createStagingPortfolioClient(import.meta.env,window.location.origin);return {client,transports:createStagingTransports(client)};}
        catch(error){return {error:error.message};}
    });
    const [user,setUser]=useState(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
    const [error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[ledgerBusy,setLedgerBusy]=useState(false);
    const [theme,setTheme]=useState(()=>localStorage.getItem('staging-theme')??'dark');
    useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('staging-theme',theme);},[theme]);
    useEffect(()=>{
        if(!setup.client)return;
        let active=true;
        const check=async session=>{
            try{await verifyStagingRuntime(setup.client);if(active){setUser(session?.user??null);setReady(true);setError('');}}
            catch(failure){if(active){setReady(false);setUser(null);setError(failure.message);}}
        };
        const {data}=setup.client.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>{if(active)void check(session);});});
        return()=>{active=false;data.subscription.unsubscribe();};
    },[setup]);
    const login=async event=>{
        event.preventDefault();setBusy(true);setError('');
        try{await verifyStagingRuntime(setup.client);const result=await setup.client.auth.signInWithPassword({email,password});
            setPassword('');if(result.error)throw new Error('Inloggningen misslyckades. Kontrollera ditt syntetiska stagingkonto.');}
        catch(failure){setError(failure.message);}finally{setBusy(false);}
    };
    const logout=async()=>{setBusy(true);const result=await setup.client.auth.signOut();setBusy(false);
        if(result.error)setError('Utloggningen misslyckades. Försök igen.');else setUser(null);};
    return <div className="app-shell">
        <nav className="nav-bar" aria-label="Huvudnavigation"><div className="nav-brand">Portfolio Tracker</div>
            <NavigationLinks/><div className="nav-actions">
                <button className="theme-toggle" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>Byt tema</button>
                {user&&<button disabled={busy||ledgerBusy} onClick={logout}>Logga ut</button>}
            </div></nav>
        <section className="card portfolio-underlying"><strong>Staging · endast syntetisk portfölj</strong>
            <p>Konton, innehav, portföljkurser och valuta är testdata. Daterat scenario 4–9 oktober 2026.
                Index kan använda verkliga publika kurser; jämförelsen demonstrerar funktionen och är inte faktisk portföljavkastning.
                Saknade datum fylls aldrig med påhittade kurser. Inga automatiska jobb är aktiverade.</p>
            {(setup.error||error)&&<p role="alert">{setup.error||error}</p>}
        </section>
        {ready&&!user&&<main className="page"><form className="card" onSubmit={login}>
            <h1>Logga in i staging</h1>
            <label>E-post<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
            <label>Lösenord<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <button className="primary-button" disabled={busy}>Logga in</button>
            <p>Endast separat godkända syntetiska testkonton. Ingen publik registrering.</p>
        </form></main>}
        {ready&&user&&<Workspace key={user.id} client={setup.client} user={user} transports={setup.transports} onBusy={setLedgerBusy}/>}
    </div>;
}
