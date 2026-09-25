const getHoldingValue = (holding) => {
    return holding.currentValueSek ?? holding.valueSek;
};

export const calculatePortfolioValue = (holdings, assets) => {
    const holdingsValue = holdings.reduce((total, holding) => {
        return total + getHoldingValue(holding);
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
            (total[holding.platform] || 0) + getHoldingValue(holding);

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
        const category = holding.category || "OTHER";

        totals[category] =
            (totals[category] || 0) + getHoldingValue(holding);
    });

    return totals;
};

export const calculateInvestedCapital = (holdings) => {
    return holdings.reduce((total, holding) => {
        if (!holding.averagePriceSek || !holding.quantity) {
            return total;
        }

        return total + holding.averagePriceSek * holding.quantity;
    }, 0);
};

export const calculateCryptoExposure = (holdings) => {
    return holdings
        .filter((holding) => holding.category === "CRYPTO")
        .reduce((totals, holding) => {
            const key = holding.underlying ?? "INDEX";

            totals[key] =
                (totals[key] ?? 0) + getHoldingValue(holding);

            return totals;
        }, {});
};