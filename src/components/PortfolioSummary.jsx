import {formatSek} from "../utils/formatting.js";

function PortfolioSummary({portfolioValue, investedCapital}) {
    const hasInvestedCapital = investedCapital > 0;
    const profit = portfolioValue - investedCapital;
    const profitPercent = hasInvestedCapital
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
                <h1>{formatSek(portfolioValue)}</h1>
                <p className="muted">
                    Insatt kapital {formatSek(investedCapital)}
                </p>
            </div>

            <div className={profitClass}>
                <span>Kapitalförändring</span>
                <strong>
                    {profitPercent == null
                        ? "–"
                        : `${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)} %`}
                </strong>
                <small>
                    {profit >= 0 ? "+" : ""}
                    {formatSek(profit)}
                </small>
            </div>
        </section>
    );
}

export default PortfolioSummary;
