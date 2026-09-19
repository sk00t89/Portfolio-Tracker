export const findMatchingHolding = (holding, holdings) => {
    return holdings.find((candidate) => {
        if (candidate.id === holding.id) {
            return false;
        }

        const sameIsin =
            holding.isin &&
            candidate.isin &&
            holding.isin === candidate.isin;

        const sameTicker =
            holding.ticker &&
            candidate.ticker &&
            holding.ticker === candidate.ticker;

        const sameName =
            holding.name.toLowerCase().trim() ===
            candidate.name.toLowerCase().trim();

        return sameIsin || sameTicker || sameName;
    });
};