// Read-only verification of a deployment's public HTML and JavaScript. Never print embedded API keys.
const url = process.argv[2];
if (!url || !url.startsWith("https://")) throw new Error("HTTPS_DEPLOYMENT_URL_REQUIRED");
const htmlResponse = await fetch(url, { signal: AbortSignal.timeout(15000) });
const html = await htmlResponse.text();
const asset = html.match(/<script[^>]+src="([^\"]*\/assets\/[^\"]+\.js)"/i)?.[1];
if (!htmlResponse.ok || !asset) {
    console.log(JSON.stringify({ url, status: htmlResponse.status, verified: false, reason: "PUBLIC_APP_HTML_UNAVAILABLE" }));
    process.exit(1);
}
const assetResponse = await fetch(new URL(asset, url), { signal: AbortSignal.timeout(15000) });
const code = await assetResponse.text();
const checks = { html: htmlResponse.ok, javascript: assetResponse.ok,
    quoteVersion: code.includes("market-quotes-v2"),
    atomicRefresh: code.includes("Uppdaterar kurser"),
    dailyCoverage: code.includes("kurstäckning"),
    datedReferences: code.includes("daily-reference-v1") && code.includes("Instrumentkurser") && code.includes("Dagsförändring i SEK")
        && code.includes("Underlag per innehav") && code.includes("Dagliga referensvalutakurser från Frankfurter"),
    integratedHistory: code.includes("Portföljöversikt med historik"),
    liveEndpoint: code.includes("Dagens slutpunkt är ett verifierat livevärde"),
    noArtificialIntraday: code.includes("Ingen intradagskurva ritas"),
    inactiveIndexes: code.includes("Ingen verifierad indexkälla är ansluten"),
    partialPeriodHistory: code.includes("Historik tillgänglig sedan") && code.includes("Periodens avkastning kan ännu inte beräknas"),
    verifiedReturnGuard: code.includes("Investeringsavkastning kräver verifierade kassaflöden"),
    edgeBackend: code.includes("https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api") };
console.log(JSON.stringify({ url, asset, checks, verified: Object.values(checks).every(Boolean) }));
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
