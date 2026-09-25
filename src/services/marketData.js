export const searchInstrument = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/search/${encodeURIComponent(query)}`
    );

    const data = await response.json();

    console.log("Market data:", data);

    return data;
};

export const getCurrentPrice = async (ticker, exchange) => {
    const response = await fetch(
        `http://localhost:3001/api/price/${encodeURIComponent(ticker)}/${encodeURIComponent(exchange)}`
    );

    const data = await response.json();

    return data;
};

export const getYahooPrice = async (symbol) => {
    const response = await fetch(
        `http://localhost:3001/api/yahoo-price/${encodeURIComponent(symbol)}`
    );

    const data = await response.json();

    return data;
};

export const getNordnetPriceByIsin = async (isin) => {
    const response = await fetch(
        `http://localhost:3001/api/nordnet-search/${encodeURIComponent(isin)}`
    );

    const data = await response.json();

    return data;
};

export const getAvanzaPriceByIsin = async (isin) => {
    const response = await fetch(
        `http://localhost:3001/api/avanza-search/${encodeURIComponent(isin)}`
    );

    const data = await response.json();

    return data;
};