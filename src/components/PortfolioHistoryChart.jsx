import { useState } from "react";
import { availableHistoryPeriods, createValueSeries } from "../utils/dashboardHistory.js";

export default function PortfolioHistoryChart({ history, formatMoney, currency }) {
    const [selected, setSelected] = useState("All");
    const [focused, setFocused] = useState(null);
    const periods = availableHistoryPeriods(history.points);
    const period = periods.includes(selected) ? selected : periods[0];
    const series = period ? createValueSeries(history.points, period) : null;
    const points = series?.points ?? [];
    const first = points[0];
    const last = points.at(-1);
    const active = points.find((point) => point.date === focused) ?? last;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.12, Math.abs(max) * 0.01, 1);
    const bottom = min - padding;
    const top = max + padding;
    const startTime = first ? Date.parse(first.date) : 0;
    const span = last ? Date.parse(last.date) - startTime : 1;
    const coordinates = points.map((point) => ({ ...point,
        x: 65 + (Date.parse(point.date) - startTime) / (span || 1) * 705,
        y: 220 - (point.value - bottom) / (top - bottom) * 190,
    }));
    const change = first && last ? last.value - first.value : null;
    const percent = first?.value > 0 ? change / first.value * 100 : null;
    return (
        <section className="card history-card">
            <div className="section-heading">
                <div><span className="eyebrow">Historik · {currency}</span><h2>Portföljvärde</h2></div>
                <div className="history-periods" aria-label="Välj historikperiod">
                    {periods.map((item) => <button type="button" key={item}
                        className="ghost-button" aria-pressed={period === item}
                        onClick={() => { setSelected(item); setFocused(null); }}>{item}</button>)}
                </div>
            </div>
            {history.error && <p role="alert">{history.error}</p>}
            {history.loading ? <p role="status">Laddar historik…</p> : points.length < 2 ?
                <p>Grafen visas när värden finns för minst två olika dagar. Längre perioder visas när historiken täcker dem.
                    {history.points.length === 1 && ` Senast sparat: ${formatMoney(history.points[0].valueSek)} (${history.points[0].date}).`}
                </p> : <>
                    <div className="history-detail" aria-live="polite">
                        <strong>{formatMoney(active.value)}</strong><span className="muted">{active.date}</span>
                        <span className="muted">Faktisk start {first.date}</span>
                        <span className={change >= 0 ? "positive-text" : "negative-text"}>
                            Period: {change >= 0 ? "+" : ""}{formatMoney(change)}
                            {percent != null && ` (${percent >= 0 ? "+" : ""}${percent.toFixed(2)} %)`}
                        </span>
                    </div>
                    <svg className="history-chart" viewBox="0 0 800 265" role="img"
                        aria-label={`Portföljvärde ${first.date} till ${last.date}. ${formatMoney(first.value)} till ${formatMoney(last.value)}.`}>
                        {[0, 0.5, 1].map((ratio) => <g key={ratio}>
                            <line x1="65" x2="770" y1={220 - ratio * 190} y2={220 - ratio * 190} className="history-grid-line" />
                            <text x="60" y={224 - ratio * 190} textAnchor="end">{formatMoney(bottom + ratio * (top - bottom))}</text>
                        </g>)}
                        <polyline points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
                            fill="none" className="history-line" />
                        {coordinates.map((point) => <circle key={point.date} cx={point.x} cy={point.y}
                            r={focused === point.date ? 5 : 3} className="history-point"
                            onMouseEnter={() => setFocused(point.date)} onClick={() => setFocused(point.date)}>
                            <title>{point.date}: {formatMoney(point.value)}</title>
                        </circle>)}
                        <text x="65" y="250">{first.date}</text><text x="770" y="250" textAnchor="end">{last.date}</text>
                    </svg>
                    <label className="history-point-picker">Visa datapunkt
                        <select value={active.date} onChange={(event) => setFocused(event.target.value)}>
                            {points.map((point) => <option key={point.date} value={point.date}>{point.date} · {formatMoney(point.value)}</option>)}
                        </select>
                    </label>
                </>}
            <p className="history-note">En datapunkt per dag i Stockholmstid, uppdaterad när appen är öppen. Dagar utan värde saknas. Insättningar och uttag påverkar grafen.
                {currency !== "SEK" && " Historiska SEK-värden räknas om med aktuell växelkurs, inte historiska valutakurser."}</p>
        </section>
    );
}
