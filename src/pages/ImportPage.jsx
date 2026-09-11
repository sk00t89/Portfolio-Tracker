import parseCsv from "../parsers/parseCsv.js";
import {useState} from "react";


function ImportPage({importHoldings}) {

    const [inputFile, setInputFile] = useState([]);

    const handleFile = async (event) => {
        const file = event.target.files[0];
        const text = await file.text();
        const holdings = parseCsv(text);

        setInputFile((previous) => [
            ...previous,
            file.name
        ]);

        console.log(holdings);

        importHoldings(holdings);
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
                <p key={item.id}>
                    Du har laddat upp {item}
                </p>


            ))}
        </div>
    );
}

export default ImportPage;