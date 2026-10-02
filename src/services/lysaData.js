export const getLysaFundPrices = async () => {
    const response = await fetch(
        "http://localhost:3001/api/lysa-fund-prices"
    );

    if (!response.ok) {
        throw new Error(
            "Kunde inte hämta Lysa-fondkurser"
        );
    }

    return response.json();
};