import { formatSek } from "../utils/formatting.js";

export default function DailyDevelopmentMetric({ dailyChange, valuesLoading, today, detailsOnly = false }) {
    const data = dailyChange?.today ?? dailyChange;
    const subset = !valuesLoading && !data?.complete && data?.subset?.available && data.subset.currentDate === today ? data.subset : null;
    const complete = !valuesLoading && data?.complete && (!data.currentDate || data.currentDate === today);
    const display = complete ? data : subset;
    const color = value => value == null ? "" : value >= 0 ? "positive-text" : "negative-text";
    const signed = value => `${value >= 0 ? "+" : ""}${formatSek(value)}`;
    const percent = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    if (detailsOnly) return <details className="portfolio-daily-coverage">
        <summary>Dagens underlag</summary>
        <div className="portfolio-underlying-notes">
            <span>{today}{display?.previousDate ? ` · jämförelse från ${display.previousDate}` : ""}</span>
            {!complete && <span>{data?.reasons?.join("; ") || "Dagens SEK och % saknar komplett verifierat underlag"}</span>}
            {subset && <>
                <span>DELMÄNGD — inte totalportföljen. Fullständig total dagsförändring saknas.</span>
                <span>{subset.previousDate} → {subset.currentDate} · {subset.positionCount} positioner</span>
                <span>{formatSek(subset.portfolioValueSek)} av portföljens visade värde · {subset.coveragePercent == null ? "Andel kan inte beräknas" : `${subset.coveragePercent.toFixed(1)} % täckning`}</span>
            </>}
            {data?.instrumentCoveragePercent != null && <span>Senaste instrumentkurser {valuesLoading ? "–" : Math.floor(data.instrumentCoveragePercent)} % · Dagsförändring i SEK {valuesLoading ? "–" : Math.floor(data.sekCoveragePercent ?? 0)} %</span>}
            {data?.referenceFx && <span>Dagliga referensvalutakurser från Frankfurter, inte intradag-FX.</span>}
        </div>
    </details>;
    return <div className="portfolio-metric portfolio-metric-today" aria-label="Dagens utveckling i SEK">
        <span>IDAG{subset ? " · DELMÄNGD" : ""}</span>
        <strong className={color(display?.changeSek)}>{display ? signed(display.changeSek) : "–"}</strong>
        <small className={color(display?.changePercent)}>{display ? `${percent(display.changePercent)}${subset ? " för delmängden" : ""}`
            : valuesLoading ? "Läser underlag…" : "Dagsunderlag saknas"}</small>
        <span className="portfolio-metric-date">{today}</span>
        {subset && <span className="portfolio-data-status">{subset.positionCount} innehav · {subset.coveragePercent == null ? "täckning okänd" : `${subset.coveragePercent.toFixed(1)} % täckning`} · inte hela portföljen</span>}
    </div>;
}
