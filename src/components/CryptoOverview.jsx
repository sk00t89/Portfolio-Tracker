import {useEffect, useState} from "react";
import {formatSek} from "../utils/formatting.js";
import {getCryptoPrices} from "../services/cryptoData.js";
import {cryptoCoinIds} from "../utils/cryptoCoinIds.js";

function CryptoOverview({cryptoExposure, portfolioValue}) {
    const totalCryptoValue = Object.values(cryptoExposure).reduce(
        (total, value) => total + value,
        0
    );

    const [cryptoPrices, setCryptoPrices] = useState({});

    useEffect(() => {
        const coinIds = Object.keys(cryptoExposure)
            .filter((coin) => coin !== "INDEX")
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
    }, [cryptoExposure]);

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
                        const coinId = cryptoCoinIds[coin];

                        const coinPrice =
                            coinId
                                ? cryptoPrices[coinId]?.sek
                                : null;

                        const equivalentCoins =
                            coinPrice
                                ? value / coinPrice
                                : null;
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
                                {equivalentCoins !== null && (
                                    <span className="crypto-equivalent">
                                                 ≈{" "}
                                        {equivalentCoins.toLocaleString(
                                            "sv-SE",
                                            {
                                                maximumFractionDigits: 4,
                                            }
                                        )}{" "}
                                        {coin}
                                 </span>
                                )}
                            </div>
                        );
                    })}
            </div>
        </section>
    );
}

export default CryptoOverview;
