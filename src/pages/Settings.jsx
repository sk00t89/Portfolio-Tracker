import { Link } from "react-router-dom";
import useDisplayCurrency from "../hooks/useDisplayCurrency.js";
import {getPortfolioSnapshots} from "../utils/portfolioSnapshots.js";
import {useState} from "react";

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

    const { currency, setCurrency, rate, error } = useDisplayCurrency();
    const snapshots = getPortfolioSnapshots();
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [installMessage, setInstallMessage] = useState("");

    const isStandalone =
        window.matchMedia(
            "(display-mode: standalone)"
        ).matches ||
        window.navigator.standalone === true;

    const installApp = async () => {
        if (isStandalone) {
            setInstallMessage(
                "Appen är redan installerad på den här enheten."
            );
            return;
        }

        const installEvent =
            window.__portfolioInstallPrompt;

        if (installEvent) {
            await installEvent.prompt();
            const choice =
                await installEvent.userChoice;

            window.__portfolioInstallPrompt = null;

            setInstallMessage(
                choice.outcome === "accepted"
                    ? "Installationen startades."
                    : "Installationen avbröts."
            );
            return;
        }

        const isIos =
            /iphone|ipad|ipod/i.test(
                window.navigator.userAgent
            );

        if (isIos) {
            setInstallMessage(
                "På iPhone/iPad: öppna Dela-menyn i Safari och välj ”Lägg till på hemskärmen”."
            );
            return;
        }

        setInstallMessage(
            "Webbläsaren erbjuder ingen installationsdialog just nu. Prova webbläsarens meny och välj ”Installera app” eller ”Lägg till på hemskärmen”."
        );
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
                <section className="card settings-card"><div><h2>Visningsvaluta</h2><p>Portföljbelopp visas i vald valuta. IDAG visas alltid i SEK.</p></div>
                    <label htmlFor="settings-currency">Valuta</label><select id="settings-currency" value={currency} onChange={event => setCurrency(event.target.value)}>
                        <option value="SEK">SEK</option><option value="USD">USD</option><option value="EUR">EUR</option>
                    </select>{error ? <p role="alert">Valutakursen kunde inte hämtas. Välj SEK eller försök igen.</p> : rate == null && <p role="status">Hämtar valutakurs…</p>}
                </section>
                <section className="card settings-card"><div><h2>Hjälp</h2><p>Import, portföljdata och hur värdena visas.</p></div><Link className="ghost-button" to="/help">Öppna hjälp</Link></section>
                <section className="card settings-card">
                    <div>
                        <h2>Installera appen</h2>
                        <p>
                            Lägg Portfolio Tracker på hemskärmen och öppna den som en vanlig app.
                        </p>
                        {installMessage && (
                            <p className="settings-status-message">
                                {installMessage}
                            </p>
                        )}
                    </div>

                    <button
                        className="primary-button"
                        type="button"
                        onClick={installApp}
                    >
                        {isStandalone
                            ? "Appen är installerad"
                            : "Installera app"}
                    </button>
                </section>

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
            </div>
        </main>
    );
}

export default Settings;
