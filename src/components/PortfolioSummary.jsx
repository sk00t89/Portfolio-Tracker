import { useState } from "react";
import { formatSek } from "../utils/formatting.js";
import { buildPortfolioPeriod, PORTFOLIO_PERIODS, BENCHMARKS, livePortfolioPoint, availableBenchmarkIds } from "../utils/portfolioPeriod.js";
import PortfolioHistoryChart from "./PortfolioHistoryChart.jsx";
import StandaloneIndex from "./StandaloneIndex.jsx";

export default function PortfolioSummary({ portfolioValue, investedCapital, formatMoney = formatSek,
    dailyChange, updatingPrices, valuesLoading, history = { points: [] }, currency = "SEK", today, now,
    benchmarks = {}, portfolioReturns = null, liveValuation, initialPeriod = "All", indexApiFetch, initialIndex = "" }) {
    const [period, setPeriod] = useState(initialPeriod);
    const [benchmarkId, setBenchmarkId] = useState(initialIndex);
    const [focused, setFocused] = useState(null);
    const livePoint = livePortfolioPoint({ ...liveValuation, valueSek: portfolioValue, today, now });
    const availableIndexes = availableBenchmarkIds(benchmarks, now);
    const activeBenchmark = availableIndexes.includes(benchmarkId) ? benchmarkId : "";
    const view = buildPortfolioPeriod({ points: history.points, period, today, now, portfolioReturns, livePoint,
        dailyChange: valuesLoading ? null : dailyChange,
        benchmark: benchmarks[activeBenchmark] ?? null });
    const profit = portfolioValue == null || valuesLoading ? null : portfolioValue - investedCapital;
    const profitPercent = profit != null && investedCapital > 0 ? profit / investedCapital * 100 : null;
    const signed = (value, formatter = formatMoney) => `${value >= 0 ? "+" : ""}${formatter(value)}`;
    const percent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    const color = (value) => value == null ? "" : value >= 0 ? "positive-text" : "negative-text";
    const subset = !valuesLoading && !dailyChange?.complete && dailyChange?.subset?.available ? dailyChange.subset : null;
    const dailyDisplay = valuesLoading ? null : dailyChange?.complete ? dailyChange : subset;
    const benchmarkLabel = BENCHMARKS.find((item) => item.id === benchmarkId)?.label;
    return <section className="card portfolio-hero" aria-label="Portföljöversikt med historik">
        <div className="portfolio-hero-top">
            <div className="portfolio-hero-value">
                <div className="portfolio-hero-eyebrow"><span className="eyebrow">Total portfölj</span><span className="portfolio-currency-tag">{currency}</span></div>
                <h1>{portfolioValue == null ? "–" : formatMoney(portfolioValue)}</h1>
                <p>Insatt kapital <strong>{valuesLoading ? "–" : formatMoney(investedCapital)}</strong></p>
            </div>
            <div className="portfolio-hero-status" role="status"><span className={`portfolio-status-dot ${updatingPrices ? "is-updating" : ""}`} />
                {valuesLoading ? "Läser sparade värden" : updatingPrices ? "Uppdaterar kurser… tidigare värden visas" : "Senaste portföljvärdet"}
            </div>
        </div>
        <div className="portfolio-hero-metrics">
            <div className="portfolio-metric"><span>{period === "1D" ? "Dagsförändring" : "Värdeförändring"} · {PORTFOLIO_PERIODS.find((item) => item.id === period)?.label}</span>
                <strong className={color(view.changeSek)}>{view.changeSek == null ? "–" : signed(view.changeSek)}</strong>
                <small className={color(view.changePercent)}>{view.changePercent == null ? period === "1D" ? "Ofullständigt dagsunderlag"
                    : view.periodCovered ? "Procent kan inte beräknas från nollvärde" : "Periodjämförelse saknas"
                    : `${percent(view.changePercent)} · ${period === "1D" ? "verifierad dagsförändring" : "värde, inte investeringsavkastning"}`}</small>
            </div>
            <div className="portfolio-metric"><span>{subset ? `${subset.currentDate === today ? "Idag" : subset.currentDate} · DELMÄNGD` : dailyChange?.label ?? "Idag"}</span>
                <strong className={color(dailyDisplay?.changeSek)}>
                    {dailyDisplay ? signed(dailyDisplay.changeSek, formatSek) : "–"}
                </strong>
                <small className={color(dailyDisplay?.changePercent)}>
                    {dailyDisplay ? `${percent(dailyDisplay.changePercent)}${subset ? " för delmängden" : ""}`
                        : dailyChange?.instrumentCoveragePercent != null ? "Ofullständigt underlag"
                            : `Ofullständigt underlag · ${valuesLoading ? "–" : Math.floor(dailyChange?.coveragePercent ?? 0)} % kurstäckning`}
                </small>
                {!dailyChange?.complete && <span className="portfolio-metric-note">{dailyChange?.reasons?.[0]}</span>}
                {subset && <>
                    <span className="portfolio-metric-note">DELMÄNGD — inte totalportföljen. Fullständig total dagsförändring saknas.</span>
                    <span className="portfolio-metric-note">{subset.previousDate} → {subset.currentDate} · {subset.positionCount} positioner</span>
                    <span className="portfolio-metric-note">{formatSek(subset.portfolioValueSek)} av portföljens visade värde · {subset.coveragePercent == null ? "Andel kan inte beräknas" : `${subset.coveragePercent.toFixed(1)} % täckning`}</span>
                </>}
                {dailyChange?.instrumentCoveragePercent != null && <span className="portfolio-metric-note">
                    Instrumentkurser {valuesLoading ? "–" : Math.floor(dailyChange.instrumentCoveragePercent)} % · Dagsförändring i SEK {valuesLoading ? "–" : Math.floor(dailyChange.sekCoveragePercent)} %
                </span>}
                {dailyChange?.referenceFx && <span className="portfolio-metric-note">Dagliga referensvalutakurser från Frankfurter, inte intradag-FX.</span>}
            </div>
            <div className="portfolio-metric"><span>Kapitalförändring</span>
                <strong className={color(profit)}>{profit == null ? "–" : signed(profit)}</strong>
                <small className={color(profitPercent)}>{profitPercent == null ? "Jämförelse mot insatt kapital" : `${percent(profitPercent)} mot insatt kapital`}</small>
            </div>
        </div>
        {dailyChange?.positions?.some(position => !position.covered) && <details className="portfolio-daily-coverage">
            <summary>Underlag per innehav</summary>
            <ul>{dailyChange.positions.filter(position => !position.covered).map((position, index) => <li key={`${position.id ?? position.name}-${index}`}>
                <strong>{position.name}</strong>{position.reasons.length > 0 && <span> — {position.reasons.join("; ")}</span>}
            </li>)}</ul>
        </details>}
        {dailyChange?.positions?.some(position => position.navObservation || position.navChange) && <details className="portfolio-daily-coverage">
            <summary>Senast publicerade fond-NAV</summary>
            <ul>{dailyChange.positions.filter(position => position.navObservation || position.navChange).map((position, index) => <li key={`${position.id ?? position.name}-${index}`}>
                <strong>{position.name}</strong>
                {position.navObservation && <span> — NAV {position.navObservation.date}: {new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 4 }).format(position.navObservation.price)} {position.navObservation.currency}</span>}
                <span> · {position.navChange ? `${position.navChange.label} ${position.navChange.previousDate} → ${position.navChange.date}: ${percent(position.navChange.percent)}` : "Föregående verifierat NAV saknas"}</span>
                <span> · Publicerat NAV, inte en intradagskurs.</span>
            </li>)}</ul>
        </details>}
        <div className="portfolio-chart-toolbar">
            <div className="portfolio-periods" role="group" aria-label="Välj historikperiod">{PORTFOLIO_PERIODS.map((item) =>
                <button key={item.id} type="button" aria-pressed={period === item.id}
                    onClick={() => { setPeriod(item.id); setFocused(null); }}>{item.label}</button>)}</div>
            <label className="portfolio-benchmark-picker"><span className="sr-only">Visa index separat</span>
                <select aria-label="Visa index separat" value={benchmarkId} onChange={(event) => { setBenchmarkId(event.target.value); setFocused(null); }}>
                    <option value="">Portföljhistorik</option>{BENCHMARKS.map((item) => <option key={item.id} value={item.id} disabled={item.id === "SIXRX"}>{item.label}{item.id === "SIXRX" ? " · källa ej verifierad" : ""}</option>)}
                </select>
            </label>
        </div>
        {!benchmarkId && period !== "1D" && !view.periodCovered && <p className="portfolio-period-coverage" role="status">
            {view.first && <strong>Historik tillgänglig sedan {new Intl.DateTimeFormat("sv-SE", {
                day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm",
            }).format(new Date(`${view.first.date}T12:00:00Z`))}. </strong>}
            Periodens avkastning kan ännu inte beräknas. Jämförbar startpunkt eller slutpunkt för hela perioden saknas.
        </p>}
        {!benchmarkId && history.error && <p className="portfolio-chart-notice" role="alert">{history.error}</p>}
        {benchmarkId ? <StandaloneIndex id={benchmarkId} period={period} apiFetch={indexApiFetch} focused={focused} onFocus={setFocused} now={now} />
            : history.loading ? <div className="portfolio-chart-empty" role="status"><strong>Läser din historik…</strong><p>Sparade dagsvärden hämtas från Supabase.</p></div>
            : <PortfolioHistoryChart view={view} focused={focused} onFocus={setFocused} formatMoney={formatMoney} currency={currency} />}
        <div className="portfolio-hero-footer">
            <div><span className="portfolio-footer-label">{view.available ? `${view.first.date} — ${view.last.date}` : "Verkliga observationer"}</span>
                <span>Insättningar och uttag ingår i värdeförändringen. Investeringsavkastning kräver verifierade kassaflöden.</span>
                {view.periodCovered && view.calculationStart.date !== view.first?.date && <span>Periodjämförelsens startobservation: {view.calculationStart.date}.</span>}
                <span>{livePoint ? "Dagens livevärde är visningsdata och ändrar inte sparad historik."
                    : "Livepunkt visas efter en komplett verifierad kursuppdatering. Sparad historik behålls."}</span>
                {currency !== "SEK" && <span>Visningsbelopp använder aktuell valutakurs. Portföljens periodprocent utgår från SEK. Fristående index visas i sin ursprungsvaluta.</span>}
            </div>
            <div className="portfolio-comparison" role="status">
                {benchmarkId ? <><span className="portfolio-footer-label">{benchmarkLabel} · separat index</span><span>Jämförelse mot portföljen är avstängd tills verifierad TWR och fullständig kassaflödeshistorik finns.</span></> : activeBenchmark ? view.comparison.available ? <>
                    <span className="portfolio-footer-label">Mot {benchmarkLabel}</span>
                    <strong className={color(view.comparison.excessPercentagePoints)}>
                        {view.comparison.excessPercentagePoints >= 0 ? "+" : ""}{view.comparison.excessPercentagePoints.toFixed(2)} procentenheter
                        <span role="img" aria-label={view.comparison.excessPercentagePoints >= 0 ? "Över index" : "Under index"}>{view.comparison.excessPercentagePoints >= 0 ? " 😄" : " 😟"}</span>
                    </strong>
                </> : <><span className="portfolio-footer-label">{benchmarkLabel} · jämförelse otillgänglig</span><span>{view.comparison.reason}</span></>
                    : <><span className="portfolio-footer-label">Indexhistorik</span><span>Välj ett index för separat utveckling. Jämförelse mot portföljen kräver verifierad TWR och fullständiga kassaflöden.</span></>}
            </div>
        </div>
    </section>;
}
