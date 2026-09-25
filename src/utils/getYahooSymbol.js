const getYahooSymbol = (holding) => {
    if (!holding || !holding.ticker) {
        return null;
    }

    if (holding.assetType === "FUND") {
        return null;
    }

    if (
        holding.market === "ST" ||
        holding.market === "XSTO" ||
        holding.market === "XSAT"
    ) {
        const ticker = holding.ticker.replaceAll(" ", "-");

        return `${ticker}.ST`;
    }

    if (holding.market === "LSE") {
        return `${holding.ticker}.L`;
    }

    return holding.ticker;
};

export default getYahooSymbol;