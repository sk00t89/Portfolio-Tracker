const parseAvanzaCsv = (string) => {

    const rows = string
        .replaceAll(",", ".")
        .split("\n");

    const columns = rows.map((row) => {
        return row.split(";");
    });

    const refinedRows = columns.filter((row) => {
        if (row.includes("Namn") || row[0] === "" ) {
            return false;
        }


        return true;
    });

    return refinedRows.map((row) => {
        return {
            name: row[0],
            ticker: row[1],
            quantity: Number(row[2]),
            valueSek: Number(row[3]),
            averagePriceSek: Number(row[4]),
            averagePrice: Number(row[5]),
            currency: row[6],
            country: row[7],
            isin: row[8],
            market: row[9],
            assetType: row[10],
            platform: "Avanza",
        };
    });
};

export default parseAvanzaCsv;