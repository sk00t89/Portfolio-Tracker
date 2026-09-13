import {formatSek} from "../utils/formatting.js";
import {searchInstrument} from "../services/marketData.js";

function Holdings({
                      holdings,
                      enrichHolding,
                      possibleMatches,
                      confirmMatch,
                      resolveMatch
}) {
    return (
        <div className="holdings-page">
            <h1>Innehav</h1>
            {possibleMatches.map((match) => (
                <div key={`${match.firstId}-${match.secondId}`}>
                    <p>
                        Är detta samma värdepapper?
                    </p>

                    <p>{match.firstName}</p>
                    <p>{match.secondName}</p>

                    <button
                        type="button"
                        onClick={() => {
                            confirmMatch(match.firstId, match.secondId);
                            resolveMatch(match.firstId, match.secondId);
                        }}
                    >
                        Ja
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            resolveMatch(match.firstId, match.secondId);
                        }}
                    >
                        Nej
                    </button>
                </div>
            ))}
            <div className="holdings-list">
                {holdings.map((holding) => (
                    <div className="holding-card" key={holding.id}>
                        <div>
                            <h3>{holding.name}</h3>
                            <p>{holding.platform}</p>
                            <p>{holding.isin}</p>
                            <p>{holding.ticker}</p>
                            <p>{holding.assetType}</p>
                        </div>

                        <div>
                            <p>
                                {holding.quantity.toLocaleString("sv-SE")} st
                            </p>

                            <strong>
                                {formatSek(holding.valueSek)}
                            </strong>
                            {holding.platform === "Nordnet" && !holding.assetType && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const data = await searchInstrument(holding.name);

                                            if (!data || !data.assetType) {
                                                console.log("Kunde inte berika:", holding.name);
                                                return;
                                            }

                                            enrichHolding(holding.id, data);
                                        } catch (error) {
                                            console.error("Berikning misslyckades:", error);
                                        }
                                    }}
                                >
                                    Berika
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Holdings;