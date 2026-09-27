import{getCryptoUnderlying} from "./getCryptoUnderlying.js";

const classifyHolding = (holding) => {
    const name = holding.name.toUpperCase();

    // Vanliga aktier
    if (holding.assetType === "STOCK") {
        return {
            ...holding,
            category: "STOCK",
            underlying: null,
            productType: "STOCK",
        };
    }

    // Fonder
    if (holding.assetType === "FUND") {
        return {
            ...holding,
            category: "FUND",
            underlying: null,
            productType: "FUND",
        };
    }

    // Teckningsoptioner
    if (holding.assetType === "SUBSCRIPTION_OPTION") {
        return {
            ...holding,
            category: "OTHER",
            underlying: null,
            productType: "SUBSCRIPTION_OPTION",
        };
    }

    // Crypto-certifikat / ETP
    if (
        name.includes("VALOUR") ||
        name.includes("VIRTUNE")
    ) {
        let productType = "SINGLE_ASSET";
        let underlying =
            getCryptoUnderlying(holding);

        // Indexprodukter
        if (
            name.includes("INDEX") ||
            name.includes("ALTCOIN")
        ) {
            productType = "INDEX";
            underlying = null;
        }

        // Stakingprodukter
        else if (name.includes("STAKED")) {
            productType = "STAKING";
        }

        return {
            ...holding,
            category: "CRYPTO",
            underlying,
            productType,
        };
    }

    // Övriga certifikat
    if (holding.assetType === "CERTIFICATE") {
        return {
            ...holding,
            category: "OTHER",
            underlying: null,
            productType: "CERTIFICATE",
        };
    }

    // Fallback
    return {
        ...holding,
        category: "OTHER",
        underlying: null,
        productType: holding.assetType ?? "UNKNOWN",
    };
};

export default classifyHolding;