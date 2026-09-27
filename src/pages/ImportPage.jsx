import parseCsv from "../parsers/parseCsv.js";
import {useState} from "react";


function ImportPage({
                        importHoldings,
                        importLysaTransactions,
                        importLysaPerformance
                    }) {

    const [inputFile, setInputFile] = useState([]);

    const handleFile = async (event) => {
        const file = event.target.files[0];

        if (!file) {
            return;
        }

        const text = await file.text();
        const result = parseCsv(text);

        if (result.type === "HOLDINGS") {
            importHoldings(result.data);
        }

        if (result.type === "LYSA_TRANSACTIONS") {
            importLysaTransactions(result.data);
        }

        if (result.type === "LYSA_PERFORMANCE") {
            importLysaPerformance(result.data);
        }

        setInputFile((previous) => [
            ...previous,
            file.name
        ]);
    };


    return (
        <main className="page import-page">
            <div className="page-heading">
                <span className="eyebrow">CSV-import</span>
                <h1>Importera portfölj</h1>
                <p>Ladda upp exportfiler från Avanza, Nordnet eller Lysa.</p>
            </div>

            <section className="card import-card">

            <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFile}
            />

                <div className="import-history">
                    {inputFile.map((item) => (
                        <p key={item}>
                            ✓ {item}
                        </p>
                    ))}
                </div>
            </section>
        </main>
    );
}

export default ImportPage;