import {cryptoIndexDefinitions} from "../data/cryptoIndexDefinitions.js";

export const getCryptoIndexDefinition = (holding) => {
    if (!holding?.name) {
        return null;
    }

    const name = holding.name.toUpperCase();

    return Object.values(cryptoIndexDefinitions).find((index) =>
        index.matchTerms.some((term) =>
            name.includes(term.toUpperCase())
        )
    ) ?? null;
};