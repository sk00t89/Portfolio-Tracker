import {formatSek} from "../utils/formatting.js";

function PortfolioSummary({portfolioValue, investedCapital, formatMoney = formatSek, dailyChange, updatingPrices, valuesLoading}) {
    const hasInvestedCapital = investedCapital > 0;
    const profit = portfolioValue == null || valuesLoading ? null : portfolioValue - investedCapital;
    const profitPercent = hasInvestedCapital && profit != null
        ? (portfolioValue / investedCapital - 1) * 100
        : null;

    const profitClass =
        profit >= 0
            ? "summary-change positive"
            : "summary-change negative";

    return (
        <section className="card summary-card">
            <div className="summary-main">
                <span className="eyebrow">Total portfölj</span>
                <h1>{portfolioValue == null ? "–" : formatMoney(portfolioValue)}</h1>
                {(updatingPrices || valuesLoading) && <small className="muted" role="status">
                    {valuesLoading ? "Läser sparat portföljvärde…" : "Uppdaterar kurser… tidigare värden visas"}
                </small>}
                <p className="muted">
                    Insatt kapital {formatMoney(investedCapital)}
                </p>
            </div>

            <div className={`summary-change ${dailyChange?.complete ? (dailyChange.changeSek >= 0 ? "positive" : "negative") : ""}`}>
                <span>Idag</span>
                {dailyChange?.complete && !valuesLoading ? <>
                    <strong>{dailyChange.changeSek >= 0 ? "+" : ""}{formatSek(dailyChange.changeSek)}</strong>
                    <small className={dailyChange.changeSek >= 0 ? "positive-text" : "negative-text"}>
                        {dailyChange.changePercent >= 0 ? "+" : ""}{dailyChange.changePercent.toFixed(2)} %
                    </small>
                </> : <>
                    <strong>–</strong>
                    <small>Ofullständigt underlag · {valuesLoading ? "–" : Math.floor(dailyChange?.coveragePercent ?? 0)} % kurstäckning</small>
                    <small>{dailyChange?.reasons?.[0] ?? "Verifierade dagskurser saknas"}</small>
                </>}
            </div>

            <div className={profitClass}>
                <span>Kapitalförändring</span>
                <strong>
                    {profitPercent == null
                        ? "–"
                        : `${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)} %`}
                </strong>
                <small>
                    {profit == null ? "–" : `${profit >= 0 ? "+" : ""}${formatMoney(profit)}`}
                </small>
            </div>
        </section>
    );
}

export default PortfolioSummary;
