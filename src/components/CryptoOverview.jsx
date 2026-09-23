import {formatSek} from "../utils/formatting.js";


function CryptoOverview({cryptoExposure, portfolioValue}) {
    const totalCryptoValue = Object.values(cryptoExposure).reduce(
        (total, value) => total + value,
        0
    );

    return (
        <div className="crypto-overview">
            <h2>Crypto</h2>

            <p>
                Totalt: <strong>{formatSek(totalCryptoValue)}</strong>

            </p>
            <p>
                {((totalCryptoValue / portfolioValue) * 100).toLocaleString("sv-SE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })} % av totala portföljen.
            </p>

            {Object.entries(cryptoExposure)
                .sort(([, valueA], [, valueB]) => valueB - valueA)
                .map(([coin, value]) => (
                <div
                    className="crypto-exposure-row"
                    key={coin}
                >
                    <span>{coin}</span>

                    <span>
                        {formatSek(value)}
                    </span>

                    <span>
                        {(
                            (value / totalCryptoValue) *
                            100
                        ).toLocaleString("sv-SE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })} %
                    </span>
                </div>
            ))}
        </div>
    );
}

export default CryptoOverview;