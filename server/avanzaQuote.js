import { createMarketQuoteRoutes } from "../supabase/functions/_shared/marketQuoteRoutes.js";

export async function fetchAvanzaQuote(instrumentId, expectedIsin = null, fetcher = fetch) {
    const result = await createMarketQuoteRoutes({ fetcher })(new URL(`http://localhost/api/avanza-price/${encodeURIComponent(instrumentId)}`));
    const quote = result.body;
    if (result.status !== 200 || (expectedIsin && String(quote.isin).toUpperCase() !== expectedIsin.toUpperCase())) {
        throw new Error("Avanza-instrumentets ISIN kunde inte verifieras");
    }
    return quote;
}
