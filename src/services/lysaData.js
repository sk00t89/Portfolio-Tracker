import { apiFetch } from "./apiClient.js";

export const getLysaFundPrices = async () => {
    const response = await apiFetch("/api/lysa-fund-prices");

    if (!response.ok) {
        throw new Error(
            "Kunde inte hämta Lysa-fondkurser"
        );
    }

    return response.json();
};