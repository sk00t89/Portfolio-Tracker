export const cryptoIndexDefinitions = {
    VIRTUNE_TOP_10: {
        name: "Virtune Crypto Top 10 Index",
        matchTerms: [
            "VIRTUNE CRYPTO TOP 10",
            "VIRTUNE TOP 10",
            "VIR10SEK",
        ],
        updatedAt: "2026-09-25",
        components: [
            {symbol: "BTC", coinId: "bitcoin", weight: 0.3884},
            {symbol: "ETH", coinId: "ethereum", weight: 0.3093},
            {symbol: "BNB", coinId: "binancecoin", weight: 0.0988},
            {symbol: "XRP", coinId: "ripple", weight: 0.0912},
            {symbol: "SOL", coinId: "solana", weight: 0.0602},
            {symbol: "HYPE", coinId: "hyperliquid", weight: 0.0187},
            {symbol: "LINK", coinId: "chainlink", weight: 0.0100},
            {symbol: "ADA", coinId: "cardano", weight: 0.0094},
            {symbol: "XLM", coinId: "stellar", weight: 0.0079},
            {symbol: "BCH", coinId: "bitcoin-cash", weight: 0.0061},
        ],
    },
    VIRTUNE_ALTCOIN: {
        name: "Virtune Crypto Altcoin Index",
        matchTerms: [
            "VIRTUNE CRYPTO ALTCOIN",
            "VIRTUNE ALTCOIN",
        ],
        updatedAt: "2026-09-10",
        components: [
            {symbol: "ADA", coinId: "cardano", weight: 0.1087},
            {symbol: "LINK", coinId: "chainlink", weight: 0.1044},
            {symbol: "BNB", coinId: "binancecoin", weight: 0.1041},
            {symbol: "XLM", coinId: "stellar", weight: 0.1022},
            {symbol: "GRAM", coinId: "the-open-network", weight: 0.1007},
            {symbol: "HYPE", coinId: "hyperliquid", weight: 0.1004},
            {symbol: "XRP", coinId: "ripple", weight: 0.1001},
            {symbol: "SOL", coinId: "solana", weight: 0.0978},
            {symbol: "BCH", coinId: "bitcoin-cash", weight: 0.0937},
            {symbol: "CC", coinId: "canton-network", weight: 0.0878},
        ],
    },
};