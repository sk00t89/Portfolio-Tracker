import {useState} from 'react';
import {stockholmDate} from '../utils/calendarDate.js';

export default function LedgerJournalTools({input,busy,onMutate}) {
    const [kind,setKind]=useState('DEPOSIT'),[account,setAccount]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(stockholmDate());
    const [timing,setTiming]=useState(false),[editing,setEditing]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState('');
    const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
    const accounts=input.baseline.cash.filter(c=>c.currency==='SEK');
    const change=()=>{setRequestId(crypto.randomUUID());setError('');setMessage('');};
    const save=async(name,args)=>{
        setError('');try{setMessage(await onMutate(name,{...args,p_request_id:requestId}));setRequestId(crypto.randomUUID());setEditing(null);}
        catch(failure){setError(failure.message==='Missing or insufficient verified cash'?'Kassan räcker inte på affärsdatumet. Kontrollera kontobeskedet.':failure.message);}
    };
    return <section className="card portfolio-underlying"><h2>Kassa och journal</h2>
        <details><summary>Registrera insättning, uttag eller utdelning</summary>
            <form onInput={change} onChange={change} onSubmit={event=>{event.preventDefault();if(['DEPOSIT','WITHDRAWAL'].includes(kind)&&!timing){setError('Bekräfta tidsantagandet. Värdering vid den faktiska insättningen saknas.');return;}
                void save('register_local_portfolio_cash',{p_draft:{kind,accountId:account||accounts[0]?.accountId,currency:'SEK',amount:Number(amount),date,timingPolicy:'end_of_day_assumption'}});}}>
                <label>Händelse<select disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="DEPOSIT">Insättning</option><option value="WITHDRAWAL">Uttag</option><option value="DIVIDEND">Utdelning</option><option value="INTEREST">Ränta</option><option value="FEE">Avgift</option></select></label>
                <label>Konto<select disabled={busy} value={account||accounts[0]?.accountId||''} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a.accountId}>{a.accountId}</option>)}</select></label>
                <label>Belopp (SEK)<input disabled={busy} type="number" min="0" step="any" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
                <label>Datum<input disabled={busy} type="date" max={stockholmDate()} required value={date} onInput={e=>setDate(e.target.value)} onChange={e=>setDate(e.target.value)}/></label>
                {['DEPOSIT','WITHDRAWAL'].includes(kind)&&<label><input disabled={busy} type="checkbox" checked={timing} onChange={e=>setTiming(e.target.checked)}/> Tidpunkt saknas: använd dagslutsschablon och visa avkastningen som uppskattad Modified Dietz.</label>}
                <button className="primary-button" disabled={busy||!accounts.length}>Spara kassahändelse</button>
            </form>
        </details>
        <ul>{input.events.map(event=><li key={event.id}>{event.date} · {event.kind} · {event.quantity??''} · {event.amount} {event.currency}
            {['BUY','SELL'].includes(event.kind)&&<button className="ghost-button" disabled={busy} onClick={()=>{change();setEditing({...event});}}>Rätta affär</button>}</li>)}</ul>
        {editing&&<form onInput={change} onChange={change} onSubmit={event=>{event.preventDefault();void save('correct_local_portfolio_trade',{p_event_id:editing.id,p_patch:{quantity:Number(editing.quantity),unitPrice:Number(editing.unitPrice),date:editing.date,fee:editing.fee,
            ...(editing.settlement==='broker_conversion'?{settlementAmountSek:Number(editing.settlementAmountSek)}:{})}});}}>
            <p>Rättelsen räknar om historiken och bevarar tidigare revisioner.</p>
            <label>Antal<input disabled={busy} required type="number" min="0" step="any" value={editing.quantity} onChange={e=>setEditing({...editing,quantity:e.target.value})}/></label>
            <label>Pris<input disabled={busy} required type="number" min="0" step="any" value={editing.unitPrice} onChange={e=>setEditing({...editing,unitPrice:e.target.value})}/></label>
            <label>Affärsdatum<input disabled={busy} required type="date" max={stockholmDate()} value={editing.date} onInput={e=>setEditing({...editing,date:e.target.value})} onChange={e=>setEditing({...editing,date:e.target.value})}/></label>
            <label>Courtage<input disabled={busy} required type="number" min="0" step="any" value={editing.fee.amount} onChange={e=>setEditing({...editing,fee:{...editing.fee,amount:Number(e.target.value)}})}/></label>
            {editing.settlement==='broker_conversion'&&<label>Bekräfta rättat faktiskt totalbelopp (SEK)<input disabled={busy} required type="number" min="0" step="any" value={editing.settlementAmountSek} onChange={e=>setEditing({...editing,settlementAmountSek:e.target.value})}/></label>}
            <button className="primary-button" disabled={busy}>Spara rättelse</button><button type="button" className="ghost-button" disabled={busy} onClick={()=>setEditing(null)}>Avbryt</button>
        </form>}
        {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    </section>;
}
