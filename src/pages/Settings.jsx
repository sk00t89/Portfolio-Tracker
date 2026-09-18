function Settings({resetPortfolio, setResolvedMatches, enrichMissingAveragePrices}) {

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
        </div>
    );
}

export default Settings;