import {formatSek} from "../utils/formatting.js";
import {useState} from "react";

function HoldingsOverview({
                              groupedHoldings,

                          }) {
    const sortedHoldings = [...groupedHoldings].sort(
        (a, b) => b.totalValue - a.totalValue
    );

    const [showAll, setShowAll] = useState(false);
    const visibleHoldings = showAll
        ? sortedHoldings
        : sortedHoldings.slice(0, 13);

    const groupedHoldingsTotalValue =
        groupedHoldings.reduce(
            (total, holding) =>
                total + holding.totalValue,
            0
        );



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
                    <strong>{formatSek(groupedHoldingsTotalValue)}</strong>
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
                        groupedHoldingsTotalValue > 0
                            ? (
                            holding.totalValue /
                            groupedHoldingsTotalValue
                        ) * 100
                            : 0;

                    const isLysaOnly =
                        holding.positions.every(
                            (position) =>
                                position.platform === "Lysa"
                        );

                    const investedCapital =
                        holding.positions.reduce(
                            (total, position) => {
                                if (
                                    !position.averagePriceSek ||
                                    !position.quantity
                                ) {
                                    return total;
                                }

                                return total +
                                    position.averagePriceSek *
                                    position.quantity;
                            },
                            0
                        );

                    const changePercent =
                        investedCapital > 0
                            ? (
                            (
                                holding.totalValue -
                                investedCapital
                            ) /
                            investedCapital
                        ) * 100
                            : null;

                    return (
                        <div
                            className="data-row"
                            key={holding.instrumentKey}
                        >
                            <div className="holding-overview-info">
                                <strong className="holding-overview-name">
                                    {holding.name}
                                </strong>

                                {!isLysaOnly && investedCapital > 0 && (
                                    <span className="holding-overview-performance">
                                        GAV{" "}
                                        {formatSek(
                                            investedCapital
                                        )}
                                        {" · "}
                                        <span className={
                                            changePercent >=0
                                            ? "positive-text"
                                            : "negative-text"
                                        }
                                        >
                                            {changePercent >= 0 ? "+" : ""}
                                            {changePercent.toFixed(1)}%
                                        </span>

                                    </span>
                                    )}
                            </div>

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