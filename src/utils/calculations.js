export const calculatePortfolioValue = (holdings, assets) => {

    const holdingsValue = holdings.reduce((total, holding) => {
        return total + holding.valueSek;
    }, 0);

    const manualValue = assets
        .filter((account) => account.source === "manual")
        .reduce((total, account) => {
            return total + account.value;
        }, 0);

    return holdingsValue + manualValue;
};

export const calculateTotalsByPlatform = (holdings) => {
    return holdings.reduce((total, holding) => {
        total[holding.platform] =
            (total[holding.platform] || 0) + holding.valueSek;

        return total;
    }, {});
};

export const calculateTotalsByCategory = (holdings, assets) => {
    const totals = {};

    assets.forEach((asset) => {
        totals[asset.category] =
            (totals[asset.category] || 0) + asset.value;
    });

    holdings.forEach((holding) => {
        const category = holding.assetType || "other";

        totals[category] =
            (totals[category] || 0) + holding.valueSek;
    });

    return totals;
};