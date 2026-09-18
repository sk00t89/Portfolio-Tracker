import {formatSek} from "../utils/formatting.js";
import {searchInstrument} from "../services/marketData.js";

function Holdings({
                      enrichHolding,
                      possibleMatches,
                      confirmMatch,
                      resolveMatch,
                      groupedHoldings,
                      portfolioValue,
                  }) {
    return (
        <div className="holdings-page">
            <h1>Innehav</h1>

            {possibleMatches.map((match) => (
                <div key={`${match.firstId}-${match.secondId}`}>
                    <p>Är detta samma värdepapper?</p>
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
                {groupedHoldings.map((group) => (
                    <div
                        className="holding-card"
                        key={group.instrumentKey}
                    >
                        <div className="holding-card-header">
                            <h3>{group.name}</h3>

                            <div className="holding-summary">
                                <strong>
                                    {formatSek(group.totalValue)}
                                </strong>

                                <span>
                                {(
                                    (group.totalValue / portfolioValue) *
                                    100
                                ).toLocaleString("sv-SE", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                    %
                            </span>
                            </div>
                        </div>

                        <div className="holding-positions">
                            {group.positions.map((position) => (
                                <div
                                    className="holding-position"
                                    key={position.id}
                                >
                                    <span>{position.platform}</span>

                                    <span>
                                    {position.quantity.toLocaleString("sv-SE")} st
                                </span>

                                    <strong>
                                        {formatSek(position.valueSek)}
                                    </strong>

                                    {position.platform === "Nordnet" &&
                                        !position.assetType && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        const data =
                                                            await searchInstrument(
                                                                position.name
                                                            );

                                                        if (
                                                            !data ||
                                                            !data.assetType
                                                        ) {
                                                            console.log(
                                                                "Kunde inte berika:",
                                                                position.name
                                                            );
                                                            return;
                                                        }

                                                        await enrichHolding(
                                                            position.id,
                                                            data
                                                        );
                                                    } catch (error) {
                                                        console.error(
                                                            "Berikning misslyckades:",
                                                            error
                                                        );
                                                    }
                                                }}
                                            >
                                                Berika
                                            </button>
                                        )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Holdings;