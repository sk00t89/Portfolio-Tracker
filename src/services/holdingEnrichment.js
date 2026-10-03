import {
    searchAvanzaInstruments,
    searchNordnetInstruments,
} from "./instrumentSearch.js";
import {
    getAvanzaPriceByIsin,
    getNordnetInstrumentById,
} from "./marketData.js";

const normalizeName = (value = "") =>
    value
        .toUpperCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\bADR\b/g, " ")
        .replace(/\bADS\b/g, " ")
        .replace(/\bPLC\b/g, " ")
        .replace(/\bINC\b/g, " ")
        .replace(/\bLTD\b/g, " ")
        .replace(/[^A-Z0-9ÅÄÖ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const getNameTokens = (value = "") =>
    normalizeName(value)
        .split(" ")
        .filter((token) => token.length >= 2);

const scoreCandidate = (holding, candidate) => {
    const holdingName = normalizeName(holding.name);
    const candidateName = normalizeName(candidate.name);

    let score = 0;

    if (holdingName && candidateName === holdingName) {
        score += 100;
    } else if (
        holdingName &&
        candidateName &&
        (
            candidateName.includes(holdingName) ||
            holdingName.includes(candidateName)
        )
    ) {
        score += 45;
    }

    const holdingTokens = getNameTokens(holding.name);
    const candidateTokens = new Set(
        getNameTokens(candidate.name)
    );

    if (holdingTokens.length > 0) {
        const matchingTokens = holdingTokens.filter(
            (token) => candidateTokens.has(token)
        ).length;

        const tokenRatio =
            matchingTokens / holdingTokens.length;

        score += Math.round(tokenRatio * 60);
    }

    if (
        holding.ticker &&
        candidate.ticker &&
        holding.ticker.toUpperCase() ===
            candidate.ticker.toUpperCase()
    ) {
        score += 100;
    }

    if (
        holding.currency &&
        candidate.currency &&
        holding.currency.toUpperCase() ===
            candidate.currency.toUpperCase()
    ) {
        score += 20;
    }

    if (
        holding.platform &&
        candidate.provider &&
        holding.platform.toUpperCase() ===
            candidate.provider.toUpperCase()
    ) {
        score += 25;
    }

    return score;
};

const getSearchQueries = (query) => {
    const original = query.trim();

    const cleaned = original
        .replace(/\bADR\b/gi, " ")
        .replace(/\bADS\b/gi, " ")
        .replace(/\bPLC\b/gi, " ")
        .replace(/\bINC\.?\b/gi, " ")
        .replace(/\bLTD\.?\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    return [...new Set(
        [original, cleaned].filter(Boolean)
    )];
};

export async function searchHoldingCandidates(query) {
    const queries = getSearchQueries(query);
    const allCandidates = [];

    for (const searchQuery of queries) {
        const [nordnetResult, avanzaResult] =
            await Promise.allSettled([
                searchNordnetInstruments(searchQuery),
                searchAvanzaInstruments(searchQuery),
            ]);

        allCandidates.push(
            ...(nordnetResult.status === "fulfilled"
                ? nordnetResult.value
                : []),
            ...(avanzaResult.status === "fulfilled"
                ? avanzaResult.value
                : [])
        );
    }

    const seen = new Set();

    return allCandidates.filter((candidate) => {
        const key = [
            candidate.provider,
            candidate.instrumentId,
            candidate.isin,
            candidate.ticker,
            candidate.name,
        ].join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

export async function enrichImportedHolding(holding) {
    if (!holding.name?.trim()) {
        return holding;
    }

    const hasCompleteIdentity =
        holding.isin &&
        holding.instrumentId &&
        holding.assetType;

    if (hasCompleteIdentity) {
        return holding;
    }

    const candidates =
        await searchHoldingCandidates(
            holding.name.trim()
        );

    if (candidates.length === 0) {
        return holding;
    }

    const rankedCandidates = candidates
        .map((candidate) => ({
            candidate,
            score: scoreCandidate(holding, candidate),
        }))
        .sort((a, b) => b.score - a.score);

    const bestMatch = rankedCandidates[0];

    // Strong enough for automatic enrichment, otherwise leave it
    // for the manual candidate picker.
    if (!bestMatch || bestMatch.score < 85) {
        return holding;
    }

    let candidate = bestMatch.candidate;

    if (
        candidate.provider === "Nordnet" &&
        candidate.instrumentId &&
        !candidate.isin
    ) {
        try {
            const details =
                await getNordnetInstrumentById(
                    candidate.instrumentId
                );

            candidate = {
                ...candidate,
                ...details,
                ticker:
                    candidate.ticker ??
                    details.ticker ??
                    null,
                isin:
                    candidate.isin ??
                    details.isin ??
                    null,
                assetType:
                    candidate.assetType ??
                    details.assetType ??
                    null,
                currency:
                    candidate.currency ??
                    details.currency ??
                    null,
                market:
                    candidate.market ??
                    details.market ??
                    null,
                country:
                    candidate.country ??
                    details.country ??
                    null,
                provider: "Nordnet",
            };
        } catch {
            // Textsökningen kan fortfarande ge användbar metadata.
        }
    }

    let enriched = {
        ...holding,
        ticker:
            holding.ticker ??
            candidate.ticker ??
            null,
        isin:
            holding.isin ??
            candidate.isin ??
            null,
        assetType:
            holding.assetType ??
            candidate.assetType ??
            null,
        currency:
            holding.currency ??
            candidate.currency ??
            null,
        country:
            holding.country ??
            candidate.country ??
            null,
        market:
            holding.market ??
            candidate.market ??
            null,
        instrumentId:
            holding.instrumentId ??
            candidate.instrumentId ??
            null,
        provider:
            holding.provider ??
            candidate.provider ??
            null,
        currentPrice:
            holding.currentPrice ??
            candidate.price ??
            null,
        priceUpdatedAt:
            holding.priceUpdatedAt ??
            (candidate.price != null
                ? Date.now()
                : null),
    };

    // Nordnet search is often excellent for getting the ISIN.
    // Once we have the ISIN, prefer Avanza as the live price source
    // when the instrument also exists there.
    if (enriched.isin) {
        try {
            const avanzaData =
                await getAvanzaPriceByIsin(
                    enriched.isin
                );

            if (avanzaData) {
                enriched = {
                    ...enriched,
                    instrumentId:
                        avanzaData.orderBookId ??
                        enriched.instrumentId,
                    provider:
                        avanzaData.orderBookId
                            ? "Avanza"
                            : enriched.provider,
                    currentPrice:
                        avanzaData.price ??
                        enriched.currentPrice,
                    currency:
                        avanzaData.currency ??
                        enriched.currency,
                    priceUpdatedAt:
                        avanzaData.price != null
                            ? Date.now()
                            : enriched.priceUpdatedAt,
                };
            }
        } catch {
            // Nordnet-only instruments are expected to land here.
        }
    }

    return enriched;
}
