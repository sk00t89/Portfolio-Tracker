import { useId } from "react";
import { nearestHistoryPoint } from "../utils/portfolioPeriod.js";

export default function PortfolioHistoryChart({ view, focused, onFocus, formatMoney, currency }) {
    const gradientId = `portfolio-area-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const comparison = view.comparison.available;
    const points = comparison ? view.comparison.series : view.points.map((point) => ({ date: point.date, value: point.valueSek }));
    const active = points.find((point) => point.date === focused) ?? points.at(-1);
    if (!view.available) return <div className="portfolio-chart-empty" role="status">
        <span className="portfolio-empty-icon" aria-hidden="true">↗</span>
        <strong>{view.historyCount < 2 ? "Din historik börjar här" : "Lite mer historik behövs"}</strong>
        <p>{view.reason}</p>
        {view.latestObservation && <small>Senast sparat {view.latestObservation.date} · {formatMoney(view.latestObservation.valueSek)}</small>}
    </div>;
    const values = points.flatMap((point) => comparison ? [point.value, point.benchmark] : [point.value]);
    const min = Math.min(...values), max = Math.max(...values);
    const padding = Math.max((max - min) * 0.18, Math.abs(max) * 0.005, comparison ? 0.1 : 1);
    const bottom = min - padding, top = max + padding;
    const firstTime = Date.parse(points[0].date), span = Date.parse(points.at(-1).date) - firstTime;
    const x = (point) => 12 + (Date.parse(point.date) - firstTime) / (span || 1) * 976;
    const y = (value) => 228 - (value - bottom) / (top - bottom) * 200;
    const path = points.map((point) => `${x(point)},${y(point.value)}`).join(" ");
    const activeIndex = points.findIndex((point) => point.date === active.date);
    const selectPoint = (event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = ((event.clientX - box.left) / box.width * 1000 - 12) / 976;
        onFocus(nearestHistoryPoint(points, ratio)?.date ?? null);
    };
    const signedPercent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    return <figure className={`portfolio-chart ${(comparison ? view.comparison.portfolioPercent : view.changeSek) < 0 ? "is-negative" : ""}`}>
        <div className="portfolio-chart-readout" aria-live="polite" aria-atomic="true">
            <span>{focused ? active.date : "Senast sparat"}</span>
            <strong>{comparison ? signedPercent(active.value) : formatMoney(active.value)}</strong>
            {comparison && <span className="portfolio-index-readout">Index {signedPercent(active.benchmark)}</span>}
        </div>
        <svg viewBox="0 0 1000 250" preserveAspectRatio="none" className="portfolio-chart-svg" role="img"
            aria-label={`${comparison ? "Verifierad avkastning" : `Portföljvärde i ${currency}`} från ${points[0].date} till ${points.at(-1).date}. ${points.length} verkliga observationer.`}
            onPointerMove={selectPoint} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); selectPoint(event); }}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") onFocus(null); }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.19" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient></defs>
            {[48, 108, 168, 228].map((height) => <line key={height} x1="12" x2="988" y1={height} y2={height} className="portfolio-chart-grid" />)}
            <polygon points={`12,244 ${path} 988,244`} fill={`url(#${gradientId})`} />
            {comparison && <polyline points={points.map((point) => `${x(point)},${y(point.benchmark)}`).join(" ")}
                className="portfolio-index-line" fill="none" vectorEffect="non-scaling-stroke" />}
            <polyline points={path} className="portfolio-value-line" fill="none" vectorEffect="non-scaling-stroke" />
            {points.length <= 30 && points.map((point) => <circle key={point.date} cx={x(point)} cy={y(point.value)} r="2.5" className="portfolio-observation" />)}
            <line x1={x(active)} x2={x(active)} y1="12" y2="244" className="portfolio-crosshair" />
            <circle cx={x(active)} cy={y(active.value)} r="5" className="portfolio-active-point" />
        </svg>
        <div className="portfolio-chart-dates"><span>{points[0].date}</span><span>{points.at(-1).date}</span></div>
        <label className="portfolio-chart-scrubber"><span className="sr-only">Utforska sparade observationer</span>
            <input type="range" min="0" max={points.length - 1} step="1" value={activeIndex}
                aria-label="Visa sparad historikpunkt" aria-valuetext={`${active.date}: ${comparison ? signedPercent(active.value) : formatMoney(active.value)}`}
                onChange={(event) => onFocus(points[Number(event.target.value)].date)} />
        </label>
        <figcaption>{comparison ? "Portfölj och index · verifierad avkastning i SEK" : "Sparade dagsvärden · dagar utan observation fylls inte i"}</figcaption>
    </figure>;
}
