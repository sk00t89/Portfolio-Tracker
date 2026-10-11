import {useState} from 'react';
import LedgerTradeForm from './LedgerTradeForm.jsx';

export default function LedgerTradePanel({position,onSave,busy=false}) {
    const [review,setReview]=useState(null),[deposit,setDeposit]=useState(''),[timing,setTiming]=useState(false);
    const [error,setError]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
    const disabled=busy||saving;
    return <div className="transaction-form">
        {position.currency!=='SEK'&&<p>GAV i {position.currency}: {position.averagePrice==null?'saknas':position.averagePrice.toLocaleString('sv-SE')}. GAV i SEK kräver faktisk anskaffningskostnad i SEK.</p>}
        <LedgerTradeForm position={position} disabled={disabled} onDraftChange={()=>{setReview(null);setError('');setMessage('');}}
            onReview={draft=>{setReview({draft,feeRequired:!draft.fee,requestId:crypto.randomUUID()});setDeposit('');setTiming(false);setError('');}}/>
        {review&&<section className="transaction-preview" aria-label="Granska journalförd affär">
            <h3>Bekräfta {review.draft.kind==='BUY'?'köp':'försäljning'}</h3>
            <p>{review.draft.quantity} × {review.draft.unitPrice} {position.currency} · {review.draft.date} · avgift {review.draft.fee?.amount??'okänd'} {review.draft.fee?.currency??review.draft.feeCurrency}</p>
            {review.draft.settlement==='broker_conversion'&&<p>Automatisk växling · faktiskt {review.draft.kind==='BUY'?'draget':'utbetalt'}: {review.draft.settlementAmountSek} SEK inklusive avgifter.</p>}
            {review.feeRequired&&<label>Vilket courtage betalade du? Ange 0 om avgiftsfri.
                <input type="number" min="0" step="any" disabled={disabled} value={review.draft.fee?.amount??''} onChange={event=>{
                    const amount=event.target.value===''?null:Number(event.target.value);
                    if(amount==null||Number.isFinite(amount)&&amount>=0)setReview({...review,requestId:crypto.randomUUID(),draft:{...review.draft,fee:amount==null?null:{amount,currency:review.draft.feeCurrency??position.currency}}});
                }}/></label>}
            {review.draft.funding==='external_money'&&<>
                <label>Faktisk insättning ({position.currency})<input type="number" min="0" step="any" value={deposit} disabled={disabled} onChange={event=>setDeposit(event.target.value)}/></label>
                <label><input type="checkbox" checked={timing} disabled={disabled} onChange={event=>setTiming(event.target.checked)}/>
                    Tidpunkt saknas: använd dagslutsschablon. Avkastningen visas som uppskattad Modified Dietz.</label>
            </>}
            <div className="transaction-preview-actions"><button className="ghost-button" disabled={disabled} onClick={()=>setReview(null)}>Avbryt</button>
                <button className="primary-button" disabled={disabled} onClick={async()=>{
                    setError('');setMessage('');
                    try {
                        const external=review.draft.funding==='external_money';
                        if(!review.draft.fee)throw new Error('Bekräfta courtage under Avancerat, även om avgiften är 0.');
                        if(external&&position.currency!=='SEK')throw new Error('Historisk valuta för insättningen måste verifieras innan denna affär kan sparas.');
                        if(external&&(!(Number(deposit)>0)||!Number.isFinite(Number(deposit))||!timing))throw new Error('Ange faktisk insättning och bekräfta tidsschablonen.');
                        setSaving(true);
                        const result=await onSave(review.draft,review.requestId,external?{amount:Number(deposit),fxRateToSek:1,timingPolicy:'end_of_day_assumption'}:null);
                        setReview(null);setMessage(result?.warning??'Affären är sparad. Kassa, innehav och journal har uppdaterats.');
                    } catch(failure){setError(failure.message);} finally{setSaving(false);}
                }}>{saving?'Sparar…':'Bekräfta affär'}</button></div>
        </section>}
        {error&&<p className="transaction-error" role="alert">{error}</p>}
        {message&&<p className="history-readiness" role="status">{message}</p>}
    </div>;
}
