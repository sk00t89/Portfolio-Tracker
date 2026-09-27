import {formatSek} from "../utils/formatting.js";

const categoryLabels = {
    STOCK: "Aktier",
    FUND: "Fonder",
    CRYPTO: "Krypto",
    OTHER: "Övrigt",
    cash: "Kontanter",
    crypto: "Krypto",
    other: "Övrigt",
};

function Allocation({portfolioValue, totalsByCategory}) {
    const rows = Object.entries(totalsByCategory)
        .sort(([, valueA], [, valueB]) => valueB - valueA);

    return (
        <section className="card">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Exponering</span>
                    <h2>Tillgångsslag</h2>
                </div>
            </div>

            <div className="data-list">
                {rows.map(([type, value]) => {
                    const percentage =
                        portfolioValue > 0
                            ? (value / portfolioValue) * 100
                            : 0;

                    return (
                        <div className="data-row" key={type}>
                            <span>{categoryLabels[type] ?? type}</span>
                            <strong>{formatSek(value)}</strong>
                            <span className="muted">
                                {percentage.toFixed(2)} %
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default Allocation;
