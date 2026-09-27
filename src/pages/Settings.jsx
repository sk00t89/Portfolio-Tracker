function Settings({
    resetPortfolio,
    setResolvedMatches,
    enrichMissingAveragePrices,
    updateAllHoldingPrices
}) {
    const resetWithWarning = () => {
        if (confirm("Återställ portfölj?")) {
            resetPortfolio();
        }
    };

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
            </div>
        </main>
    );
}

export default Settings;
