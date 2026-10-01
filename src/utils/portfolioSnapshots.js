export const createPortfolioSnapshot = ({
                                            holdings,
                                            assets,
                                            transactions,
                                            lysaTransactions,
                                            lysaPerformance,
                                            resolvedMatches,
                                        }) => {
    const createdAt = new Date().toISOString();

    return {
        id: createdAt,
        createdAt,

        holdings,
        assets,
        transactions,
        lysaTransactions,
        lysaPerformance,
        resolvedMatches,
    };
};

const SNAPSHOT_STORAGE_KEY = "portfolioSnapshots";
const MAX_SNAPSHOTS = 7;

export const savePortfolioSnapshot = (snapshot) => {
    const savedSnapshots =
        JSON.parse(
            localStorage.getItem(SNAPSHOT_STORAGE_KEY)
        ) ?? [];

    const updatedSnapshots = [
        snapshot,
        ...savedSnapshots,
    ].slice(0, MAX_SNAPSHOTS);

    localStorage.setItem(
        SNAPSHOT_STORAGE_KEY,
        JSON.stringify(updatedSnapshots)
    );

    return updatedSnapshots;
};

export const getPortfolioSnapshots = () => {
    return (
        JSON.parse(
            localStorage.getItem(SNAPSHOT_STORAGE_KEY)
        ) ?? []
    );
};

export const restorePortfolioSnapshot = (snapshot) => {
    return {
        holdings: snapshot.holdings ?? [],
        assets: snapshot.assets ?? [],
        transactions: snapshot.transactions ?? [],
        lysaTransactions: snapshot.lysaTransactions ?? [],
        lysaPerformance: snapshot.lysaPerformance ?? [],
        resolvedMatches: snapshot.resolvedMatches ?? [],
    };
};