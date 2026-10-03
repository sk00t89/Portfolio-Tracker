import {
    searchAvanzaInstruments,
    searchNordnetInstruments,
} from "./instrumentSearch.js";

const normalizeName = (value = "") =>
    value
        .toUpperCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^A-Z0-9ÅÄÖ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

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

export async function enrichImportedHolding(holding) {
    const alreadyIdentified =
        holding.instrumentId ||
        holding.isin ||
        holding.ticker;

    if (alreadyIdentified || !holding.name?.trim()) {
        return holding;
    }

    const query = holding.name.trim();

    const [nordnetResult, avanzaResult] =
        await Promise.allSettled([
            searchNordnetInstruments(query),
            searchAvanzaInstruments(query),
        ]);

    const candidates = [
        ...(nordnetResult.status === "fulfilled"
            ? nordnetResult.value
            : []),
        ...(avanzaResult.status === "fulfilled"
            ? avanzaResult.value
            : []),
    ];

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

    // Only enrich automatically when the match is strong enough.
    // Otherwise the existing manual enrichment flow can handle it.
    if (!bestMatch || bestMatch.score < 100) {
        return holding;
    }

    const candidate = bestMatch.candidate;

    return {
        ...holding,
        ticker: holding.ticker ?? candidate.ticker ?? null,
        isin: holding.isin ?? candidate.isin ?? null,
        assetType:
            holding.assetType ?? candidate.assetType ?? null,
        currency:
            holding.currency ?? candidate.currency ?? null,
        country:
            holding.country ?? candidate.country ?? null,
        market:
            holding.market ?? candidate.market ?? null,
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
}
