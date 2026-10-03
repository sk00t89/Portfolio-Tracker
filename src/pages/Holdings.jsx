import {useState} from "react";
import {
    formatSek,
    formatCurrency,
} from "../utils/formatting.js";
import {
    createTransaction,
    applyTransactionToHolding
} from "../utils/transactions.js";
import {getExchangeRate} from "../services/currencyData.js";


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
                      deleteHolding,
                      handleTransaction
                  }) {
    const [manualSearch, setManualSearch] = useState("");
    const [sortBy, setSortBy] = useState("largest");
    const [selectedPosition, setSelectedPosition] = useState(null);

    const [transactionType, setTransactionType] = useState("BUY");
    const [transactionQuantity, setTransactionQuantity] = useState("");
    const [transactionPrice, setTransactionPrice] = useState("");
    const [transactionCurrency, setTransactionCurrency] = useState("SEK");
    const [transactionFee, setTransactionFee] = useState("");
    const [pendingTransaction, setPendingTransaction] = useState(null);
    const [transactionError, setTransactionError] = useState("");

    const [searchTerm, setSearchTerm] = useState("");

    const prepareTransactionPreview = async (position) => {
        setTransactionError("");

        try {
            let fxRateToSek = 1;

            if (
                transactionCurrency &&
                transactionCurrency !== "SEK"
            ) {
                fxRateToSek = await getExchangeRate(
                    transactionCurrency,
                    "SEK"
                );
            }

            const previewTransaction = createTransaction({
                holdingId: position.id,
                type: transactionType,
                quantity: transactionQuantity,
                price: transactionPrice,
                currency: transactionCurrency,
                feeSek: transactionFee || 0,
                fxRateToSek,
            });

            const previewHolding = applyTransactionToHolding(
                position,
                previewTransaction
            );

            setPendingTransaction({
                transaction: previewTransaction,

                before: {
                    quantity: position.quantity,
                    averagePrice: position.averagePrice,
                    averagePriceSek: position.averagePriceSek,
                    valueSek: position.currentValueSek,
                },

                after: {
                    quantity: previewHolding.quantity,
                    averagePrice: previewHolding.averagePrice,
                    averagePriceSek: previewHolding.averagePriceSek,
                    valueSek: previewHolding.currentValueSek,
                },
            });
        } catch (error) {
            setTransactionError(error.message);
        }
    };

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

    const searchQuery = (holdings, searchString) => {
        const searchStringClean =
            searchString.toLowerCase().trim();

        if (!searchStringClean) {
            return holdings;
        }

        return holdings.filter((group) => {
            const nameMatches =
                group.name
                    .toLowerCase()
                    .includes(searchStringClean);

            const platformMatches =
                group.positions.some((position) =>
                    position.platform
                        ?.toLowerCase()
                        .includes(searchStringClean)
                );

            return nameMatches || platformMatches;
        });
    };

    const filteredHoldings =
        searchQuery(sortedHoldings, searchTerm)


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
                <div className="instrument-search">
                    <input
                        type="text"
                        value={searchTerm}
                        placeholder="Sök innehav eller plattform"
                        onChange={(event) =>
                            setSearchTerm(event.target.value)
                        }
                    />
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
                {filteredHoldings.map((group) => {
                    const isLysaOnly =
                        group.positions.every(
                            (position) =>
                                position.platform === "Lysa"
                        );

                    const percentage =
                        portfolioValue > 0
                            ? (group.totalValue / portfolioValue) * 100
                            : 0;

                    const totalQuantity =
                        group.positions.reduce(
                            (total, position) =>
                                total + Number(position.quantity ?? 0),
                            0
                        );

                    const latestPrice =
                        group.positions.find(
                            (position) =>
                                Number.isFinite(Number(position.currentPrice))
                        )?.currentPrice ?? null;

                    const priceCurrency =
                        group.positions.find(
                            (position) =>
                                position.currentPrice != null
                        )?.currency ?? "";

                    const investedCapital =
                        group.positions.reduce(
                            (total, position) => {
                                const averagePriceSek =
                                    Number(position.averagePriceSek);
                                const quantity =
                                    Number(position.quantity);

                                if (
                                    !Number.isFinite(averagePriceSek) ||
                                    !Number.isFinite(quantity) ||
                                    averagePriceSek <= 0 ||
                                    quantity <= 0
                                ) {
                                    return total;
                                }

                                return total +
                                    averagePriceSek * quantity;
                            },
                            0
                        );

                    const changePercent =
                        investedCapital > 0
                            ? (
                                (
                                    group.totalValue -
                                    investedCapital
                                ) /
                                investedCapital
                            ) * 100
                            : null;

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

                                    {!isLysaOnly && (
                                        <span className="holding-meta">
                                            GAV {investedCapital > 0
                                                ? formatSek(investedCapital)
                                                : "–"}
                                            {" · "}
                                            Antal {totalQuantity.toLocaleString(
                                                "sv-SE",
                                                {
                                                    maximumFractionDigits: 4,
                                                }
                                            )}
                                            {" · "}
                                            Kurs{" "}
                                            {latestPrice !== null
                                                ? `${Number(latestPrice).toLocaleString(
                                                    "sv-SE",
                                                    {
                                                        maximumFractionDigits: 2,
                                                    }
                                                )} ${priceCurrency}`
                                                : "–"}
                                            {changePercent !== null && (
                                                <>
                                                    {" · "}
                                                    <span
                                                        className={
                                                            changePercent >= 0
                                                                ? "positive-text"
                                                                : "negative-text"
                                                        }
                                                    >
                                                        {changePercent >= 0 ? "+" : ""}
                                                        {changePercent.toFixed(1)}%
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                    )}
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
                                                    maximumFractionDigits: 4,
                                                }
                                            )}{" "}
                                            st
                                            </span>

                                        <div className="position-actions">
                                            {position.platform !== "Lysa" && (
                                                <button
                                                    className="ghost-button danger-text small-button"
                                                    type="button"
                                                    onClick={() => {
                                                        const confirmed = window.confirm(
                                                            `Vill du verkligen ta bort ${position.name ?? group.name}?`
                                                        );

                                                        if (!confirmed) {
                                                            return;
                                                        }
                                                        deleteHolding(position.id);
                                                        setTransactionError("");
                                                    }}
                                                >
                                                    Ta bort
                                                </button>
                                            )}

                                            {position.platform !== "Lysa" && (
                                                <button
                                                    className="ghost-button small-button"
                                                    type="button"
                                                    onClick={() => {
                                                        const isSamePosition =
                                                            selectedPosition?.id === position.id;

                                                        setSelectedPosition(
                                                            isSamePosition ? null : position
                                                        );

                                                        setPendingTransaction(null);
                                                        setTransactionType("BUY");
                                                        setTransactionQuantity("");
                                                        setTransactionPrice("");
                                                        setTransactionFee("");
                                                        setTransactionError("");

                                                        setTransactionCurrency(
                                                            position.currency ?? "SEK"
                                                        );
                                                    }}
                                                >
                                                    Köp / Sälj
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

                                        {selectedPosition?.id === position.id && (
                                            <div className="transaction-form">
                                                <div className="transaction-position-summary">
                                                    <span>
                                                        Värde:
                                                        <strong>
                                                            {formatSek(position.currentValueSek ?? 0)}
                                                        </strong>
                                                    </span>

                                                    <span>
                                                        GAV:
                                                        <strong>
                                                           {formatCurrency(
                                                               position.averagePriceSek ?? 0,
                                                               "SEK"
                                                           )}
                                                        </strong>
                                                    </span>

                                                    <span>
                                                        Antal:
                                                        <strong>
                                                            {position.quantity.toLocaleString("sv-SE", {
                                                                maximumFractionDigits: 4,
                                                            })}
                                                        </strong>
                                                    </span>
                                                    <span>
                                                        Senast:
                                                        <strong>
                                                            {position.currentPrice != null
                                                                ? formatCurrency(
                                                                    position.currentPrice,
                                                                    position.currency ?? "SEK"
                                                                )
                                                                : "Saknas"}
                                                        </strong>
                                                    </span>
                                                </div>
                                                <select
                                                    value={transactionType}
                                                    onChange={(event) => {
                                                        setTransactionType(event.target.value)
                                                        setPendingTransaction(null);
                                                        setTransactionError("");
                                                    }}
                                                >
                                                    <option value="BUY">
                                                        Köp
                                                    </option>

                                                    <option value="SELL">
                                                        Sälj
                                                    </option>
                                                </select>

                                                <input
                                                    type="number"
                                                    placeholder="Antal"
                                                    value={transactionQuantity}
                                                    onChange={(event) => {
                                                        setTransactionQuantity(event.target.value)
                                                        setPendingTransaction(null);
                                                        setTransactionError("");
                                                    }}
                                                />

                                                <input
                                                    type="number"
                                                    placeholder="Pris"
                                                    value={transactionPrice}
                                                    onChange={(event) => {
                                                        setTransactionPrice(event.target.value)
                                                        setPendingTransaction(null);
                                                        setTransactionError("");
                                                    }}
                                                />

                                                <input
                                                    type="text"
                                                    placeholder="Valuta, t.ex. SEK"
                                                    value={transactionCurrency}
                                                    onChange={(event) => {
                                                        setTransactionCurrency(event.target.value)
                                                        setPendingTransaction(null);
                                                        setTransactionError("");
                                                    }}

                                                />

                                                <input
                                                    type="number"
                                                    placeholder="Avgift/courtage (valfritt)"
                                                    value={transactionFee}
                                                    onChange={(event) => {
                                                        setTransactionFee(event.target.value)
                                                        setPendingTransaction(null);
                                                        setTransactionError("");
                                                    }}
                                                />

                                                {transactionError && (
                                                    <div className="transaction-error">
                                                        {transactionError}
                                                    </div>
                                                )}

                                                <button
                                                    className="primary-button small-button"
                                                    disabled={
                                                        Boolean(transactionError) ||
                                                        Boolean(pendingTransaction) ||
                                                        Number(transactionQuantity) <= 0 ||
                                                        Number(transactionPrice) <= 0
                                                    }
                                                    type="button"
                                                    onClick={async () => {
                                                        await prepareTransactionPreview(position);
                                                    }}
                                                >
                                                    Spara transaktion
                                                </button>
                                            </div>
                                        )}
                                        {pendingTransaction?.transaction.holdingId === position.id && (
                                            <div className="transaction-preview">
                                                <h4>Bekräfta transaktion</h4>

                                                <div className="transaction-preview-row">
                                                    <span>Antal</span>

                                                    <div className="transaction-preview-values">
                                                        <strong>
                                                            {pendingTransaction.before.quantity.toLocaleString("sv-SE", {
                                                                maximumFractionDigits: 4,
                                                            })}
                                                        </strong>

                                                        <span className="transaction-arrow">→</span>

                                                        <strong>
                                                            {pendingTransaction.after.quantity.toLocaleString("sv-SE", {
                                                                maximumFractionDigits: 4,
                                                            })}
                                                        </strong>
                                                    </div>
                                                </div>

                                                <div className="transaction-preview-row">
                                                    <span>GAV</span>

                                                    <div className="transaction-preview-values">
                                                        <strong>
                                                            {formatCurrency(
                                                                pendingTransaction.before.averagePrice ?? 0,
                                                                pendingTransaction.transaction.currency
                                                            )}
                                                        </strong>

                                                        <span className="transaction-arrow">→</span>

                                                        <strong>
                                                            {formatCurrency(
                                                                pendingTransaction.after.averagePrice ?? 0,
                                                                pendingTransaction.transaction.currency
                                                            )}
                                                        </strong>
                                                    </div>
                                                </div>

                                                <div className="transaction-preview-row">
                                                    <span>Värde</span>

                                                    <div className="transaction-preview-values">
                                                        <strong>
                                                            {formatSek(
                                                                pendingTransaction.before.valueSek ?? 0
                                                            )}
                                                        </strong>

                                                        <span className="transaction-arrow">→</span>

                                                        <strong>
                                                            {formatSek(
                                                                pendingTransaction.after.valueSek ?? 0
                                                            )}
                                                        </strong>
                                                    </div>
                                                </div>

                                                <div className="button-row">
                                                    <button
                                                        className="ghost-button small-button"
                                                        type="button"
                                                        onClick={() => {
                                                            setPendingTransaction(null);
                                                            setSelectedPosition(null);
                                                            setTransactionType("BUY");
                                                            setTransactionQuantity("");
                                                            setTransactionPrice("");
                                                            setTransactionCurrency("SEK");
                                                            setTransactionFee("");
                                                            setTransactionError("");
                                                        }}
                                                    >
                                                        Avbryt
                                                    </button>

                                                    <button
                                                        className="primary-button small-button"
                                                        type="button"
                                                        onClick={async () => {
                                                            const {
                                                                holdingId,
                                                                ...transactionData
                                                            } = pendingTransaction.transaction;

                                                            await handleTransaction(
                                                                holdingId,
                                                                transactionData
                                                            );

                                                            setPendingTransaction(null);
                                                            setSelectedPosition(null);
                                                            setTransactionType("BUY");
                                                            setTransactionQuantity("");
                                                            setTransactionPrice("");
                                                            setTransactionCurrency("SEK");
                                                            setTransactionFee("");
                                                            setTransactionError("");
                                                        }}
                                                    >
                                                        Bekräfta
                                                    </button>
                                                </div>
                                            </div>
                                        )}

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
                                                                key={`${candidate.provider ?? "unknown"}-${candidate.instrumentId ?? candidate.isin ?? candidate.ticker ?? candidate.name}`}
                                                                type="button"
                                                                onClick={() =>
                                                                    selectEnrichmentCandidate(
                                                                        candidate
                                                                    )
                                                                }
                                                            >
                                                                {candidate.name} —{" "}
                                                                {candidate.ticker ?? "utan ticker"} —{" "}
                                                                {candidate.market ?? candidate.provider ?? "okänd marknad"} —{" "}
                                                                {candidate.currency ?? "okänd valuta"}
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
