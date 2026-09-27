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
    deleteHolding
}) {
    const [manualSearch, setManualSearch] = useState("");
    const [sortBy, setSortBy] = useState("largest");

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
        <main className="page holdings-page">
            <div className="page-heading page-heading-row">
                <div>
                    <span className="eyebrow">Portfölj</span>
                    <h1>Innehav</h1>
                    <p>
                        Alla positioner samlade över dina plattformar.
                    </p>
                </div>

                <select
                    className="compact-select"
                    value={sortBy}
                    onChange={(event) =>
                        setSortBy(event.target.value)
                    }
                >
                    <option value="alphabetical">Alfabetiskt</option>
                    <option value="largest">Störst först</option>
                    <option value="smallest">Minst först</option>
                </select>
            </div>

            {possibleMatches.length > 0 && (
                <section className="match-panel">
                    <span className="eyebrow">Behöver din hjälp</span>
                    <h2>Möjliga dubbletter</h2>

                    {possibleMatches.map((match) => (
                        <div
                            className="match-row"
                            key={`${match.firstId}-${match.secondId}`}
                        >
                            <div>
                                <strong>{match.firstName}</strong>
                                <span> ↔ </span>
                                <strong>{match.secondName}</strong>
                            </div>

                            <div className="button-row">
                                <button
                                    className="primary-button small-button"
                                    type="button"
                                    onClick={() => {
                                        confirmMatch(
                                            match.firstId,
                                            match.secondId
                                        );
                                        resolveMatch(
                                            match.firstId,
                                            match.secondId
                                        );
                                    }}
                                >
                                    Samma
                                </button>

                                <button
                                    className="ghost-button small-button"
                                    type="button"
                                    onClick={() =>
                                        resolveMatch(
                                            match.firstId,
                                            match.secondId
                                        )
                                    }
                                >
                                    Olika
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            <div className="holdings-list">
                {sortedHoldings.map((group) => {
                    const isLysaOnly =
                        group.positions.every(
                            (position) =>
                                position.platform === "Lysa"
                        );

                    const percentage =
                        portfolioValue > 0
                            ? (group.totalValue / portfolioValue) * 100
                            : 0;

                    return (
                        <article
                            className="holding-card"
                            key={group.instrumentKey}
                        >
                            <div className="holding-card-header">
                                <div>
                                    <h3>{group.name}</h3>
                                    <span className="holding-meta">
                                        {group.positions.length}{" "}
                                        {group.positions.length === 1
                                            ? "position"
                                            : "positioner"}
                                    </span>
                                </div>

                                <div className="holding-summary">
                                    {isLysaOnly && group.totalValue === 0 ? (
                                        <>
                                            <strong>Ingår i Lysa-total</strong>
                                            <span>Andelar visas nedan</span>
                                        </>
                                    ) : (
                                        <>
                                            <strong>
                                                {formatSek(group.totalValue)}
                                            </strong>
                                            <span>
                                                {percentage.toFixed(2)} %
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="holding-positions">
                                {group.positions.map((position) => (
                                    <div
                                        className="holding-position"
                                        key={position.id}
                                    >
                                        <span className="platform-pill">
                                            {position.platform}
                                        </span>

                                        <span>
                                            {position.quantity.toLocaleString(
                                                "sv-SE",
                                                {
                                                    maximumFractionDigits: 4
                                                }
                                            )}{" "}
                                            st
                                        </span>

                                        <div className="position-actions">
                                            {position.platform !== "Lysa" && (
                                                <button
                                                    className="ghost-button danger-text small-button"
                                                    type="button"
                                                    onClick={() =>
                                                        deleteHolding(position.id)
                                                    }
                                                >
                                                    Ta bort
                                                </button>
                                            )}

                                            {position.platform === "Nordnet" &&
                                                (!position.isin ||
                                                    !position.ticker ||
                                                    !position.assetType) && (
                                                    <button
                                                        className="ghost-button small-button"
                                                        type="button"
                                                        onClick={async () => {
                                                            try {
                                                                await enrichHoldingSmart(
                                                                    position.id
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

                                        {enrichmentCandidates &&
                                            enrichmentCandidates.holdingId ===
                                                position.id && (
                                                <div className="enrichment-candidates">
                                                    <h4>
                                                        Välj rätt instrument för{" "}
                                                        {
                                                            enrichmentCandidates.holdingName
                                                        }
                                                    </h4>

                                                    {enrichmentCandidates.candidates.map(
                                                        (candidate) => (
                                                            <button
                                                                className="enrichment-candidate-button"
                                                                key={`${candidate.ticker}-${candidate.exchange}`}
                                                                type="button"
                                                                onClick={() =>
                                                                    selectEnrichmentCandidate(
                                                                        candidate
                                                                    )
                                                                }
                                                            >
                                                                {candidate.name} —{" "}
                                                                {candidate.ticker} —{" "}
                                                                {candidate.exchange} —{" "}
                                                                {candidate.currency}
                                                            </button>
                                                        )
                                                    )}

                                                    <div className="enrichment-manual-search">
                                                        <input
                                                            type="text"
                                                            value={manualSearch}
                                                            placeholder="Sök själv, t.ex. BRK-B"
                                                            onChange={(event) =>
                                                                setManualSearch(
                                                                    event.target.value
                                                                )
                                                            }
                                                        />

                                                        <button
                                                            className="primary-button small-button"
                                                            type="button"
                                                            onClick={() =>
                                                                searchEnrichmentCandidates(
                                                                    manualSearch
                                                                )
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
                        </article>
                    );
                })}
            </div>
        </main>
    );
}

export default Holdings;
