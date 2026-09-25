function Settings({resetPortfolio, setResolvedMatches, enrichMissingAveragePrices, updateAllHoldingPrices}) {

    const warning = () => {
        if (confirm("Återställ portfölj?")) {
            resetPortfolio();
        }
    };
    return (
        <div>
            <div className="settings-btn-card">
                <h1>Settings</h1>

                <button onClick={warning} type="button"

                >
                    Återställ testdata
                </button>
            </div>
            <div className="settings-btn-card">
                <button
                    type="button"
                    onClick={() => {
                        if (confirm("Återställ matchade holdings?")) {

                            setResolvedMatches([]);
                        }
                    }}
                > Resetta matches
                </button>
            </div>
            <div className="settings-btn-card">
                <button onClick={enrichMissingAveragePrices}>
                    Berika saknade GAV
                </button>
            </div>

            <div className="settings-btn-card">
                <button
                    onClick={() =>
                        updateAllHoldingPrices(true, Date.now())
                    }
                >
                    Uppdatera portfölj till aktuellt värde
                </button>
            </div>
        </div>
    );
}

export default Settings;