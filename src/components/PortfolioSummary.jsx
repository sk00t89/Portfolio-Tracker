import { useState } from "react";
import { formatSek } from "../utils/formatting.js";
import { buildPortfolioPeriod, PORTFOLIO_PERIODS, BENCHMARKS, livePortfolioPoint, availableBenchmarkIds } from "../utils/portfolioPeriod.js";
import PortfolioHistoryChart from "./PortfolioHistoryChart.jsx";
import DailyDevelopmentMetric from "./DailyDevelopmentMetric.jsx";
import DailyComparisonDetails from "./DailyComparisonDetails.jsx";
import useChartPreference from "../hooks/useChartPreference.js";
import usePerformanceBenchmark from "../hooks/usePerformanceBenchmark.js";
import { PERFORMANCE_VERSION } from "../utils/portfolioPerformance.js";

export default function PortfolioSummary({ portfolioValue, investedCapital, formatMoney = formatSek,
    dailyChange, updatingPrices, valuesLoading, history = { points: [] }, currency = "SEK", today, now,
    benchmarks = {}, portfolioReturns = null, marketRequest, liveValuation, initialPeriod = "All", initialIndex = "", preferenceScope = "guest", valueLabel = "Senaste värdet", children }) {
    const [period, setPeriod] = useChartPreference(`portfolioChart:${preferenceScope}:period`, initialPeriod, PORTFOLIO_PERIODS.map(item => item.id));
    const [benchmarkId, setBenchmarkId] = useChartPreference(`portfolioChart:${preferenceScope}:index`, initialIndex, ["", ...BENCHMARKS.filter(item => item.id !== "SIXRX").map(item => item.id)]);
    const [focused, setFocused] = useState(null);
    const performanceEnabled = portfolioReturns?.apiVersion === PERFORMANCE_VERSION && portfolioReturns.available === true;
    const indexHistory = usePerformanceBenchmark(benchmarkId, period, today, performanceEnabled && Boolean(marketRequest), marketRequest);
    const livePoint = livePortfolioPoint({ ...liveValuation, valueSek: portfolioValue, today, now });
    const availableIndexes = availableBenchmarkIds(benchmarks, now);
    const activeBenchmark = availableIndexes.includes(benchmarkId) ? benchmarkId : "";
    const view = buildPortfolioPeriod({ points: history.points, period, today, now, portfolioReturns, livePoint,
        dailyChange: valuesLoading ? null : dailyChange?.today ?? dailyChange,
        benchmark: performanceEnabled ? indexHistory.data ?? benchmarks[benchmarkId] ?? null : benchmarks[activeBenchmark] ?? null });
    const profit = portfolioValue == null || valuesLoading ? null : portfolioValue - investedCapital;
    const profitPercent = profit != null && investedCapital > 0 ? profit / investedCapital * 100 : null;
    const signed = (value, formatter = formatMoney) => `${value >= 0 ? "+" : ""}${formatter(value)}`;
    const percent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    const color = (value) => value == null ? "" : value >= 0 ? "positive-text" : "negative-text";
    const benchmarkLabel = BENCHMARKS.find((item) => item.id === benchmarkId)?.label;
    return <><section className="card portfolio-hero" aria-label="Portföljöversikt med historik">
        <div className="portfolio-hero-top">
            <div className="portfolio-hero-value">
                <div className="portfolio-hero-eyebrow"><span className="eyebrow">Total portfölj</span><span className="portfolio-currency-tag">{currency}</span></div>
                <h1>{portfolioValue == null ? "–" : formatMoney(portfolioValue)}</h1>
            </div>
            <div className="portfolio-hero-status" role="status"><span className={`portfolio-status-dot ${updatingPrices ? "is-updating" : ""}`} />
                {valuesLoading ? "Läser sparade värden" : updatingPrices ? "Uppdaterar kurser…" : valueLabel}
            </div>
        </div>
        <div className="portfolio-hero-metrics portfolio-today-metric">
            <DailyDevelopmentMetric dailyChange={dailyChange} valuesLoading={valuesLoading} today={today} />
        </div>
        {history.error && <p className="portfolio-chart-notice" role="alert">{history.error}</p>}
        {indexHistory.loading && <p className="portfolio-index-status" role="status">Hämtar verifierad indexhistorik…</p>}
        {indexHistory.error && <p className="portfolio-chart-notice" role="alert">{indexHistory.error} <button type="button" onClick={indexHistory.retry}>Försök igen</button></p>}
        {view.performance && <p className="portfolio-index-status" role="status">{view.performance.methodLabel} · avkastning i SEK · färdigställd historik{view.performance.reason && ` · ${view.performance.reason}`}</p>}
        {view.comparison.available && view.performance && <p className="portfolio-period-coverage" role="status">
            Gemensam period {view.comparison.start} – {view.comparison.end} · båda börjar på 0 %.
            {view.comparison.partial && " Kortare verifierad period än det valda intervallet."}
            {view.comparison.omittedDates.length > 0 && ` ${view.comparison.omittedDates.length} portföljdatum saknar jämförbar index- eller FX-observation; inga kurser har fyllts i.`}
            {view.comparison.missingIndexCount > 0 && ` Indexkällan saknar ${view.comparison.missingIndexCount} slutkurser i hämtat intervall.`}
            {` ${view.comparison.disclosure} ${view.comparison.fxLabel}. Källa: ${view.comparison.source}.`}
        </p>}
        {benchmarkId && !view.comparison.available && <p className="portfolio-index-blocked" role="status">{benchmarkLabel}: överlägg ej tillgängligt. Portföljhistoriken visas.</p>}
        {history.loading ? <div className="portfolio-chart-empty" role="status"><strong>Läser din historik…</strong><p>Sparade dagsvärden hämtas från Supabase.</p></div>
            : <PortfolioHistoryChart view={view} focused={focused} onFocus={setFocused} formatMoney={formatMoney} currency={currency} />}
        <div className="portfolio-chart-toolbar">
            <div className="portfolio-periods" role="group" aria-label="Välj historikperiod">{PORTFOLIO_PERIODS.map((item) =>
                <button key={item.id} type="button" aria-pressed={period === item.id}
                    onClick={() => { setPeriod(item.id); setFocused(null); }}>{item.label}</button>)}</div>
            <label className="portfolio-benchmark-picker"><span className="sr-only">Jämför med index</span>
                <select aria-label="Jämför med index" value={benchmarkId} onChange={(event) => { setBenchmarkId(event.target.value); setFocused(null); }}>
                    <option value="">Endast portföljen</option>{BENCHMARKS.map((item) => <option key={item.id} value={item.id} disabled={item.id === "SIXRX"}>{item.label}{item.id === "SIXRX" ? " · källa ej verifierad" : ""}</option>)}
                </select>
            </label>
        </div>
        {period !== "1D" && !view.periodCovered && <p className="portfolio-period-coverage" role="status">
            {view.first && <strong>Historik tillgänglig sedan {new Intl.DateTimeFormat("sv-SE", {
                day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm",
            }).format(new Date(`${view.first.date}T12:00:00Z`))}. </strong>}
            {view.performance ? "Grafen visar tillgänglig verifierad period, inte hela kalenderperioden." : "Periodjämförelse saknas."}
        </p>}
        <div className="portfolio-hero-metrics portfolio-secondary-metrics">
            <div className="portfolio-metric"><span>Insatt kapital</span><strong>{valuesLoading ? "–" : formatMoney(investedCapital)}</strong></div>
            <div className="portfolio-metric"><span>{period === "1D" ? "Dagsförändring" : "Värdeförändring"} · {PORTFOLIO_PERIODS.find((item) => item.id === period)?.label}</span>
                <strong className={color(view.changeSek)}>{view.changeSek == null ? "–" : signed(view.changeSek)}</strong>
                <small className={color(view.changePercent)}>{view.changePercent == null ? period === "1D" ? "Ofullständigt dagsunderlag"
                    : view.periodCovered ? "Procent kan inte beräknas från nollvärde" : "Periodjämförelse saknas"
                    : `${percent(view.changePercent)} · ${period === "1D" ? "dagsförändring" : "värdeförändring"}`}</small>
                {period === "All" && view.first && !view.first.live && <small>Från första sparade observationen · {view.first.date}</small>}
            </div>
            <div className="portfolio-metric"><span>Kapitalförändring</span>
                <strong className={color(profit)}>{profit == null ? "–" : signed(profit)}</strong>
                <small className={color(profitPercent)}>{profitPercent == null ? "Jämförelse mot insatt kapital" : `${percent(profitPercent)} mot insatt kapital`}</small>
            </div>
        </div>
        </section>
        {children}
        <details className="card portfolio-underlying"><summary>Underlag och förklaringar</summary>
            <DailyDevelopmentMetric dailyChange={dailyChange} valuesLoading={valuesLoading} today={today} detailsOnly />
        <DailyComparisonDetails dailyChange={dailyChange} />
        {dailyChange?.positions?.some(position => position.navObservation || position.navChange) && <details className="portfolio-daily-coverage">
            <summary>Senast publicerade fond-NAV</summary>
            <ul>{dailyChange.positions.filter(position => position.navObservation || position.navChange).map((position, index) => <li key={`${position.id ?? position.name}-${index}`}>
                <strong>{position.name}</strong>
                {position.navObservation && <span> — NAV {position.navObservation.date}: {new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 4 }).format(position.navObservation.price)} {position.navObservation.currency}</span>}
                <span> · {position.navChange ? `${position.navChange.label} ${position.navChange.previousDate} → ${position.navChange.date}: ${percent(position.navChange.percent)}` : "Föregående verifierat NAV saknas"}</span>
                <span> · Publicerat NAV, inte en intradagskurs.</span>
            </li>)}</ul>
        </details>}
        <details className="portfolio-daily-coverage portfolio-chart-details">
            <summary>Om grafen och beräkningen</summary>
            <p className="portfolio-period-coverage">Sparade dagsvärden · dagar utan observation fylls inte i. Ett verifierat livevärde ändrar inte sparad historik.</p>
            {period === "All" && <p className="portfolio-period-coverage">ALL omfattar tillgänglig sparad historik. Värdeförändringen gäller från första sparade observationen, inte från när portföljen skapades.</p>}
            {period !== "1D" && !view.periodCovered && <p className="portfolio-period-coverage">Periodens avkastning kan ännu inte beräknas. Jämförbar startpunkt eller slutpunkt för hela perioden saknas.</p>}
        <div className="portfolio-hero-footer">
            <div><span className="portfolio-footer-label">{view.available ? `${view.first.date} — ${view.last.date}` : "Verkliga observationer"}</span>
                <span>Insättningar och uttag ingår i värdeförändringen. Investeringsavkastning kräver verifierade kassaflöden.</span>
                {view.performance && <span>Procentgrafen är kassaflödesjusterad och separat från värdeförändringen. Livevärdet ovan ingår inte i indexjämförelsen.</span>}
                {view.periodCovered && view.calculationStart.date !== view.first?.date && <span>Periodjämförelsens startobservation: {view.calculationStart.date}.</span>}
                <span>{livePoint ? "Dagens livevärde är visningsdata och ändrar inte sparad historik."
                    : "Livepunkt visas efter en komplett verifierad kursuppdatering. Sparad historik behålls."}</span>
                {currency !== "SEK" && <span>Visningsbelopp använder aktuell valutakurs. Portföljens periodprocent utgår från SEK. Indexöverlägg kräver jämförbar avkastning i SEK.</span>}
            </div>
            <div className="portfolio-comparison" role="status">
                {benchmarkId ? view.comparison.available ? <><span className="portfolio-footer-label">Mot {benchmarkLabel}</span>{view.comparison.excessPercentagePoints == null
                    ? <span>{view.comparison.disclosure}</span> : <strong>{view.comparison.excessPercentagePoints.toFixed(2)} procentenheter</strong>}</>
                    : <><span className="portfolio-footer-label">{benchmarkLabel} · överlägg spärrat</span><span>{portfolioReturns?.available === false ? portfolioReturns.reason : view.comparison.reason}</span><span>Jämförelse mot portföljen är avstängd tills verifierade dagsvärderingar och fullständig kassaflödeshistorik finns. Exakt TWR kräver värdering vid varje kapitalflöde; daglig Modified Dietz märks som uppskattad. Index och portfölj behöver jämförbara värderingsdatum och historisk valuta.</span></>
                    : <><span className="portfolio-footer-label">Indexjämförelse</span><span>Välj ett index för jämförelse när verifierade dagsvärderingar och fullständiga kassaflöden finns. Portföljhistoriken visas alltid.</span>{portfolioReturns?.available === false && <span>{portfolioReturns.reason}</span>}</>}
            </div>
        </div>
        </details>
        </details>
    </>;
}
