const parseNordnetCsv = (string) => {

    const rows = string
        .replaceAll(",", ".")
        .split("\n");

    const columns = rows.map((row) => {
        return row.split("\t");
    });

    const refinedRows = columns.filter((row) => {
        if (row.includes("Namn") || row[0] === "" ) {
            return false;
        }
        return true;
    });



    return refinedRows.map((row) => {
        if (row[0] === "Evolution") {
            console.log("EVOLUTION RAW ROW:", row);
        }
        return {
            name: row[0],
            ticker: null,
            quantity: Number(row[2]),
            valueSek: Number(row[8]),
            averagePriceSek: null,
            averagePrice: Number(row[3]),
            currency: row[1],
            country: null,
            isin: null,
            market: null,
            assetType: null,
            platform: "Nordnet",
        };
    });

};


export default parseNordnetCsv;