import {useEffect, useState} from "react";

const EMPTY_EXPOSURE = {};
import {formatSek} from "../utils/formatting.js";
import {getCryptoPrices} from "../services/cryptoData.js";
import {cryptoCoinIds} from "../utils/cryptoCoinIds.js";

function CryptoOverview({cryptoExposure, portfolioValue, formatMoney = formatSek}) {
    const summary = cryptoExposure.summary ?? EMPTY_EXPOSURE;
    const details = cryptoExposure.details ?? EMPTY_EXPOSURE;

    const totalCryptoValue = Object.values(summary).reduce(
        (total, value) => total + value,
        0
    );

    const [cryptoPrices, setCryptoPrices] = useState({});
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const coinIds = Object.keys(details)

            .map((coin) => cryptoCoinIds[coin])
            .filter(Boolean);

        if (coinIds.length === 0) {
            return;
        }

        const loadCryptoPrices = async () => {
            try {
                const prices =
                    await getCryptoPrices(coinIds);

                setCryptoPrices(prices);
            } catch (error) {
                console.error(
                    "Kunde inte hämta kryptopriser:",
                    error
                );
            }
        };

        loadCryptoPrices();
    }, [details]);

    const portfolioPercentage =
        portfolioValue > 0
            ? (totalCryptoValue / portfolioValue) * 100
            : 0;

    return (
        <section className="card crypto-overview"
                 onClick={() => setShowDetails((current) => !current)}
        >
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Underliggande</span>
                    <h2>Krypto</h2>
                </div>

                <div className="section-total">
                    <strong>{formatMoney(totalCryptoValue)}</strong>
                    <span>{portfolioPercentage.toFixed(2)} % av portföljen</span>
                </div>
                <span className="crypto-details-toggle">
                    {showDetails ? "Dölj detaljer" : "Visa detaljer"}
                </span>
            </div>

            <div className="data-list">
                {showDetails ? (
                    Object.entries(details)
                        .sort(([, valueA], [, valueB]) =>
                            valueB.total - valueA.total
                        )
                        .map(([coin, value]) => {
                            const coinId = cryptoCoinIds[coin];

                            const coinPrice =
                                coinId
                                    ? cryptoPrices[coinId]?.sek
                                    : null;

                            const equivalentCoins =
                                coinPrice
                                    ? value.total / coinPrice
                                    : null;

                            const percentage =
                                totalCryptoValue > 0
                                    ? (value.total / totalCryptoValue) * 100
                                    : 0;

                            return (
                                <div className="data-row" key={coin}>
                                    <span>{coin}</span>

                                    <strong>
                                        {formatMoney(value.total)}
                                    </strong>

                                    <span className="muted">
                            {percentage.toFixed(2)} %
                                     </span>
                                    {showDetails && (
                                        <div className="crypto-breakdown">
                                            {value.direct > 0 && (
                                                <span>
                                                    Direkt
                                                <strong>{formatMoney(value.direct)}</strong>
                                                </span>
                                            )}

                                            {value.etp > 0 && (
                                                <span>
                                                    ETP
                                                <strong>{formatMoney(value.etp)}</strong>
                                                </span>
                                            )}

                                            {value.index > 0 && (
                                                <span>
                                                Via index
                                                <strong>{formatMoney(value.index)}</strong>
                                                </span>
                                            )}

                                            {equivalentCoins !== null && (
                                                <span className="crypto-equivalent">
                                                         ≈{" "}
                                                    {equivalentCoins.toLocaleString("sv-SE", {
                                                        maximumFractionDigits: 4,
                                                    })}{" "}
                                                    {coin} exponering
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                ) : (
                    Object.entries(summary)
                        .sort(([, valueA], [, valueB]) =>
                            valueB - valueA
                        )
                        .map(([coin, value]) => {
                            const percentage =
                                totalCryptoValue > 0
                                    ? (value / totalCryptoValue) * 100
                                    : 0;

                            return (
                                <div className="data-row" key={coin}>
                                    <span>{coin}</span>

                                    <strong>
                                        {formatMoney(value)}
                                    </strong>

                                    <span className="muted">
                            {percentage.toFixed(2)} %
                        </span>
                                </div>
                            );
                        })
                )}
            </div>
        </section>
    );
}

export default CryptoOverview;
