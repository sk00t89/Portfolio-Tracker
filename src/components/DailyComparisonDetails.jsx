import { formatSek } from "../utils/formatting.js";

const time = instant => Number.isFinite(instant) ? new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short",
}).format(instant) : "saknas";
const statuses = { open: "börsen är öppen", before_open: "före börsöppning", after_close: "börsen har stängt",
    closed_day: "stängd handelsdag", unknown: "handelsstatus saknas" };

export default function DailyComparisonDetails({ dailyChange }) {
    const sessions = dailyChange?.latestSessionSubsets ?? [];
    return <>
        {sessions.length > 0 && <details className="portfolio-daily-coverage">
            <summary>Senaste verifierade handelssessioner · inte IDAG</summary>
            <ul>{sessions.map(group => <li key={`${group.previousDate}/${group.currentDate}`}>
                <strong>{group.previousDate} → {group.currentDate}</strong>
                <span> · DELMÄNGD — inte dagens totalportfölj. {group.positionCount} positioner · {group.changeSek >= 0 ? "+" : ""}{formatSek(group.changeSek)} · {group.changePercent >= 0 ? "+" : ""}{group.changePercent.toFixed(2)} %</span>
                <span> · {group.coveragePercent == null ? "Täckning okänd" : `${group.coveragePercent.toFixed(1)} % täckning`}</span>
            </li>)}</ul>
        </details>}
        {dailyChange?.positions?.length > 0 && <details className="portfolio-daily-coverage">
            <summary>Underlag per innehav</summary>
            <ul>{dailyChange.positions.map((position, index) => {
                const diagnostic = position.diagnostic ?? {};
                const reasons = position.todayReasons ?? position.reasons;
                return <li key={`${position.id ?? position.name}-${index}`}>
                    <strong>{position.name}</strong>
                    <span> · {position.todayCovered ? dailyChange.flowsUnverified ? "Kursunderlag giltigt för IDAG; resultat blockerat av kassaflöden" : "Giltigt för IDAG" : "Ingår inte i IDAG"}</span>
                    {reasons?.length > 0 && <span> — {reasons.join("; ")}</span>}
                    <span> · Källa: {diagnostic.source ?? "saknas"}{diagnostic.fxSource ? `; FX: ${diagnostic.fxSource}` : ""}</span>
                    <span> · Jämförelsedatum: {position.previousDate ?? "saknas"} → {position.currentDate ?? "saknas"}; relevant session: {diagnostic.expectedDate ?? "saknas"}</span>
                    <span> · {position.kind === "nav" ? `NAV-värderingsdatum: ${position.navObservation?.date ?? position.currentDate ?? "saknas"}; publiceringstid saknas`
                        : `Kurstid: ${time(diagnostic.quoteTime)}; ${statuses[diagnostic.marketStatus] ?? "handelsstatus saknas"}`}; kurskontroll: {time(diagnostic.quoteCheckedAt)}</span>
                    <span> · Referensens källkontroll: {time(diagnostic.referenceCheckedAt)}; senaste hämtningsförsök: {time(diagnostic.lastAttemptAt)}</span>
                    <span> · Referensgiltighet: {diagnostic.referenceValid == null ? "se kurs- och stängningsunderlag" : diagnostic.referenceValid ? "verifierad daterad observation; kontrollintervallet ändrar inte datumet" : "saknat eller ogiltigt underlag"}</span>
                    {position.kind === "listed" && !diagnostic.closeDateVerified && <span> · Föregående stängningsdatum saknar separat källverifiering; förbättring av officiell stängningskälla återstår.</span>}
                    {diagnostic.referenceLoading && <span> · Hämtar jämförelseunderlag…</span>}
                    {diagnostic.refreshError && <span> · {diagnostic.refreshError}. Tidigare observation används bara om dess datum och identitet fortfarande är giltiga.</span>}
                    {dailyChange.flowsUnverified && <span> · Dagens affärer eller insättningar/uttag blockerar samtliga resultat och delmängder.</span>}
                </li>;
            })}</ul>
        </details>}
    </>;
}
