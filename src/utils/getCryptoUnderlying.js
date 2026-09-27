export const getCryptoUnderlying = (holding) => {
    if (!holding) {
        return null;
    }

    const text = [
        holding.name,
        holding.ticker,
    ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

    // 1. Bäst fall:
    // "Valour Solana (SOL) SEK"
    const parenthesisMatch =
        text.match(/\(([A-Z0-9]+)\)/);

    if (parenthesisMatch) {
        return parenthesisMatch[1];
    }

    const cryptoAliases = {
        BITCOIN: "BTC",
        ETHEREUM: "ETH",
        RIPPLE: "XRP",
        AVALANCHE: "AVAX",
        SOLANA: "SOL",
        CARDANO: "ADA",
        POLKADOT: "DOT",
        CHAINLINK: "LINK",
    };

    for (const [cryptoName, symbol] of Object.entries(cryptoAliases)) {
        if (text.includes(cryptoName)) {
            return symbol;
        }
    }

    // 2. Fallback för t.ex:
    // "Virtune XRP ETP"
    const ignoredWords = new Set([
        "VIRTUNE",
        "VALOUR",
        "ETP",
        "ETN",
        "ETF",
        "CERTIFICATE",
        "CERTIFIKAT",
        "TRACKER",
        "SEK",
        "EUR",
        "USD",
        "STAKED",
        "ZERO",
    ]);

    const words = text
        .replace(/[^A-Z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    const candidates = words.filter(
        (word) =>
            !ignoredWords.has(word) &&
            word.length <= 6
    );

    return candidates[0] ?? null;
};