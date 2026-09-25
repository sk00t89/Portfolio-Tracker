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
        const text = await file.text();

        const result = parseCsv(text);

        console.log(result);

        if (result.type === "HOLDINGS") {
            importHoldings(result.data);
        }

        if (result.type === "LYSA_TRANSACTIONS") {
            importLysaTransactions(result.data);
            console.log(
                "Lysa transactions:",
                result.data
            );
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
        <div>
            <h1>Import</h1>

            <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFile}
            />

            {inputFile.map((item) => (
                <p key={item}>
                    Du har laddat upp {item}
                </p>
            ))}
        </div>
    );
}

export default ImportPage;