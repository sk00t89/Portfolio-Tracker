import {formatSek} from "../utils/formatting.js";

function CryptoOverview({cryptoExposure, portfolioValue}) {
    const totalCryptoValue = Object.values(cryptoExposure).reduce(
        (total, value) => total + value,
        0
    );

    const portfolioPercentage =
        portfolioValue > 0
            ? (totalCryptoValue / portfolioValue) * 100
            : 0;

    return (
        <section className="card crypto-overview">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Underliggande</span>
                    <h2>Krypto</h2>
                </div>

                <div className="section-total">
                    <strong>{formatSek(totalCryptoValue)}</strong>
                    <span>{portfolioPercentage.toFixed(2)} % av portföljen</span>
                </div>
            </div>

            <div className="data-list">
                {Object.entries(cryptoExposure)
                    .sort(([, valueA], [, valueB]) => valueB - valueA)
                    .map(([coin, value]) => {
                        const percentage =
                            totalCryptoValue > 0
                                ? (value / totalCryptoValue) * 100
                                : 0;

                        return (
                            <div className="data-row" key={coin}>
                                <span>{coin}</span>
                                <strong>{formatSek(value)}</strong>
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

export default CryptoOverview;
