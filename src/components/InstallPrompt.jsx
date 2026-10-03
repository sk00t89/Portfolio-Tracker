import {useEffect, useState} from "react";

function InstallPrompt() {
    const [installEvent, setInstallEvent] = useState(null);
    const [showIosHelp, setShowIosHelp] = useState(() => {
        const isStandalone =
            window.matchMedia(
                "(display-mode: standalone)"
            ).matches ||
            window.navigator.standalone === true;

        const isIos =
            /iphone|ipad|ipod/i.test(
                window.navigator.userAgent
            );

        return isIos && !isStandalone;
    });
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const isStandalone =
            window.matchMedia(
                "(display-mode: standalone)"
            ).matches ||
            window.navigator.standalone === true;

        if (isStandalone) {
            return;
        }

        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault();
            window.__portfolioInstallPrompt = event;
            setInstallEvent(event);
        };

        const handleInstalled = () => {
            window.__portfolioInstallPrompt = null;
            setInstallEvent(null);
            setShowIosHelp(false);
        };

        window.addEventListener(
            "beforeinstallprompt",
            handleBeforeInstallPrompt
        );

        window.addEventListener(
            "appinstalled",
            handleInstalled
        );

        return () => {
            window.removeEventListener(
                "beforeinstallprompt",
                handleBeforeInstallPrompt
            );

            window.removeEventListener(
                "appinstalled",
                handleInstalled
            );
        };
    }, []);

    if (
        dismissed ||
        (!installEvent && !showIosHelp)
    ) {
        return null;
    }

    const handleInstall = async () => {
        if (!installEvent) {
            return;
        }

        await installEvent.prompt();
        await installEvent.userChoice;
        window.__portfolioInstallPrompt = null;
        setInstallEvent(null);
    };

    return (
        <div className="install-prompt">
            <div>
                <strong>Installera Portfolio Tracker</strong>
                <span>
                    {installEvent
                        ? "Lägg appen på hemskärmen för snabb åtkomst."
                        : "På iPhone: tryck Dela och välj Lägg till på hemskärmen."}
                </span>
            </div>

            <div className="install-prompt-actions">
                {installEvent && (
                    <button
                        type="button"
                        className="primary-button small-button"
                        onClick={handleInstall}
                    >
                        Installera
                    </button>
                )}

                <button
                    type="button"
                    className="ghost-button small-button"
                    onClick={() => setDismissed(true)}
                >
                    Inte nu
                </button>
            </div>
        </div>
    );
}

export default InstallPrompt;
