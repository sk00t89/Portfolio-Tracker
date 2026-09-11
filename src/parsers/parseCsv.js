import parseAvanzaCsv from './parseAvanzaCsv.js';
import parseNordnetCsv from "./parseNordnetCsv.js";


const parseCsv = (string) => {
    if (string === "") return "Error";

    if (string.startsWith("Namn;Kortnamn;Volym;Marknadsvärde")) {
        console.log("Avanzas CSV")
        return parseAvanzaCsv(string);
    }

    if (string.startsWith("Namn\tValuta\tAntal\tGAV\tIdag %")) {
        console.log("Nordnets CSV")
        return parseNordnetCsv(string);
    }

    return "Unknown CSV format";
};

export default parseCsv;