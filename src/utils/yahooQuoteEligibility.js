// Read-only probes on 2026-10-08: these exact ISIN/listing pairs returned Yahoo 404.
// No guessed alternative or underlying crypto price may substitute for the listed certificate.
// Re-enable only after a Yahoo listing with matching instrument identity has been verified.
const unverifiedListings = new Map([
    ["SE0022050092", "VIRAVAX.ST"], ["SE0021149259", "VIRLINK.ST"], ["SE0023260716", "VIRALT.ST"],
    ["SE0021630449", "VIRADA.ST"], ["SE0020541639", "VIRSETHS.ST"], ["SE0021148129", "VIRDOT.ST"],
    ["SE0021309754", "VIRSOL.ST"], ["SE0021486156", "VIRXRP.ST"],
]);
export function yahooListingUnverified(holding, symbol) {
    return ["CERTIFICATE", "ETP", "TRACKER"].includes(String(holding.assetType).toUpperCase())
        && unverifiedListings.get(String(holding.isin).toUpperCase()) === symbol;
}
