import { useState } from "react";
import { formatSek } from "../utils/formatting.js";
import { buildPortfolioPeriod, PORTFOLIO_PERIODS, BENCHMARKS } from "../utils/portfolioPeriod.js";
import PortfolioHistoryChart from "./PortfolioHistoryChart.jsx";

export default function PortfolioSummary({ portfolioValue, investedCapital, formatMoney = formatSek,
    dailyChange, updatingPrices, valuesLoading, history = { points: [] }, currency = "SEK", today, now,
    benchmarks = {}, portfolioReturns = null }) {
    const [period, setPeriod] = useState("All");
    const [benchmarkId, setBenchmarkId] = useState("");
    const [focused, setFocused] = useState(null);
    const view = buildPortfolioPeriod({ points: history.points, period, today, now, portfolioReturns,
        benchmark: benchmarks[benchmarkId]?.id === benchmarkId ? benchmarks[benchmarkId] : null });
    const profit = portfolioValue == null || valuesLoading ? null : portfolioValue - investedCapital;
    const profitPercent = profit != null && investedCapital > 0 ? profit / investedCapital * 100 : null;
    const signed = (value, formatter = formatMoney) => `${value >= 0 ? "+" : ""}${formatter(value)}`;
    const percent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    const color = (value) => value == null ? "" : value >= 0 ? "positive-text" : "negative-text";
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
            <div className="portfolio-metric"><span>Värdeförändring · {PORTFOLIO_PERIODS.find((item) => item.id === period)?.label}</span>
                <strong className={color(view.changeSek)}>{view.changeSek == null ? "–" : signed(view.changeSek)}</strong>
                <small className={color(view.changePercent)}>{view.changePercent == null ? "Historiken räcker inte" : `${percent(view.changePercent)} · värde, inte investeringsavkastning`}</small>
            </div>
            <div className="portfolio-metric"><span>Idag</span>
                <strong className={color(dailyChange?.complete && !valuesLoading ? dailyChange.changeSek : null)}>
                    {dailyChange?.complete && !valuesLoading ? signed(dailyChange.changeSek, formatSek) : "–"}
                </strong>
                <small className={color(dailyChange?.complete && !valuesLoading ? dailyChange.changePercent : null)}>
                    {dailyChange?.complete && !valuesLoading ? percent(dailyChange.changePercent)
                        : `Ofullständigt underlag · ${valuesLoading ? "–" : Math.floor(dailyChange?.coveragePercent ?? 0)} % kurstäckning`}
                </small>
                {!dailyChange?.complete && <span className="portfolio-metric-note">{dailyChange?.reasons?.[0]}</span>}
            </div>
            <div className="portfolio-metric"><span>Kapitalförändring</span>
                <strong className={color(profit)}>{profit == null ? "–" : signed(profit)}</strong>
                <small className={color(profitPercent)}>{profitPercent == null ? "Jämförelse mot insatt kapital" : `${percent(profitPercent)} mot insatt kapital`}</small>
            </div>
        </div>
        <div className="portfolio-chart-toolbar">
            <div className="portfolio-periods" role="group" aria-label="Välj historikperiod">{PORTFOLIO_PERIODS.map((item) =>
                <button key={item.id} type="button" aria-pressed={period === item.id}
                    onClick={() => { setPeriod(item.id); setFocused(null); }}>{item.label}</button>)}</div>
            <label className="portfolio-benchmark-picker"><span className="sr-only">Jämför med index</span>
                <select aria-label="Jämför med index" value={benchmarkId} onChange={(event) => { setBenchmarkId(event.target.value); setFocused(null); }}>
                    <option value="">Jämför med index</option>{BENCHMARKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
            </label>
        </div>
        {history.error && <p className="portfolio-chart-notice" role="alert">{history.error}</p>}
        {history.loading ? <div className="portfolio-chart-empty" role="status"><strong>Läser din historik…</strong><p>Sparade dagsvärden hämtas från Supabase.</p></div>
            : <PortfolioHistoryChart view={view} focused={focused} onFocus={setFocused} formatMoney={formatMoney} currency={currency} />}
        <div className="portfolio-hero-footer">
            <div><span className="portfolio-footer-label">{view.available ? `${view.first.date} — ${view.last.date}` : "Verkliga observationer"}</span>
                <span>Insättningar och uttag ingår i värdeförändringen. Investeringsavkastning kräver verifierade kassaflöden.</span>
                {currency !== "SEK" && <span>Visningsbelopp använder aktuell valutakurs. Periodens procent och indexjämförelser utgår från SEK.</span>}
            </div>
            <div className="portfolio-comparison" role="status">
                {benchmarkId ? view.comparison.available ? <>
                    <span className="portfolio-footer-label">Mot {benchmarkLabel}</span>
                    <strong className={color(view.comparison.excessPercentagePoints)}>
                        {view.comparison.excessPercentagePoints >= 0 ? "+" : ""}{view.comparison.excessPercentagePoints.toFixed(2)} procentenheter
                        <span role="img" aria-label={view.comparison.excessPercentagePoints >= 0 ? "Över index" : "Under index"}>{view.comparison.excessPercentagePoints >= 0 ? " 😄" : " 😟"}</span>
                    </strong>
                </> : <><span className="portfolio-footer-label">{benchmarkLabel} · jämförelse otillgänglig</span><span>{view.comparison.reason}</span></>
                    : <><span className="portfolio-footer-label">Indexjämförelse</span><span>Välj ett index. Endast verifierat och jämförbart underlag används.</span></>}
            </div>
        </div>
    </section>;
}
