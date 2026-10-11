import {delimitedRows,csvNumber} from './delimitedCsv.js';

export default function parseLysaTransactionsCsv(string) {
    return delimitedRows(string,',').slice(1).map(([amount,counterpart,date,price,type,volume])=>({
        amountSek:csvNumber(amount),fundName:counterpart||null,date:date||null,
        price:csvNumber(price),type:type||null,volume:csvNumber(volume),platform:'Lysa',
    }));
}
