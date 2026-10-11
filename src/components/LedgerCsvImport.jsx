import {useEffect,useState} from 'react';
import {importReconciliationSummary} from '../utils/importReconciliationSummary.js';

export default function LedgerCsvImport({client,onImported,busy,onWorking}) {
    const [fixtures,setFixtures]=useState([]),[files,setFiles]=useState([]),[answers,setAnswers]=useState({}),[plan,setPlan]=useState(null);
    const [working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
    const [reviewed,setReviewed]=useState('');
    const [advanced,setAdvanced]=useState(false);
    const isOpeningFile=file=>/^(?:Namn[;\t]|Konto;(?:Valuta|ISIN))/.test(file.text.replace(/^\uFEFF/,''));
    useEffect(()=>{onWorking?.(working);return()=>onWorking?.(false);},[working,onWorking]);
    useEffect(()=>{let active=true;fetch('/api/local-test/fixtures').then(r=>r.json()).then(data=>{if(active)setFixtures(data.files);}).catch(()=>{if(active)setError('Starta den lokala testservern.');});return()=>{active=false;};},[]);
    const request=async action=>{
        setWorking(true);setError('');setMessage('');
        try {
            const session=await client.auth.getSession();
            const response=await fetch(`/api/local-test/import/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session?.access_token}`},body:JSON.stringify({files,answers})});
            const data=await response.json();if(!response.ok)throw new Error(data.error);
            if(action==='preview'){setPlan(data);setReviewed(JSON.stringify({files,answers}));}
            else{await onImported();setPlan(null);setMessage(data.warning??(data.duplicate?'Filen är redan importerad. Inga dubbletter skapades.':'Importen är sparad och historiken är uppdaterad.'));}
        }catch(failure){setError(failure.message);}finally{setWorking(false);}
    };
    const disabled=busy||working;
    return <section>
        <h2>Importera innehav eller affärer</h2>
        <p>Starta med innehav och avstämd kassa. Grafen börjar på 0 % från öppningsbalansen; gamla affärer behövs inte. Registrera nya köp och försäljningar under Innehav. Här används endast syntetiska Avanza-, Nordnet- och Lysa-filer. Verkliga portföljfiler accepteras inte i denna testmiljö.</p>
        <button className="ghost-button" disabled={disabled||!fixtures.length} onClick={()=>{setPlan(null);setFiles(fixtures.filter(isOpeningFile));}}>Välj hela syntetiska startpaketet</button>
        <p>Startpaketet innehåller aktier, fonder, Lysa-andelar, kryptocertifikat och separat kassa. Alla uppgifter är fiktiva.</p>
        {fixtures.filter(file=>advanced||isOpeningFile(file)).map(file=><label key={file.name} style={{display:'block'}}><input type="checkbox" disabled={disabled} checked={files.some(f=>f.name===file.name)} onChange={event=>{setPlan(null);setFiles(event.target.checked?[...files,file]:files.filter(f=>f.name!==file.name));}}/> {file.name}
            {' '}<a download={file.name} href={`data:text/plain;charset=utf-8,${encodeURIComponent(file.text)}`}>Hämta testfil</a></label>)}
        <label style={{display:'block'}}><input type="checkbox" disabled={disabled} checked={advanced} onChange={event=>setAdvanced(event.target.checked)}/> Visa äldre testfiler och valfri affärsimport</label>
        <label>Läs testfiler från datorn <input type="file" multiple accept=".csv,.tsv" disabled={disabled} onChange={async event=>{
            const selected=[...event.target.files];setPlan(null);setFiles(await Promise.all(selected.map(async file=>({name:file.name,text:await file.text()}))));
        }}/></label>
        {plan?.questions.map(q=><label key={q.key} style={{display:'block'}}>{q.label}{q.type==='confirm'?
            <input type="checkbox" disabled={disabled} checked={answers[q.key]===true} onChange={e=>setAnswers({...answers,[q.key]:e.target.checked})}/>:
            q.type==='select'?<select disabled={disabled} value={answers[q.key]??''} onChange={e=>setAnswers({...answers,[q.key]:e.target.value})}><option value="">{q.key.startsWith('instrument:')?'Välj värdepapper':'Välj alternativ'}</option>{q.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
                <input disabled={disabled} type={q.type} min={q.type==='number'?'0':undefined} step="any" value={answers[q.key]??''} onInput={e=>setAnswers({...answers,[q.key]:e.target.value})} onChange={e=>setAnswers({...answers,[q.key]:e.target.value})}/>}</label>)}
        {plan?.ready&&<p>{plan.kind==='opening'?`${plan.positions.length} innehav · ${plan.date} · inklusive kassa ${plan.valueSek.toLocaleString('sv-SE')} SEK. Avkastningen börjar på 0 %.`:`${plan.events.length} affärer. Tidigare referenser dubbelregistreras inte.`}</p>}
        {plan?.kind==='opening'&&plan.ready&&<div>
            <h3>Stäm av före import</h3>
            <p>Jämför varje konto med kontobeskedet för {plan.date}. Kassa och innehav ska vara kompletta för samma datum. Tidigare GAV påverkar inte grafens start på 0 %.</p>
            {importReconciliationSummary(plan).map(account=><div key={account.accountId}>
                <strong>{account.accountId}</strong>
                <ul>{account.positions.map(p=><li key={p.instrumentId}>{p.name}: {p.quantity.toLocaleString('sv-SE')} · {p.currency}</li>)}</ul>
                <p>Kassa: {account.cash.map(c=>`${c.amount.toLocaleString('sv-SE')} ${c.currency}`).join(' · ')}</p>
                {account.missingCost>0&&<p>Anskaffningsvärde saknas för {account.missingCost} innehav. GAV kan kompletteras senare; den avstämda öppningsvärderingen används för avkastningen.</p>}
            </div>)}
        </div>}
        <button className="primary-button" disabled={disabled||!files.length} onClick={()=>request('preview')}>Granska import</button>
        {plan?.ready&&reviewed===JSON.stringify({files,answers})&&<button className="primary-button" disabled={disabled} onClick={()=>request('commit')}>Bekräfta import</button>}
        {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    </section>;
}
