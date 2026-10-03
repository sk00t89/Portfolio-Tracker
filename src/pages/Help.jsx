const importGuides = [
    {
        id: "avanza",
        title: "Avanza",
        subtitle: "Exportera innehav från Min ekonomi → Analys.",
        path: ["Min ekonomi", "Analys", "Exportera data"],
        steps: [
            "Logga in på Avanza.",
            "Öppna Min ekonomi och välj Analys.",
            "Scrolla ner tills du kommer till Exportera data.",
            "Välj Mitt sammanställda innehav för en snabb import av hela portföljen.",
            "Vill du ha kontouppdelning kan du även hämta Mitt innehav fördelat per konto.",
        ],
        note: "Du kan också exportera kontouppgifter och historiska inköpskurser. Börja med innehavet – resten kan läggas till efter behov.",
    },
    {
        id: "nordnet",
        title: "Nordnet",
        subtitle: "Ladda ner CSV från varje konto du vill ta med.",
        path: ["Konto", "CSV-ikonen till höger", "Ladda ner"],
        steps: [
            "Logga in på Nordnet.",
            "Öppna det konto du vill importera.",
            "Till höger på kontosidan finns ikonen för att ladda ner/exportera.",
            "Ladda ner CSV-filen.",
            "Upprepa för varje Nordnet-konto du vill ha med i Portfolio Tracker.",
        ],
        note: "Har du till exempel ISK, KF och sparkonto behöver du normalt exportera varje konto separat.",
    },
    {
        id: "lysa",
        title: "Lysa",
        subtitle: "Hämta din data och packa upp exporten.",
        path: ["Kundinfo", "Din data", "Ladda ner"],
        steps: [
            "Logga in på Lysa.",
            "Gå till Kundinfo och öppna Din data.",
            "Ladda ner exporten.",
            "Om exporten laddas ner som ZIP: packa upp filen först.",
            "Importera Lysa-filerna i Portfolio Tracker. Transaktioner och historisk utveckling används för att bygga Lysa-vyn.",
        ],
        note: "Lysa-exporten kan innehålla flera filer. Det är normalt – importera de relevanta CSV-filerna en i taget.",
    },
];

function GuideCard({guide}) {
    return (
        <section
            className="card help-provider-card"
            id={guide.id}
        >
            <div className="help-provider-header">
                <div>
                    <span className="eyebrow">
                        Import
                    </span>
                    <h2>{guide.title}</h2>
                    <p>{guide.subtitle}</p>
                </div>

                <div
                    className="help-provider-mark"
                    aria-hidden="true"
                >
                    {guide.title.slice(0, 1)}
                </div>
            </div>

            <div className="help-path">
                {guide.path.map((item, index) => (
                    <span
                        className="help-path-part"
                        key={item}
                    >
                        <strong>{item}</strong>
                        {index < guide.path.length - 1 && (
                            <span aria-hidden="true">→</span>
                        )}
                    </span>
                ))}
            </div>

            <ol className="help-steps">
                {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                ))}
            </ol>

            <div className="help-note">
                <strong>Tips</strong>
                <span>{guide.note}</span>
            </div>
        </section>
    );
}

function Help() {
    return (
        <main className="page help-page">
            <div className="page-heading help-heading">
                <span className="eyebrow">
                    Hjälpcenter
                </span>
                <h1>Så hittar du rätt CSV-filer</h1>
                <p>
                    Exportera filerna från din bank eller spartjänst
                    och importera dem sedan under Import i Portfolio Tracker.
                </p>
            </div>

            <section className="card help-quick-card">
                <div>
                    <span className="eyebrow">
                        Snabbguide
                    </span>
                    <h2>Tre steg från konto till app</h2>
                </div>

                <div className="help-quick-steps">
                    <div>
                        <strong>1</strong>
                        <span>Exportera CSV från din plattform.</span>
                    </div>
                    <div>
                        <strong>2</strong>
                        <span>Öppna Import i Portfolio Tracker.</span>
                    </div>
                    <div>
                        <strong>3</strong>
                        <span>
                            Kontrollera Holdings och använd Berika om appen
                            behöver hjälp att identifiera ett instrument.
                        </span>
                    </div>
                </div>
            </section>

            <div className="help-provider-grid">
                {importGuides.map((guide) => (
                    <GuideCard
                        key={guide.id}
                        guide={guide}
                    />
                ))}
            </div>

            <section className="card help-troubleshooting">
                <div>
                    <span className="eyebrow">
                        Om något ser fel ut
                    </span>
                    <h2>Vanlig felsökning</h2>
                </div>

                <div className="help-troubleshooting-grid">
                    <div>
                        <strong>Innehav saknas</strong>
                        <p>
                            Kontrollera att alla konton har exporterats.
                            På Nordnet behöver flera konton normalt flera CSV-filer.
                        </p>
                    </div>
                    <div>
                        <strong>Fel eller saknad identifiering</strong>
                        <p>
                            Gå till Holdings. Kort som behöver hjälp markeras
                            och kan kompletteras med Berika.
                        </p>
                    </div>
                    <div>
                        <strong>Lysa syns inte</strong>
                        <p>
                            Kontrollera att exporten är uppackad och att både
                            transaktions- och utvecklingsfilen har importerats.
                        </p>
                    </div>
                    <div>
                        <strong>Importen känns gammal</strong>
                        <p>
                            Exportera en ny fil från plattformen och importera den igen.
                            Befintliga innehav uppdateras i stället för att dupliceras när de kan identifieras.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}

export default Help;
