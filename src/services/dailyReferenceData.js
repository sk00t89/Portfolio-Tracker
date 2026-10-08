import { apiFetch } from "./apiClient.js";
import { getReferenceExchangeRates } from "./currencyData.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { REFERENCE_DATA_VERSION } from "../../supabase/functions/_shared/referenceData.js";
export async function getHoldingDailyReference(holding) {
    const reference = {};
    await Promise.all([
        holding.currency && holding.currency !== "SEK" ? getReferenceExchangeRates(holding.currency, "SEK").then(
            fx => { reference.fx = fx; }, () => { reference.fxError = "Valutans referenskurser kunde inte hämtas"; }) : null,
        isMutualFund(holding) ? (async () => {
            try {
                const params = new URLSearchParams({ provider: holding.provider ?? "", instrumentId: holding.instrumentId ?? "", isin: holding.isin ?? "" });
                const response = await apiFetch(`/api/nav-comparison?${params}`);
                const data = await response.json();
                if (!response.ok || data.apiVersion !== REFERENCE_DATA_VERSION) throw new Error("NAV unavailable");
                reference.nav = data;
            } catch { reference.navError = "Verifierad NAV-jämförelse kunde inte hämtas"; }
        })() : null,
    ]);
    return reference;
}
