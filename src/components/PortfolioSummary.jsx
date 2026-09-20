import { formatSek} from "../utils/formatting.js";

function PortfolioSummary({ portfolioValue, investedCapital }) {

    const profit = portfolioValue - investedCapital;
    const profitPercent = (portfolioValue / investedCapital - 1) * 100;
    return (
        <div className="card summary-card">
            <h2>Totalt portföljvärde</h2>
            <p>{formatSek(portfolioValue)}</p>
            <p>Insatt kapital {formatSek(investedCapital)}</p>

            <h2>Kapitalförändring</h2>
            <p>+ {profitPercent.toFixed(2)} %</p>
            <p>+ {formatSek(profit)} </p>

        </div>
    );
}

export default PortfolioSummary;