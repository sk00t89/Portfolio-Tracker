export const calculatePortfolioValue = (holdings, accounts) => {

    const holdingsValue = holdings.reduce((total, holding) => {
        return total + holding.valueSek;
    }, 0);

    const manualValue = accounts
        .filter((account) => account.type === "manual")
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