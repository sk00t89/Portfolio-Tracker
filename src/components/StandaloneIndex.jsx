import { useEffect, useState } from "react";
import { fetchIndexHistory, standaloneIndexView } from "../services/indexHistory.js";
import PortfolioHistoryChart from "./PortfolioHistoryChart.jsx";
import { INDEXES, indexDate } from "../../supabase/functions/_shared/indexHistory.js";

export default function StandaloneIndex({ id, period, apiFetch, focused, onFocus, now }) {
    const [initialNow] = useState(Date.now);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState(null);
    const key = `${id}:${period}:${attempt}:${indexDate(now ?? initialNow, INDEXES[id]?.zone ?? "Europe/Stockholm")}`;
    useEffect(() => {
        if (period === "1D") return;
        const controller = new AbortController();
        fetchIndexHistory(apiFetch, id, period, controller.signal).then(data => {
            if (!controller.signal.aborted) setState({ key, data });
        }).catch(error => {
            if (!controller.signal.aborted) setState({ key, error: error.message });
        });
        return () => controller.abort();
    }, [id, period, apiFetch, key]);
    if (period === "1D") return <div className="portfolio-chart-empty" role="status"><strong>Ingen intradagsdata för index</strong><p>1D stöds ännu inte. Välj en längre period för historiska dagsstängningar.</p></div>;
    if (state?.key !== key) return <div className="portfolio-chart-empty" role="status"><strong>Hämtar indexhistorik…</strong><p>Kontrollerar indexidentitet, valuta och datum.</p></div>;
    if (state.error) return <div className="portfolio-chart-empty"><p className="portfolio-chart-notice" role="alert">{state.error}</p><button type="button" className="ghost-button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></div>;
    return <IndexHistoryContent data={state.data} focused={focused} onFocus={onFocus} />;
}

export function IndexHistoryContent({ data, focused, onFocus }) {
    return <>
        <p className="portfolio-period-coverage" role="status">{data.label} · prisindex i {data.currency} · {data.zone} · Yahoo Finance.
            {data.period === "All" && " ALL visar högst 10 års indexhistorik."}
            {` Basdatum ${data.points[0].date} = 0 %. Önskad period från ${data.requestedStart}.`}
            {data.points[0].date !== data.requestedStart && " Historiken börjar efter periodgränsen; utvecklingen gäller från basdatumet, inte hela kalenderperioden."}
            {data.missing > 0 && ` ${data.missing} dagsstaplar saknar slutkurs och har utelämnats.`}
            {data.points.length < 2 && " Endast en observation finns; utvecklingen kan ännu inte beräknas."}
            {` Senaste slutkurs ${data.points.at(-1).date}. Pågående lokal handelsdag utelämnas. Handelsfria dagar och dataluckor fylls inte i; full täckning av alla handelssessioner är inte verifierad.`}
        </p>
        <PortfolioHistoryChart view={standaloneIndexView(data)} focused={focused} onFocus={onFocus}
            formatMoney={value => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`} currency={data.currency} />
    </>;
}
