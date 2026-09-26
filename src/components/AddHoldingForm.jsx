import {useState} from "react";
import {searchNordnetInstruments} from "../services/instrumentSearch.js";


function AddHoldingForm() {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [selectedInstrument, setSelectedInstrument] = useState(null);
    const [platform, setPlatform] = useState("");
    const [quantity, setQuantity] = useState("");
    const [averagePrice, setAveragePrice] = useState("");

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
                </div>
            )}
        </div>
    );
}

export default AddHoldingForm;