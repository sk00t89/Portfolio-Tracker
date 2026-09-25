import {useState} from "react";
import {formatSek} from "../utils/formatting.js";


function Holdings({
                      possibleMatches,
                      confirmMatch,
                      resolveMatch,
                      groupedHoldings,
                      portfolioValue,
                      enrichHoldingSmart,
                      enrichmentCandidates,
                      selectEnrichmentCandidate,
                      searchEnrichmentCandidates,
                      updateHoldingPrice
                  }) {
    console.log("Candidates i Holdings:", enrichmentCandidates);
    const [manualSearch, setManualSearch] = useState("");
    const [sortBy, setSortBy] = useState("alphabetical");

    const sortedHoldings = [...groupedHoldings].sort((a, b) => {
        if (sortBy === "alphabetical") {
            return a.name.localeCompare(b.name, "sv");
        }

        if (sortBy === "largest") {
            return b.totalValue - a.totalValue;
        }

        if (sortBy === "smallest") {
            return a.totalValue - b.totalValue;
        }

        return 0;
    });

    return (
        <div className="holdings-page">
            <h1>Innehav</h1>
            <div className="select-div">
                <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                >
                    <option value="alphabetical">Alfabetiskt</option>
                    <option value="largest">Störst först</option>
                    <option value="smallest">Minst först</option>
                </select>
            </div>

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
                {sortedHoldings.map((group) => (
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
                                <div key={position.id}>
                                    <div className="holding-position">
                                        <span>{position.platform}</span>

                                        <span>
                {position.quantity.toLocaleString("sv-SE")} st
            </span>




                                        {position.platform === "Nordnet" &&
                                            (!position.isin || !position.ticker || !position.assetType) && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            await enrichHoldingSmart(position.id);
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

                                    {enrichmentCandidates?.holdingId === position.id && (
                                        <div className="enrichment-candidates">
                                            <h4>
                                                Välj rätt instrument för{" "}
                                                {enrichmentCandidates.holdingName}
                                            </h4>

                                            {enrichmentCandidates.candidates.map((candidate) => (
                                                <button
                                                    className="enrichment-candidate-button"
                                                    key={`${candidate.ticker}-${candidate.exchange}`}
                                                    type="button"
                                                    onClick={() =>
                                                        selectEnrichmentCandidate(candidate)
                                                    }
                                                >
                                                    {candidate.name} — {candidate.ticker} —{" "}
                                                    {candidate.exchange} — {candidate.currency}
                                                </button>
                                            ))}

                                            <div className="enrichment-manual-search">
                                                <input
                                                    type="text"
                                                    value={manualSearch}
                                                    placeholder="Sök själv, t.ex. BRK-B"
                                                    onChange={(event) =>
                                                        setManualSearch(event.target.value)
                                                    }
                                                />

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        searchEnrichmentCandidates(manualSearch)
                                                    }
                                                >
                                                    Sök
                                                </button>
                                            </div>
                                        </div>
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