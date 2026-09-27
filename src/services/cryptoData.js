export const searchCrypto = async (query) => {
    const response = await fetch(
        `http://localhost:3001/api/crypto-search/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
        throw new Error("Kryptosökningen misslyckades");
    }

    return response.json();
};

export const getCryptoPrice = async (coinId) => {
    const response = await fetch(
        `http://localhost:3001/api/crypto-price/${encodeURIComponent(coinId)}`
    );

    if (!response.ok) {
        throw new Error("Kryptokursen kunde inte hämtas");
    }

    return response.json();
};

export const getCryptoPrices = async (coinIds) => {
    const cleanIds = coinIds.join(",");

    const response = await fetch(
        `http://localhost:3001/api/crypto-prices?ids=${encodeURIComponent(cleanIds)}`
    );

    if (!response.ok) {
        throw new Error(
            "Kryptopriserna kunde inte hämtas"
        );
    }

    return response.json();
};