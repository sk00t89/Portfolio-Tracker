const CACHE_TIME = 24 * 60 * 60 * 1000;

export const getExchangeRate = async (from, to) => {
    const cacheKey = `exchangeRate_${from}_${to}`;
    const saved = localStorage.getItem(cacheKey);

    if (saved) {
        const parsed = JSON.parse(saved);

        const isFresh =
            Date.now() - parsed.fetchedAt < CACHE_TIME;

        if (isFresh) {
            return parsed.rate;
        }
    }

    const response = await fetch(
        `http://localhost:3001/api/currency/${from}/${to}`
    );

    const data = await response.json();

    localStorage.setItem(
        cacheKey,
        JSON.stringify({
            rate: data.rate,
            fetchedAt: Date.now(),
        })
    );

    return data.rate;
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