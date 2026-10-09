import { formatSek } from "../utils/formatting.js";

export default function DailyDevelopmentMetric({ dailyChange, valuesLoading, today }) {
    const data = dailyChange?.today ?? dailyChange;
    const subset = !valuesLoading && !data?.complete && data?.subset?.available && data.subset.currentDate === today ? data.subset : null;
    const complete = !valuesLoading && data?.complete && (!data.currentDate || data.currentDate === today);
    const display = complete ? data : subset;
    const color = value => value == null ? "" : value >= 0 ? "positive-text" : "negative-text";
    const signed = value => `${value >= 0 ? "+" : ""}${formatSek(value)}`;
    const percent = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
    return <div className="portfolio-metric" aria-label="Dagens utveckling i SEK">
        <span>IDAG{subset ? " · DELMÄNGD" : ""}</span>
        <strong className={color(display?.changeSek)}>{display ? signed(display.changeSek) : "–"}</strong>
        <small className={color(display?.changePercent)}>{display ? `${percent(display.changePercent)}${subset ? " för delmängden" : ""}`
            : valuesLoading ? "Läser dagens underlag · SEK och % saknas ännu" : "Dagens SEK och % saknar komplett verifierat underlag"}</small>
        <span className="portfolio-metric-note">{today}{display?.previousDate ? ` · jämförelse från ${display.previousDate}` : ""}</span>
        {!complete && <span className="portfolio-metric-note">{data?.reasons?.[0]}</span>}
        {subset && <>
            <span className="portfolio-metric-note">DELMÄNGD — inte totalportföljen. Fullständig total dagsförändring saknas.</span>
            <span className="portfolio-metric-note">{subset.previousDate} → {subset.currentDate} · {subset.positionCount} positioner</span>
            <span className="portfolio-metric-note">{formatSek(subset.portfolioValueSek)} av portföljens visade värde · {subset.coveragePercent == null ? "Andel kan inte beräknas" : `${subset.coveragePercent.toFixed(1)} % täckning`}</span>
        </>}
        {data?.instrumentCoveragePercent != null && <span className="portfolio-metric-note">
            Senaste instrumentkurser {valuesLoading ? "–" : Math.floor(data.instrumentCoveragePercent)} % · Dagsförändring i SEK {valuesLoading ? "–" : Math.floor(data.sekCoveragePercent ?? 0)} %
        </span>}
        {data?.referenceFx && <span className="portfolio-metric-note">Dagliga referensvalutakurser från Frankfurter, inte intradag-FX.</span>}
    </div>;
}
