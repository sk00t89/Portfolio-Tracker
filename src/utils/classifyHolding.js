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
        let underlying = null;
        let productType = "SINGLE_ASSET";

        // Bitcoin
        if (
            name.includes("BITCOIN") ||
            name.includes("BTC")
        ) {
            underlying = "BTC";
        }

        // Ethereum
        else if (
            name.includes("ETHEREUM") ||
            name.includes("ETH")
        ) {
            underlying = "ETH";
        }

        // Avalanche
        else if (
            name.includes("AVALANCHE") ||
            name.includes("AVAX")
        ) {
            underlying = "AVAX";
        }

        // Solana
        else if (
            name.includes("SOLANA") ||
            name.includes("SOL")
        ) {
            underlying = "SOL";
        }

        // Polkadot
        else if (
            name.includes("POLKADOT") ||
            name.includes("DOT")
        ) {
            underlying = "DOT";
        }

        // Cardano
        else if (
            name.includes("CARDANO") ||
            name.includes("ADA")
        ) {
            underlying = "ADA";
        }

        // Chainlink
        else if (
            name.includes("CHAINLINK") ||
            name.includes("LINK")
        ) {
            underlying = "LINK";
        }

        // XRP
        else if (name.includes("XRP")) {
            underlying = "XRP";
        }

        // SUI
        else if (name.includes("SUI")) {
            underlying = "SUI";
        }

        // Sonic
        else if (
            name.includes("SONIC") ||
            name.includes("(S)")
        ) {
            underlying = "S";
        }

        // Arweave
        else if (
            name.includes("ARWEAVE") ||
            name.includes("(AR)")
        ) {
            underlying = "AR";
        }

        // Gram
        else if (
            name.includes("GRAM")
        ) {
            underlying = "GRAM";
        }

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