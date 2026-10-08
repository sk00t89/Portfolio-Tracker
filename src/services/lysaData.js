import { apiFetch } from "./apiClient.js";
import { REFERENCE_DATA_VERSION } from "../../supabase/functions/_shared/referenceData.js";

export const getLysaFundPrices = async () => {
    const response = await apiFetch("/api/lysa-fund-prices");

    if (!response.ok) {
        throw new Error(
            "Kunde inte hämta Lysa-fondkurser"
        );
    }

    const prices = await response.json();
    // Comparison outages do not replace or invalidate a verified latest NAV.
    try {
        const comparisons = await apiFetch("/api/lysa-nav-comparisons");
        const data = await comparisons.json();
        if (comparisons.ok && data.apiVersion === REFERENCE_DATA_VERSION) {
            for (const [isin, nav] of Object.entries(data.comparisons ?? {})) {
                if (prices[isin] && nav.current?.sourceDate === prices[isin].date && nav.current.price === prices[isin].price) prices[isin] = { ...prices[isin], navComparison: nav };
            }
        }
    } catch { /* Latest prices remain usable; the dashboard diagnoses missing comparison data. */ }
    return prices;
};
