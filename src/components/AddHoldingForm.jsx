import {useState} from "react";
import {searchNordnetInstruments} from "../services/instrumentSearch.js";
import {getExchangeRate} from "../services/currencyData.js";





function AddHoldingForm({importHoldings}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [selectedInstrument, setSelectedInstrument] = useState(null);
    const [platform, setPlatform] = useState("");
    const [quantity, setQuantity] = useState("");
    const [averagePrice, setAveragePrice] = useState("");

    const handleSubmit = async () => {
        if (
            !selectedInstrument ||
            !platform.trim() ||
            !quantity ||
            !averagePrice
        ) {
            return;
        }

        const quantityNumber = Number(quantity);
        const averagePriceNumber = Number(averagePrice);

        let currentValueSek = null;
        let averagePriceSek = null;

        if (selectedInstrument.currency) {
            if (selectedInstrument.currency === "SEK") {
                currentValueSek =
                    quantityNumber * selectedInstrument.price;

                averagePriceSek =
                    averagePriceNumber;
            } else {
                const exchangeRate = await getExchangeRate(
                    selectedInstrument.currency,
                    "SEK"
                );

                currentValueSek =
                    quantityNumber *
                    selectedInstrument.price *
                    exchangeRate;

                averagePriceSek =
                    averagePriceNumber *
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
        };

        importHoldings([newHolding]);

        setSelectedInstrument(null);
        setSearchResults([]);
        setSearchQuery("");
        setPlatform("");
        setQuantity("");
        setAveragePrice("");
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            return;
        }

        try {
            const results =
                await searchNordnetInstruments(searchQuery);

            setSearchResults(results);
        } catch (error) {
            console.error(
                "Instrument-sökningen misslyckades:",
                error
            );
        }
    };


    return (
        <div>
            <h2>Lägg till värdepapper</h2>

            <div>
                <input
                    type="text"
                    value={searchQuery}
                    placeholder="Sök aktie, fond eller certifikat"
                    onChange={(event) =>
                        setSearchQuery(event.target.value)
                    }
                />

                <button
                    type="button"
                    onClick={handleSearch}
                >
                    Sök
                </button>
            </div>

            <div>
                {searchResults.map((instrument) => (
                    <button
                        key={`${instrument.provider}-${instrument.instrumentId}`}
                        type="button"
                        onClick={() =>
                            setSelectedInstrument(instrument)
                        }
                    >
                        <strong>
                            {instrument.name}
                        </strong>

                        {" — "}
                        {instrument.ticker}

                        {" — "}
                        {instrument.instrumentTypeName}

                        {" — "}
                        {instrument.currency}
                    </button>
                ))}
            </div>

            {selectedInstrument && (
                <div>
                    <h3>
                        Vald: {selectedInstrument.name}
                    </h3>

                    <p>
                        {selectedInstrument.ticker}
                    </p>

                    <p>
                        {selectedInstrument.instrumentTypeName}
                    </p>

                    <p>
                        Kurs: {selectedInstrument.price}{" "}
                        {selectedInstrument.currency}
                    </p>

                    <input
                        type="text"
                        placeholder="Plattform, t.ex. Länsförsäkringar"
                        value={platform}
                        onChange={(event) =>
                            setPlatform(event.target.value)
                        }
                    />

                    <input
                        type="number"
                        placeholder="Antal"
                        value={quantity}
                        onChange={(event) =>
                            setQuantity(event.target.value)
                        }
                    />

                    <input
                        type="number"
                        placeholder="GAV"
                        value={averagePrice}
                        onChange={(event) =>
                            setAveragePrice(event.target.value)
                        }
                    />
                    <button
                        type="button"
                        onClick={handleSubmit}
                        >
                        Lägg till innehav
                    </button>
                </div>
            )}
        </div>
    );
}

export default AddHoldingForm;