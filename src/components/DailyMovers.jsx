import { calculateDailyMovers } from "../utils/dashboardHistory.js";
import { formatSek } from "../utils/formatting.js";
import { dailyMissingReasons } from "../../supabase/functions/_shared/marketCalendar.js";

export default function DailyMovers({ holdings, formatMoney, currency, now }) {
    const { best, worst, excluded } = calculateDailyMovers(holdings, now);
    const reasons = excluded > 0 ? dailyMissingReasons(holdings, now) : [];
    return <section className="card daily-movers-card">
        <div className="section-heading"><div><span className="eyebrow">Påverkan på portföljen</span><h2>Dagens förändring</h2></div></div>
        {excluded > 0 && <p className="history-note">Ofullständigt underlag · {excluded} instrument exkluderade.</p>}
        <div className="daily-movers-grid">
            {[["Bäst idag", best, "positive-text"], ["Sämst idag", worst, "negative-text"]].map(([label, items, className]) =>
                <div key={label}><h3>{label}</h3>{items.length ? items.map((item) =>
                    <div className="daily-mover-row" key={item.instrumentKey}>
                        <div><strong>{item.name}</strong><span className="muted">{item.positions.length} positioner</span></div>
                        <div className={className}>
                            <strong>{item.changeSek > 0 ? "+" : ""}{formatSek(item.changeSek)}</strong>
                            <span>{item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(2)} %</span>
                            {currency !== "SEK" && <span>{item.changeSek > 0 ? "+" : ""}{formatMoney(item.changeSek)}</span>}
                        </div>
                    </div>) : <p>Inga {label === "Bäst idag" ? "positiva" : "negativa"} bidrag med kompletta dagskurser.</p>}</div>)}
        </div>
        <details className="portfolio-daily-coverage"><summary>Om dagens rangordning</summary>{reasons.length > 0 && <p className="history-note">{reasons.join(" ")}</p>}<p className="history-note">Grupperat över konton och plattformar, rankat efter bidrag i SEK från föregående stängningskurs. Kursförändring med aktuell valutakurs; valutans egen dagsrörelse ingår inte.
            {excluded > 0 && ` ${excluded} instrument saknar kompletta kursuppgifter för idag och visas inte.`}</p></details>
    </section>;
}
