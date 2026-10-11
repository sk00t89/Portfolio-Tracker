import {delimitedRows,csvNumber} from './delimitedCsv.js';
const parseAvanzaCsv = (string) => {

    const columns = delimitedRows(string,';');
    const header = columns[0];
    const extra = (row,name) => header.includes(name) ? row[header.indexOf(name)] || null : null;

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
            quantity: csvNumber(row[2]),
            valueSek: csvNumber(row[3]),
            averagePriceSek: csvNumber(row[4]),
            averagePrice: csvNumber(row[5]),
            currency: row[6],
            country: row[7],
            isin: row[8],
            market: row[9],
            assetType: row[10],
            platform: "Avanza",
            accountId: extra(row,'Konto'),
            importDate: extra(row,'Exportdatum'),
        };
    });
};

export default parseAvanzaCsv;
