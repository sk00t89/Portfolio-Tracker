export const searchInstrument = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/search/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
        throw new Error("Instrumentsökningen misslyckades");
    }

    return response.json();
};

export const getCurrentPrice = async (ticker, exchange) => {
    const response = await fetch(
        `http://localhost:3001/api/price/${encodeURIComponent(ticker)}/${encodeURIComponent(exchange)}`
    );

    if (!response.ok) {
        throw new Error("Kursförfrågan misslyckades");
    }

    return response.json();
};

export const getYahooPrice = async (symbol) => {
    const response = await fetch(
        `http://localhost:3001/api/yahoo-price/${encodeURIComponent(symbol)}`
    );

    if (!response.ok) {
        throw new Error("Yahoo-kursen kunde inte hämtas");
    }

    return response.json();
};

export const getNordnetPriceByIsin = async (isin) => {
    const response = await fetch(
        `http://localhost:3001/api/nordnet-search/${encodeURIComponent(isin)}`
    );

    if (!response.ok) {
        throw new Error("Nordnet-kursen kunde inte hämtas");
    }

    return response.json();
};

export const getAvanzaPriceByIsin = async (isin) => {
    const response = await fetch(
        `http://localhost:3001/api/avanza-search/${encodeURIComponent(isin)}`
    );

    if (!response.ok) {
        throw new Error("Avanza-kursen kunde inte hämtas");
    }

    return response.json();
};

export const getNordnetPriceByInstrumentId = async (instrumentId) => {
    const response = await fetch(
        `http://localhost:3001/api/nordnet-price/${encodeURIComponent(instrumentId)}`
    );

    if (!response.ok) {
        throw new Error("Nordnet-kursen kunde inte hämtas");
    }

    return response.json();
};

export const getAvanzaPriceByInstrumentId = async (instrumentId) => {
    const response = await fetch(
        `http://localhost:3001/api/avanza-price/${encodeURIComponent(instrumentId)}`
    );

    if (!response.ok) {
        throw new Error("Avanza-kursen kunde inte hämtas");
    }

    return response.json();
};

export const getNordnetInstrumentById = async (instrumentId) => {
    const response = await fetch(
        `http://localhost:3001/api/nordnet-instrument/${encodeURIComponent(instrumentId)}`
    );

    if (!response.ok) {
        throw new Error("Nordnet-instrumentet kunde inte hämtas");
    }

    return response.json();
};
