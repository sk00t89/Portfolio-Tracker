import parseAvanzaCsv from './parseAvanzaCsv.js';
import parseNordnetCsv from "./parseNordnetCsv.js";
import parseLysaTransactionsCsv from "./parseLysaTransactionsCsv.js";
import parseLysaPerformanceCsv from "./parseLysaPerformanceCsv.js";

const parseCsv = (string) => {
    const cleanString =
        string.replace(/^\uFEFF/, "");

    if (cleanString === "") return {
        type: "ERROR",
        data: null,
    };

    if (cleanString.startsWith("Namn;Kortnamn;Volym;Marknadsvärde")) {
        console.log("Avanzas CSV")
        return {
            type: "HOLDINGS",
            data: parseAvanzaCsv(cleanString),
        }
    }

    if (cleanString.startsWith("Namn\tValuta\tAntal\tGAV\tIdag %")) {
        console.log("Nordnets CSV")
        return {
            type: "HOLDINGS",
            data: parseNordnetCsv(cleanString),
        }
    }

    if (
        cleanString.startsWith(
            "Amount,Counterpart/Fund,Date,Price,Type,Volume"
        )
    ) {
        console.log("Lysa Transactions CSV");
        return {
            type: "LYSA_TRANSACTIONS",
            data: parseLysaTransactionsCsv(cleanString),
        }
    }

    if (
        cleanString.startsWith(
            "\"Account worth\",\"Accumulated growth\",Date,\"Performance index\""
        )
    ) {
        console.log("Lysa Performance CSV");

        return {
            type: "LYSA_PERFORMANCE",
            data: parseLysaPerformanceCsv(cleanString),
        };
    }

    return {
        type: "UNKNOWN",
        data: null
    };
};

export default parseCsv;