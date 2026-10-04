const time = (instant) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(instant);
const dateTime = (instant) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant);
const labels = { open: "Öppet", closed_day: "Stängt idag", before_open: "Öppnar senare", after_close: "Handeln avslutad", unknown: "Status okänd" };

export default function MarketStatus({ markets }) {
    return <section className="card market-status-card"><div className="section-heading"><div><span className="eyebrow">Marknadsläge</span><h2>Marknadsstatus</h2></div></div>
        <div className="market-status-grid">{markets.map((market) => <div className="market-status-item" key={market.market}>
            <strong>{market.label}</strong><span className={market.status === "open" ? "positive-text" : "muted"}>{labels[market.status]}</span>
            {market.market === "CRYPTO" ? <span>24/7</span> : <>
                {market.reason && <span>{market.reason}</span>}
                {market.opensAt && <span>{time(market.opensAt)}–{time(market.closesAt)}{market.halfDay ? " · halvdag" : ""}</span>}
                {market.nextOpen && <span>Nästa öppning {dateTime(market.nextOpen)}</span>}
            </>}
        </div>)}</div><p className="history-note">Ordinarie aktiehandel, tider i Stockholmstid. För- och efterhandel samt instrumentspecifika handelstider ingår inte. Kryptocertifikat följer sin börs.</p>
    </section>;
}
