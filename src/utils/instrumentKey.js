
const getInstrumentKey = (holding) => {
    if (holding.isin) {
        return holding.isin;
    }

    if (holding.ticker) {
        return holding.ticker.toLowerCase().trim();
    }

    return holding.name.toLowerCase().trim();
};

export default getInstrumentKey;