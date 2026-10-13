import PortfolioSummary from './PortfolioSummary.jsx';
import HoldingsOverview from './HoldingsOverview.jsx';
import {stockholmDate} from '../utils/calendarDate.js';
import {pendingHistoryMessage} from '../utils/localHistoryStatus.js';

export default function LedgerDashboard({userId,input,performance,groupedHoldings,marketRequest,busy,onRecalculate,preferenceScope=`local-test:${userId}`}) {
    const last=input.observations.at(-1);
    const pending=pendingHistoryMessage(input.lastHistoryRun,input.observations,stockholmDate());
    const capital=input.baseline.valueSek+input.events.filter(e=>['DEPOSIT','WITHDRAWAL'].includes(e.kind)&&e.date<=(last?.date??input.baseline.date))
        .reduce((sum,e)=>sum+(e.kind==='DEPOSIT'?1:-1)*e.amount*e.fxRateToSek,0);
    return <div className="dashboard-grid">
        <PortfolioSummary key={userId} preferenceScope={preferenceScope} valueLabel={last?`Dagsvärde ${last.date}`:'Öppningsbalans'} portfolioValue={last?.valueSek??(input.revision===0?input.baseline.valueSek:null)}
            investedCapital={capital} history={{points:[{date:input.baseline.date,valueSek:input.baseline.valueSek},...input.observations.map(o=>({date:o.date,valueSek:o.valueSek}))]}}
            portfolioReturns={performance} today={stockholmDate()} marketRequest={marketRequest}>
            <HoldingsOverview groupedHoldings={groupedHoldings}/>
        </PortfolioSummary>
        <section className="card portfolio-underlying"><h2>Kassa och historik</h2>
            <p>{input.ledgerState.cash.map(c=>`${c.accountId}: ${c.amount.toLocaleString('sv-SE')} ${c.currency}`).join(' · ')}</p>
            <p>{last?`Senaste färdigställda värdering: ${last.date}.`:'Dagsvärderingar saknas.'} Dagens affärer ingår efter dagsavstämning.</p>
            {performance.available===false&&<p className="history-readiness" role="status">{performance.reason}</p>}
            {pending&&<p className="history-readiness" role="status">{pending}</p>}
            <button className="ghost-button" disabled={busy} onClick={onRecalculate}>Uppdatera historik</button>
        </section>
    </div>;
}
