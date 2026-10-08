import {useState} from "react";
import { normalizeQuoteTimestamp } from "../utils/valuationFreshness.js";
import {
    searchCrypto,
    getCryptoPrice
} from "../services/cryptoData.js";
import {
    formatNumberInput,
    parseFormattedNumber
} from "../utils/formatting.js";

function AssetForm({
                       addAsset,
                       manualAssetsDisabled = false,
                       importHoldings
}) {
    const [assetName, setAssetName] = useState("");
    const [assetValue, setAssetValue] = useState("");
    const [assetCategory, setAssetCategory] = useState("");
    const [alertVisible, setAlertVisibility] = useState(false);

    const [cryptoQuery, setCryptoQuery] = useState("");
    const [cryptoResults, setCryptoResults] = useState([]);
    const [selectedCrypto, setSelectedCrypto] = useState(null);
    const [cryptoQuantity, setCryptoQuantity] = useState("");
    const [cryptoPlatform, setCryptoPlatform] = useState("");
    const [cryptoError, setCryptoError] = useState("");

    const isBtnDisabled =
        assetName.trim() === "" ||
        assetCategory === "" ||
        parseFormattedNumber(assetValue) < 1;

    const addNewAsset = async (event) => {
        event.preventDefault();

        if (isBtnDisabled || manualAssetsDisabled) {
            setAlertVisibility(true);
            return;
        }

        const cleanName = assetName.trim();

        const formattedName =
            cleanName.charAt(0).toUpperCase() +
            cleanName.slice(1);

        const saved = await addAsset({
            name: formattedName,
            category: assetCategory,
            value: parseFormattedNumber(assetValue),
            source: "manual"
        });
        if (!saved) return;

        setAssetValue("");
        setAssetName("");
        setAssetCategory("");
        setAlertVisibility(false);
    };

    const handleCryptoSearch = async () => {
        if (!cryptoQuery.trim()) {
            return;
        }

        try {
            const results =
                await searchCrypto(cryptoQuery.trim());

            setCryptoResults(results);
            setSelectedCrypto(null);
            setCryptoError("");
        } catch (error) {
            console.error(
                "Kryptosökningen misslyckades:",
                error
            );

            setCryptoError(
                "Kunde inte söka krypto."
            );
        }
    };

    const resetCryptoForm = () => {
        setCryptoQuery("");
        setCryptoResults([]);
        setSelectedCrypto(null);
        setCryptoQuantity("");
        setCryptoPlatform("");
        setCryptoError("");
    };

    const handleAddCrypto = async () => {
        if (
            !selectedCrypto ||
            !cryptoQuantity ||
            !cryptoPlatform.trim()
        ) {
            setCryptoError(
                "Välj krypto och fyll i plattform samt antal."
            );
            return;
        }

        const quantityNumber =
            Number(cryptoQuantity);

        if (quantityNumber <= 0) {
            setCryptoError(
                "Antal måste vara större än 0."
            );
            return;
        }

        try {
            const priceData =
                await getCryptoPrice(
                    selectedCrypto.id
                );

            const currentValueSek =
                quantityNumber *
                priceData.price;

            const newHolding = {
                name: selectedCrypto.name,
                ticker: selectedCrypto.symbol,
                coinId: selectedCrypto.id,

                platform: cryptoPlatform.trim(),

                quantity: quantityNumber,

                currentPrice: priceData.price,
                currentValueSek,

                currency: "SEK",

                assetType: "CRYPTO",
                category: "CRYPTO",
                underlying: selectedCrypto.symbol,
                productType: "DIRECT_CRYPTO",

                source: "direct-crypto",
                priceUpdatedAt: normalizeQuoteTimestamp(priceData.timestamp),
            };

            importHoldings([newHolding]);

            resetCryptoForm();

        } catch (error) {
            console.error(
                "Kunde inte lägga till krypto:",
                error
            );

            setCryptoError(
                "Kunde inte hämta aktuell kryptokurs."
            );
        }
    };

    return (
        <section className="card">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Övriga tillgångar</span>
                    <h2>Lägg till manuellt</h2>
                </div>
            </div>

            <form onSubmit={addNewAsset} className="asset-form">
                {alertVisible && (
                    <p className="form-message">
                        Kontrollera namn, kategori och värde.
                    </p>
                )}

                <select
                    value={assetCategory}
                    onChange={(event) =>
                        setAssetCategory(event.target.value)
                    }
                >
                    <option value="">Välj tillgångstyp</option>
                    <option value="crypto">Crypto</option>
                    <option value="cash">Cash</option>
                    <option value="other">Annat</option>
                </select>
                {assetCategory === "crypto" ? (
                    <div className="crypto-form">
                        <div className="instrument-search">
                            <input
                                type="text"
                                placeholder="Sök krypto, t.ex. Ethereum"
                                value={cryptoQuery}
                                onChange={(event) =>
                                    setCryptoQuery(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleCryptoSearch();
                                    }
                                }}
                            />

                            <button
                                className="primary-button"
                                type="button"
                                onClick={handleCryptoSearch}
                            >
                                Sök
                            </button>
                        </div>

                        {cryptoError && (
                            <p className="form-message">
                                {cryptoError}
                            </p>
                        )}

                        {cryptoResults.length > 0 && (
                            <div className="instrument-results">
                                {cryptoResults.map((coin) => (
                                    <button
                                        className="instrument-result"
                                        key={coin.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCrypto(coin);
                                            setCryptoResults([]);
                                        }}
                                    >
                        <span className="instrument-result-main">
                            <strong>
                                {coin.name}
                            </strong>

                            <small>
                                {coin.symbol}
                            </small>
                        </span>

                                        {coin.marketCapRank && (
                                            <span className="instrument-result-price">
                                #{coin.marketCapRank}
                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedCrypto && (
                            <div className="selected-instrument">
                                <div className="selected-instrument-header">
                                    <div>
                        <span className="eyebrow">
                            Valt krypto
                        </span>

                                        <h3>
                                            {selectedCrypto.name}
                                        </h3>

                                        <p>
                                            {selectedCrypto.symbol}
                                        </p>
                                    </div>
                                </div>

                                <div className="form-grid">
                                    <label>
                                        Plattform
                                        <input
                                            type="text"
                                            placeholder="T.ex. Ledger, Coinbase"
                                            value={cryptoPlatform}
                                            onChange={(event) =>
                                                setCryptoPlatform(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>

                                    <label>
                                        Antal
                                        <input
                                            type="number"
                                            step="any"
                                            placeholder="0.34"
                                            value={cryptoQuantity}
                                            onChange={(event) =>
                                                setCryptoQuantity(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                </div>
                                <div className="button-row">
                                    <button
                                        className="primary-button"
                                        type="button"
                                        onClick={handleAddCrypto}
                                    >
                                        Lägg till krypto
                                    </button>

                                    <button
                                        className="ghost-button"
                                        type="button"
                                        onClick={resetCryptoForm}
                                    >
                                        Avbryt
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            placeholder="Tillgångens namn"
                            value={assetName}
                            onChange={(event) =>
                                setAssetName(event.target.value)
                            }
                        />

                        <input
                            type="text"
                            inputMode="numeric"
                            value={assetValue}
                            placeholder="Värde i SEK"
                            onChange={(event) =>
                                setAssetValue(
                                    formatNumberInput(event.target.value)
                                )
                            }
                        />

                        <button
                            className="primary-button"
                            type="submit"
                            disabled={isBtnDisabled || manualAssetsDisabled}
                        >
                            Lägg till tillgång
                        </button>
                    </>
                )}


            </form>
        </section>
    );
}

export default AssetForm;
