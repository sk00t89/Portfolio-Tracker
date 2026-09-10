
function PortfolioSummary({ portfolioValue, investedCapital }) {

    const profit = portfolioValue - investedCapital;
    const profitPercent = (portfolioValue / investedCapital - 1) * 100;
    return (
        <div className="card summary-card">
            <h2>Totalt portföljvärde</h2>
            <p>{portfolioValue.toLocaleString("sv-SE")} kr</p>
            <p>Insatt kapital {investedCapital.toLocaleString("sv-SE")} kr</p>

            <h2>Kapitalförändring</h2>
            <p>+ {profitPercent.toFixed(2)} %</p>
            <p>+ {profit.toLocaleString("sv-SE")} kr</p>

        </div>
    );
}

export default PortfolioSummary;