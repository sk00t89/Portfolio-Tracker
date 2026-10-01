import {formatSek} from "../utils/formatting.js";
import {useState} from "react";

function HoldingsOverview({
                              groupedHoldings,
                              portfolioValue
                          }) {
    const sortedHoldings = [...groupedHoldings].sort(
        (a, b) => b.totalValue - a.totalValue
    );

    const [showAll, setShowAll] = useState(false);
    const visibleHoldings = showAll
        ? sortedHoldings
        : sortedHoldings.slice(0, 13);




    return (
        <section
            className="card holdings-overview"
            onClick={() => setShowAll((current) => !current)}
        >
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Översikt</span>
                    <h2>Innehav</h2>
                </div>

                <div className= "section-total">
                    <strong>{formatSek(portfolioValue)}</strong>
                    <span>Samtliga innehav i portföljen</span>
                </div>
                <span className="holdings-viewAll-toggle">
                    {showAll
                    ? "Visa färre"
                    : `Visa alla ${sortedHoldings.length}`}
                </span>
            </div>

            <div className="data-list">
                {visibleHoldings.map((holding) => {
                    const percentage =
                        portfolioValue > 0
                            ? (
                            holding.totalValue /
                            portfolioValue
                        ) * 100
                            : 0;

                    return (
                        <div
                            className="data-row"
                            key={holding.instrumentKey}
                        >
                            <span>
                                {holding.name}
                            </span>

                            <strong>
                                {formatSek(
                                    holding.totalValue
                                )}
                            </strong>

                            <span className="muted">
                                {percentage.toFixed(2)} %
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default HoldingsOverview;