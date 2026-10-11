import {delimitedRows,csvNumber} from './delimitedCsv.js';
const parseNordnetCsv = (string) => {

    const columns = delimitedRows(string,'\t');
    const header=columns[0];
    const extra=(row,name)=>header.includes(name)?row[header.indexOf(name)]||null:null;

    const refinedRows = columns.filter((row) => {
        if (row.includes("Namn") || row[0] === "" ) {
            return false;
        }
        return true;
    });



    return refinedRows.map((row) => {
        return {
            name: row[0],
            ticker: null,
            quantity: csvNumber(row[2]),
            valueSek: csvNumber(row[8]),
            // Native SEK acquisition cost is already SEK; foreign GAV needs separate evidence.
            averagePriceSek: row[1] === 'SEK' ? csvNumber(row[3]) : null,
            averagePrice: csvNumber(row[3]),
            currency: row[1],
            country: null,
            isin: extra(row,'ISIN'),
            market: extra(row,'Marknad'),
            assetType: extra(row,'Typ'),
            platform: "Nordnet",
            accountId: extra(row,'Konto'),
            importDate: extra(row,'Exportdatum'),
        };
    });

};


export default parseNordnetCsv;
