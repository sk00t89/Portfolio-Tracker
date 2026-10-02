import { getCryptoIndexDefinition} from "./getCryptoIndexDefenitions.js";


const getHoldingValue = (holding) => {
    return (
        holding.currentValueSek ??
        holding.valueSek ??
        0

    );
};

export const calculatePortfolioValue = (
    holdings,
    assets,
    lysaValue = 0
) => {
    const holdingsValue = holdings.reduce((total, holding) => {
        return total + getHoldingValue(holding);
    }, 0);

    const manualValue = assets
        .filter((account) => account.source === "manual")
        .reduce((total, account) => {
            return total + account.value;
        }, 0);

    return holdingsValue + manualValue + lysaValue;
};

export const calculateTotalsByPlatform = (
    holdings,
    lysaValue = 0
) => {
    const totals = holdings.reduce((total, holding) => {
        total[holding.platform] =
            (total[holding.platform] || 0) +
            getHoldingValue(holding);

        return total;
    }, {});

    if (lysaValue > 0) {
        totals.Lysa = lysaValue;
    }

    return totals;
};

export const calculateTotalsByCategory = (holdings, assets, lysaValue) => {
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

    if (lysaValue > 0) {
        totals.FUND =
            (totals.FUND || 0) + lysaValue;
    }

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
    const summary = {};
    const details = {};

    holdings
        .filter((holding) => holding.category === "CRYPTO")
        .forEach((holding) => {
            const holdingValue = getHoldingValue(holding);

            const summaryKey =
                holding.productType === "INDEX"
                    ? "INDEX"
                    : holding.underlying ?? "INDEX";

            summary[summaryKey] =
                (summary[summaryKey] ?? 0) +
                holdingValue;

            if (holding.productType === "INDEX") {
                const indexDefinition =
                    getCryptoIndexDefinition(holding);

                if (indexDefinition) {
                    indexDefinition.components.forEach((component) => {
                        if (!details[component.symbol]) {
                            details[component.symbol] = {
                                total: 0,
                                direct: 0,
                                etp: 0,
                                index: 0,
                            };
                        }

                        const componentValue =
                            holdingValue * component.weight;

                        details[component.symbol].index +=
                            componentValue;

                        details[component.symbol].total +=
                            componentValue;
                    });
                }

                return;
            }

            const coin =
                holding.underlying ?? holding.ticker;

            if (!coin) {
                return;
            }

            if (!details[coin]) {
                details[coin] = {
                    total: 0,
                    direct: 0,
                    etp: 0,
                    index: 0,
                };
            }

            if (holding.productType === "DIRECT_CRYPTO") {
                details[coin].direct += holdingValue;
            } else {
                details[coin].etp += holdingValue;
            }

            details[coin].total += holdingValue;
        });

    return {
        summary,
        details,
    };
};


export const calculateLysaDeposits = (transactions) => {
    return transactions.reduce((total, transaction) => {
        const amount =
            Number(transaction.amountSek ?? 0);

        if (!Number.isFinite(amount)) {
            return total;
        }

        if (transaction.type === "Deposit") {
            return total + Math.abs(amount);
        }

        if (transaction.type === "Withdrawal") {
            return total - Math.abs(amount);
        }

        return total;
    }, 0);
};

export const calculateLysaFundVolumes = (transactions) => {
    const volumes = transactions.reduce((funds, transaction) => {
        const {
            fundName,
            type,
            volume
        } = transaction;

        if (!fundName || !volume) {
            return funds;
        }

        const isBuy =
            type === "Buy" ||
            type === "Switch buy";

        const isSell =
            type === "Sell" ||
            type === "Switch sell";

        if (!isBuy && !isSell) {
            return funds;
        }

        if (!funds[fundName]) {
            funds[fundName] = 0;
        }

        funds[fundName] +=
            isBuy
                ? volume
                : -volume;

        return funds;
    }, {});

    Object.keys(volumes).forEach((fundName) => {
        const roundedVolume =
            Math.round(volumes[fundName] * 10000) / 10000;

        volumes[fundName] =
            Math.abs(roundedVolume) < 0.0001
                ? 0
                : roundedVolume;
    });

    return volumes;
};

export const getLatestLysaPerformance = (performance) => {
    if (performance.length === 0) {
        return null;
    }

    return performance[performance.length - 1];
};