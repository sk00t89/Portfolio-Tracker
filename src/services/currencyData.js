import { apiFetch } from "./apiClient.js";
import { createReferenceFxClient } from "./referenceFxClient.js";

export const getReferenceExchangeRates = createReferenceFxClient({ request: apiFetch, storage: localStorage });

export const getExchangeRate = async (from, to) => {
    if (from === to) return 1;
    return (await getReferenceExchangeRates(from, to)).current.rate;
};

export const getAveragePriceSek = async (holding) => {
    if (holding.averagePriceSek) {
        return holding.averagePriceSek;
    }

    if (!holding.averagePrice || !holding.currency) {
        return null;
    }

    if (holding.currency === "SEK") {
        return holding.averagePrice;
    }

    const rate = await getExchangeRate(
        holding.currency,
        "SEK"
    );

    return holding.averagePrice * rate;
};
