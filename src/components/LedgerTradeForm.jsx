import { useState } from "react";
import { stockholmDate } from "../utils/calendarDate.js";
import { prepareLedgerTradeDraft } from "../utils/ledgerTradeDraft.js";

// onReview receives an unverified draft and reconciles missing evidence before
// the approved isolated test RPC commits the journal, cash and revision.
export default function LedgerTradeForm({ position, onReview, onDraftChange, disabled = false, today = stockholmDate() }) {
    const [kind, setKind] = useState("BUY");
    const [quantity, setQuantity] = useState("");
    const [price, setPrice] = useState("");
    const [date, setDate] = useState(today);
    const [feeAmount, setFeeAmount] = useState("");
    const [feeCurrency, setFeeCurrency] = useState(position.currency);
    const [funding, setFunding] = useState("existing_cash");
    const [settlement, setSettlement] = useState('currency_cash');
    const [settlementAmountSek, setSettlementAmountSek] = useState('');
    const [error, setError] = useState(null);
    const [reviewing, setBusy] = useState(false);
    const busy = reviewing || disabled;
    return <form className="ledger-trade-form" onInput={()=>onDraftChange?.()} onChange={() => onDraftChange?.()} onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setError(null);
        try {
            const draft = prepareLedgerTradeDraft({ position, kind, quantity, price, date, feeAmount, feeCurrency, funding, settlement, settlementAmountSek });
            if (date > today) throw new Error("Affärsdatum får inte ligga i framtiden.");
            setBusy(true);
            await onReview(draft);
        } catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
    }}>
        <strong>{position.name} · {position.currency}</strong>
        <label>Affär<select value={kind} onChange={event => setKind(event.target.value)} disabled={busy}>
            <option value="BUY">Köp</option><option value="SELL">Sälj</option>
        </select></label>
        <div className="ledger-trade-fields">
            <label>Antal<input type="number" min="0" step="any" required value={quantity} disabled={busy} onChange={event => setQuantity(event.target.value)} /></label>
            <label>Pris per enhet ({position.currency})<input type="number" min="0" step="any" required value={price} disabled={busy} onChange={event => setPrice(event.target.value)} /></label>
            <label>Affärsdatum<input type="date" required max={today} value={date} disabled={busy} onInput={event=>setDate(event.target.value)} onChange={event => setDate(event.target.value)} /></label>
        </div>
        {position.currency !== 'SEK' && <>
            <label>Avräkning<select value={settlement} disabled={busy} onChange={event=>{setSettlement(event.target.value);setFunding('existing_cash');}}>
                <option value="currency_cash">Befintlig kassa i {position.currency}</option>
                <option value="broker_conversion">Mäklaren växlade automatiskt till/från SEK</option>
            </select></label>
            {settlement === 'broker_conversion' && <label>Faktiskt {kind==='BUY'?'draget':'utbetalt'} totalt (SEK)
                <input type="number" min="0" step="any" required value={settlementAmountSek} disabled={busy} onChange={event=>setSettlementAmountSek(event.target.value)}/>
                <small>Ange totalen på avräkningsnotan inklusive avgifter och växling. Ingen referenskurs används.</small>
            </label>}
        </>}
        <details><summary>Avancerat</summary>
        {kind === "BUY" && settlement !== 'broker_conversion' && <label>Betala med<select value={funding} required disabled={busy} onChange={event => setFunding(event.target.value)}>
            <option value="">Välj finansiering</option><option value="existing_cash">Befintlig kassa på kontot</option><option value="external_money">Nya pengar till kontot</option>
        </select></label>}
            {position.currency!=='SEK'&&<label>Avgiftens valuta<select value={feeCurrency} disabled={busy} onChange={event=>setFeeCurrency(event.target.value)}><option>{position.currency}</option><option>SEK</option></select></label>}
            <label>Courtage och avgifter ({feeCurrency})<input type="number" min="0" step="any" value={feeAmount} disabled={busy} onChange={event => setFeeAmount(event.target.value)} /></label>
            <small>Lämna tomt om avgiften är okänd. Ange 0 om affären var avgiftsfri. Okänd avgift behöver stämmas av.</small>
        </details>
        {error && <p className="transaction-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Granskar…" : "Granska affär"}</button>
    </form>;
}
