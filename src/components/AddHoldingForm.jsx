import {useState} from "react";
import {
    searchNordnetInstruments,
    searchAvanzaInstruments
} from "../services/instrumentSearch.js";
import {getExchangeRate} from "../services/currencyData.js";
import {
    mergeInstrumentsResults
} from "../utils/mergeInstrumentsResults.js";

function AddHoldingForm({importHoldings}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [selectedInstrument, setSelectedInstrument] = useState(null);
    const [platform, setPlatform] = useState("");
    const [quantity, setQuantity] = useState("");
    const [averagePrice, setAveragePrice] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            return;
        }

        setIsSearching(true);
        setErrorMessage("");

        try {
            const [
                nordnetResults,
                avanzaResults
            ] = await Promise.all([
                searchNordnetInstruments(searchQuery.trim()),
                searchAvanzaInstruments(searchQuery.trim()),
            ]);

            const results =
                mergeInstrumentsResults(
                    nordnetResults,
                    avanzaResults
                );


            setSearchResults(results);
            setSelectedInstrument(null);

            if (results.length === 0) {
                setErrorMessage("Inga värdepapper hittades.");
            }
        } catch (error) {
            console.error(
                "Instrument-sökningen misslyckades:",
                error
            );
            setErrorMessage(
                "Sökningen misslyckades. Kontrollera att backend kör."
            );
        } finally {
            setIsSearching(false);
        }
    };

    const handleSubmit = async () => {
        if (
            !selectedInstrument ||
            !platform.trim() ||
            !quantity ||
            !averagePrice
        ) {
            setErrorMessage(
                "Välj instrument och fyll i plattform, antal och GAV."
            );
            return;
        }

        const quantityNumber = Number(quantity);
        const averagePriceNumber = Number(averagePrice);

        if (
            quantityNumber <= 0 ||
            averagePriceNumber < 0
        ) {
            setErrorMessage(
                "Antal måste vara större än 0 och GAV kan inte vara negativt."
            );
            return;
        }

        let currentValueSek = null;
        let averagePriceSek = null;

        if (selectedInstrument.currency) {
            let exchangeRate = 1;

            if (selectedInstrument.currency !== "SEK") {
                exchangeRate = await getExchangeRate(
                    selectedInstrument.currency,
                    "SEK"
                );
            }

            averagePriceSek =
                averagePriceNumber * exchangeRate;

            const currentPrice =
                Number(selectedInstrument.price);

            if (Number.isFinite(currentPrice)) {
                currentValueSek =
                    quantityNumber *
                    currentPrice *
                    exchangeRate;
            }
        }

        const newHolding = {
            name: selectedInstrument.name,
            ticker: selectedInstrument.ticker,
            isin: selectedInstrument.isin,
            assetType: selectedInstrument.assetType,
            currency: selectedInstrument.currency,
            country: selectedInstrument.country,
            platform: platform.trim(),
            quantity: quantityNumber,
            averagePrice: averagePriceNumber,
            averagePriceSek,
            currentPrice: selectedInstrument.price,
            currentValueSek,
            priceUpdatedAt: Date.now(),
            instrumentId: selectedInstrument.instrumentId,
            provider: selectedInstrument.provider,
            market: selectedInstrument.market,
        };

        importHoldings([newHolding]);

        setSelectedInstrument(null);
        setSearchResults([]);
        setSearchQuery("");
        setPlatform("");
        setQuantity("");
        setAveragePrice("");
        setErrorMessage("");
    };

    return (
        <section className="card add-holding-card">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Manuellt innehav</span>
                    <h2>Lägg till värdepapper</h2>
                </div>

                <div className="provider-badges">
                    <span className="section-badge">Nordnet-sök</span>
                    <span className="section-badge">Avanza-sök</span>
                </div>
            </div>

            <div className="instrument-search">
                <input
                    type="text"
                    value={searchQuery}
                    placeholder="Sök aktie, fond eller certifikat"
                    onChange={(event) =>
                        setSearchQuery(event.target.value)
                    }
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            handleSearch();
                        }
                    }}
                />

                <button
                    className="primary-button"
                    type="button"
                    onClick={handleSearch}
                    disabled={isSearching}
                >
                    {isSearching ? "Söker..." : "Sök"}
                </button>

                {(searchQuery || searchResults.length > 0 || selectedInstrument) && (
                    <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                            setSearchQuery("");
                            setSearchResults([]);
                            setSelectedInstrument(null);
                            setPlatform("");
                            setQuantity("");
                            setAveragePrice("");
                            setErrorMessage("");
                        }}
                    >
                        Avbryt
                    </button>
                )}
            </div>

            {errorMessage && (
                <p className="form-message">
                    {errorMessage}
                </p>
            )}

            {searchResults.length > 0 && (
                <div className="instrument-results">
                    {searchResults.map((instrument) => (
                        <button
                            className={
                                selectedInstrument?.instrumentId === instrument.instrumentId
                                    ? "instrument-result selected"
                                    : "instrument-result"
                            }
                            key={`${instrument.provider}-${instrument.instrumentId}`}
                            type="button"
                            onClick={() => {
                                setSelectedInstrument(instrument);
                                setSearchResults([]);
                                setErrorMessage("");
                            }}
                        >
                            <span className="instrument-result-main">
                                <strong>{instrument.name}</strong>
                                <small>
                                    {instrument.ticker || "Ingen ticker"} ·{" "}
                                    {instrument.instrumentTypeName || instrument.assetType}
                                </small>
                            </span>

                            <span className="instrument-result-price">
                                {instrument.price != null
                                    ? `${instrument.price.toLocaleString("sv-SE")} ${instrument.currency ?? ""}`
                                    : "Kurs saknas"}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {selectedInstrument && (
                <div className="selected-instrument">
                    <div className="selected-instrument-header">
                        <div>
                            <span className="eyebrow">Valt instrument</span>
                            <h3>{selectedInstrument.name}</h3>
                            <p>
                                {selectedInstrument.ticker} ·{" "}
                                {selectedInstrument.instrumentTypeName}
                            </p>
                        </div>

                        <strong>
                            {selectedInstrument.price != null
                                ? `${selectedInstrument.price.toLocaleString("sv-SE")} ${selectedInstrument.currency ?? ""}`
                                : "Kurs saknas"}
                        </strong>
                    </div>

                    <div className="form-grid">
                        <label>
                            Plattform
                            <input
                                type="text"
                                placeholder="T.ex. Länsförsäkringar"
                                value={platform}
                                onChange={(event) =>
                                    setPlatform(event.target.value)
                                }
                            />
                        </label>

                        <label>
                            Antal
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={quantity}
                                onChange={(event) =>
                                    setQuantity(event.target.value)
                                }
                            />
                        </label>

                        <label>
                            GAV ({selectedInstrument.currency ?? "valuta"})
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={averagePrice}
                                onChange={(event) =>
                                    setAveragePrice(event.target.value)
                                }
                            />
                        </label>
                    </div>

                    <button
                        className="primary-button"
                        type="button"
                        onClick={handleSubmit}
                    >
                        Lägg till innehav
                    </button>
                </div>
            )}
        </section>
    );
}

export default AddHoldingForm;
