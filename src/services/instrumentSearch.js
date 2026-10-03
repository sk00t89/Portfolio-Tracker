import { apiFetch } from "./apiClient.js";

export const searchNordnetInstruments = async (query) => {
    const response = await apiFetch(`/api/nordnet-search-query/${encodeURIComponent(query)}`);

    if (!response.ok) {
        throw new Error("Nordnet-sökningen misslyckades");
    }

    const data = await response.json();

    console.log("Sökresultat från Nordnet:", data);

    return data;
};


export const searchAvanzaInstruments = async (query) => {
    const response = await apiFetch(`/api/avanza-search-query/${encodeURIComponent(query)}`);

    if (!response.ok) {
        throw new Error("Avanza-sökningen misslyckades");
    }

    const data = await response.json();

    console.log("Sökresultat från Avanza:", data);

    return data;
};