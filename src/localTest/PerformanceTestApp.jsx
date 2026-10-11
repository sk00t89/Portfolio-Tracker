import {useEffect,useState} from 'react';
import {Routes,Route,Link} from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Holdings from '../pages/Holdings.jsx';
import ImportPage from '../pages/ImportPage.jsx';
import Help from '../pages/Help.jsx';
import LedgerTradePanel from '../components/LedgerTradePanel.jsx';
import LedgerCsvImport from '../components/LedgerCsvImport.jsx';
import LedgerJournalTools from '../components/LedgerJournalTools.jsx';
import useLedgerPortfolio from '../hooks/useLedgerPortfolio.js';
import {createLocalPerformanceClient,verifyLocalPerformanceEnvironment} from '../services/localPerformanceClient.js';
import {performanceFromStoredInput} from '../services/portfolioPerformance.js';
import {ledgerPortfolioHoldings} from '../utils/ledgerPortfolioView.js';

const marketRequest=(url,options)=>fetch(url,options);

function PortfolioWorkspace({client,user,onBusy}) {
    const ledger=useLedgerPortfolio(client,user.id);
    const {input,busy,error}=ledger;
    const [importBusy,setImportBusy]=useState(false);
    useEffect(()=>{onBusy(busy||importBusy);return()=>onBusy(false);},[busy,importBusy,onBusy]);
    const groups=ledgerPortfolioHoldings(input);
    const openingImport=<LedgerCsvImport client={client} onImported={ledger.reload} busy={busy} onWorking={setImportBusy}/>;
    const history=input?.baseline?<LedgerJournalTools input={input} busy={busy} onMutate={ledger.mutateJournal}/>:null;
    const holdings=<><Holdings groupedHoldings={groups} possibleMatches={[]} portfolioValue={input?.observations.at(-1)?.valueSek??0}
        journalManaged renderTransactionForm={position=><LedgerTradePanel key={position.id} position={position} busy={busy} onSave={ledger.saveTrade}/>}/>
        <p className="history-readiness">Kassa: {input?.ledgerState?.cash.map(c=>`${c.amount.toLocaleString('sv-SE')} ${c.currency}`).join(' · ')}.
            Innehavens visningsvärden använder senast sparade {input?.baseline?.syntheticPublicDemo?'verifierade publika':'syntetiska'} kurser. GAV räknas om från känt anskaffningsvärde och nya affärer och påverkar inte grafens startpunkt. GAV i SEK saknas om faktisk anskaffningskostnad i SEK inte är känd.</p>{history}</>;
    return <>
        {error&&<p className="history-readiness" role="alert">{error}</p>}
        {busy&&<p className="history-readiness" role="status">Sparar eller värderar lokal journal…</p>}
        {!input&&<p role="status">Läser journal och historik…</p>}
        {input&&!input.baseline&&<p className="history-readiness">Öppningsbalans saknas. <Link to="/import">Importera startinnehav</Link> innan jämförelsen kan börja.</p>}
        <Routes>
            <Route path="/" element={input?.baseline?<Dashboard ledgerPortfolio={{userId:user.id,input,performance:performanceFromStoredInput(input),
                groupedHoldings:groups,marketRequest,busy,onRecalculate:ledger.updateHistory}}/>:<ImportPage openingImport={openingImport}/>}/>
            <Route path="/holdings" element={input?.baseline?holdings:<ImportPage openingImport={openingImport}/>}/>
            <Route path="/import" element={<ImportPage openingImport={openingImport}/>}/>
            <Route path="/help" element={<Help/>}/>
            <Route path="/settings" element={<main className="page"><div className="page-heading"><h1>Inställningar</h1></div>
                <section className="card portfolio-underlying"><p>Isolerad lokal journal · endast syntetiska data.</p>
                    <button className="primary-button" disabled={busy||!input?.baseline} onClick={ledger.updateHistory}>Uppdatera historik</button>
                    <p>Index visas med verkliga historiska kurser. Dagens affärer ingår efter dagsavstämning. Produktion är inte aktiverad.</p></section></main>}/>
            <Route path="*" element={<p><Link to="/">Till dashboard</Link></p>}/>
        </Routes>
    </>;
}

export default function PerformanceTestApp(){
    const [client]=useState(()=>createLocalPerformanceClient(import.meta.env.VITE_LOCAL_TEST_SUPABASE_URL,import.meta.env.VITE_LOCAL_TEST_SUPABASE_KEY,
        {auth:{persistSession:true,autoRefreshToken:true}}));
    const [users,setUsers]=useState(null),[user,setUser]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ledgerBusy,setLedgerBusy]=useState(false);
    const [theme,setTheme]=useState(()=>localStorage.getItem('theme')??'dark');
    useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('theme',theme);},[theme]);
    useEffect(()=>{let active=true;(async()=>{try{
        await verifyLocalPerformanceEnvironment(client);const response=await fetch('/api/local-test/users');
        if(!response.ok)throw new Error('Starta den lokala testservern.');
        const data=await response.json();const session=await client.auth.getSession();
        if(active){setUsers(data);setUser(data.users.find(u=>u.id===session.data.session?.user.id)??null);}
    }catch(failure){if(active)setError(failure.message);}})();return()=>{active=false;};},[client]);
    const logout=async()=>{await client.auth.signOut();setUser(null);};
    return <div className="app-shell">
        <Navbar session={user?{user}:null} theme={theme} onToggleTheme={()=>setTheme(theme==='dark'?'light':'dark')} onLogout={logout} logoutDisabled={busy||ledgerBusy}/>
        <div>
            <section className="card portfolio-underlying" aria-label="Isolerad lokal testmiljö">
                <strong>Lokal testmiljö · syntetisk portfölj</strong>
                <p>Befintlig appdesign och navigation. Konton, antal, kassa och affärer är fiktiva. Testkonton märkta public-demo använder verifierade publika kurser; övriga portföljkurser är syntetiska. Index och historisk indexvaluta hämtas från publika källor. Ingen produktionsanslutning.</p>
                <label>Testanvändare <select aria-label="Testanvändare" disabled={busy||ledgerBusy||!users} value={user?.id??''} onChange={async event=>{
                    const selected=users.users.find(u=>u.id===event.target.value);setBusy(true);setError('');
                    try{await logout();if(selected){const login=await client.auth.signInWithPassword({email:selected.email,password:users.password});
                        if(login.error)throw login.error;setUser(selected);}}catch(failure){setError(failure.message);}finally{setBusy(false);}
                }}><option value="">Välj användare</option>{users?.users.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></label>
                {error&&<p role="alert">{error}</p>}
            </section>
            {user&&<PortfolioWorkspace key={user.id} client={client} user={user} onBusy={setLedgerBusy}/>}
        </div>
    </div>;
}
