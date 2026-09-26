export const searchNordnetInstruments = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/nordnet-search-query/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
        throw new Error("Nordnet-sökningen misslyckades");
    }

    const data = await response.json();

    console.log("Sökresultat från Nordnet:", data);

    return data;
};


export const searchAvanzaInstruments = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/avanza-search-query/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
        throw new Error("Avanza-sökningen misslyckades");
    }

    const data = await response.json();

    console.log("Sökresultat från Avanza:", data);

    return data;
};