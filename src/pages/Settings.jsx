import {getPortfolioSnapshots} from "../utils/portfolioSnapshots.js";
import {useState} from "react";
import { createAccount } from "../services/database";
import { createHolding } from "../services/database";

function Settings({
                      resetPortfolio,
                      setResolvedMatches,
                      enrichMissingAveragePrices,
                      updateAllHoldingPrices,
                      handleRestoreSnapshot,

                  }) {
    const resetWithWarning = () => {
        if (confirm("Återställ portfölj?")) {
            resetPortfolio();
        }
    };

    const snapshots = getPortfolioSnapshots();
    const [showSnapshots, setShowSnapshots] = useState(false);

    // TESTFUNKTION






    async function handleCreateTestHolding() {
        const { data, error } = await createHolding({
            account_id: "72616e61-5ab4-48dd-9d1a-a18757d531be",
            name: "Investor B",
            ticker: "INVE-B",
            quantity: 10,
            average_price: 250,
            average_price_sek: 250,
            current_price: 300,
            currency: "SEK",
            platform: "Avanza",
            asset_type: "STOCK",
        });

        if (error) {
            console.error("Create holding error:", error);
            return;
        }

        console.log("Holding created:", data);
    }

    return (
        <main className="page settings-page">
            <div className="page-heading">
                <span className="eyebrow">Verktyg</span>
                <h1>Inställningar</h1>
                <p>
                    Underhåll portföljdata och kör manuella uppdateringar.
                </p>
            </div>

            <div className="settings-grid">
                <section className="card settings-card">
                    <div>
                        <h2>Kurser</h2>
                        <p>
                            Hämta aktuella priser för alla innehav direkt.
                        </p>
                    </div>

                    <button
                        className="primary-button"
                        type="button"
                        onClick={() =>
                            updateAllHoldingPrices(
                                true,
                                Date.now()
                            )
                        }
                    >
                        Uppdatera portföljvärden
                    </button>
                </section>

                <section className="card settings-card">
                    <div>
                        <h2>GAV</h2>
                        <p>
                            Berika innehav som saknar GAV i SEK.
                        </p>
                    </div>

                    <button
                        className="ghost-button"
                        type="button"
                        onClick={enrichMissingAveragePrices}
                    >
                        Berika saknade GAV
                    </button>
                </section>

                <section className="card settings-card">
                    <div>
                        <h2>Matchningar</h2>
                        <p>
                            Glöm tidigare beslut om möjliga dubbletter.
                        </p>
                    </div>

                    <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                            if (
                                confirm(
                                    "Återställ matchade holdings?"
                                )
                            ) {
                                setResolvedMatches([]);
                            }
                        }}
                    >
                        Återställ matchningar
                    </button>
                </section>

                <section className="card settings-card danger-zone">
                    <div>
                        <h2>Återställ portfölj</h2>
                        <p>
                            Tar bort lokalt sparade innehav, Lysa-data och manuella tillgångar.
                        </p>
                    </div>

                    <button
                        className="danger-button"
                        type="button"
                        onClick={resetWithWarning}
                    >
                        Återställ allt
                    </button>
                </section>
                <section className="card settings-card danger-zone">
                    <h2>Återställningspunkter</h2>
                    <p>
                        Återställ portföljen till en tidigare sparad version.
                    </p>
                    <button type="button"
                            className="ghost-button"
                            onClick={() => {
                                setShowSnapshots((current) => !current);

                            }}
                    >{showSnapshots
                        ? "Dölj återställningspunkterna"
                        : "Visa återställningspunkterna"}
                    </button>
                    {showSnapshots && (
                        <div className="snapshot-list">
                            {snapshots.length === 0 ? (
                                <p>Inga återställningspunkter finns ännu.</p>
                            ) : (
                                snapshots.map((snapshot) => (
                                    <div
                                        className="snapshot-row"
                                        key={snapshot.id}
                                    >
                                        <span>
                                            {new Date(
                                                snapshot.createdAt
                                            ).toLocaleString("sv-SE")}
                                        </span>

                                        <button
                                            type="button"
                                            className="ghost-button small-button"
                                            onClick={() => {
                                                const confirmed = confirm(
                                                    "Vill du återställa portföljen till den här återställningspunkten?"
                                                );

                                                if (!confirmed) {
                                                    return;
                                                }

                                                handleRestoreSnapshot(snapshot);
                                            }}
                                        >
                                            Återställ
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </section>
                <button
                    className="primary-button"
                    onClick={handleCreateTestHolding}
                >
                    Skapa holding
                </button>
            </div>
        </main>
    );
}

export default Settings;
