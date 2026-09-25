import parseAvanzaCsv from './parseAvanzaCsv.js';
import parseNordnetCsv from "./parseNordnetCsv.js";
import parseLysaTransactionsCsv from "./parseLysaTransactionsCsv.js";
import parseLysaPerformanceCsv from "./parseLysaPerformanceCsv.js";

const parseCsv = (string) => {
    if (string === "") return {
        type: "ERROR",
        data: null,
    };

    if (string.startsWith("Namn;Kortnamn;Volym;Marknadsvärde")) {
        console.log("Avanzas CSV")
        return {
            type: "HOLDINGS",
            data: parseAvanzaCsv(string),
        }
    }

    if (string.startsWith("Namn\tValuta\tAntal\tGAV\tIdag %")) {
        console.log("Nordnets CSV")
        return {
            type: "HOLDINGS",
            data: parseNordnetCsv(string),
        }
    }

    if (
        string.startsWith(
            "Amount,Counterpart/Fund,Date,Price,Type,Volume"
        )
    ) {
        console.log("Lysa Transactions CSV");
        return {
            type: "LYSA_TRANSACTIONS",
            data:parseLysaTransactionsCsv(string) ,
        }
    }

    if (
        string.startsWith(
            "\"Account worth\",\"Accumulated growth\",Date,\"Performance index\""
        )
    ) {
        console.log("Lysa Performance CSV");

        return {
            type: "LYSA_PERFORMANCE",
            data: parseLysaPerformanceCsv(string),
        };
    }

    return "Unknown CSV format";
};

export default parseCsv;