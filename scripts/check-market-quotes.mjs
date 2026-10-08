// Read-only provider check. Does not connect to the portfolio database or save quotes/history.
import { createMarketQuoteRoutes } from "../supabase/functions/_shared/marketQuoteRoutes.js";
import { getVerifiedHoldingQuote } from "../src/services/verifiedHoldingQuote.js";
import { createMarketApiFetch } from "../src/services/marketApiFetch.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const instruments = [
    { name: "AbCellera", ticker: "ABCL", isin: "CA00288U1066", instrumentId: "1166171", currency: "USD", market: "XNAS" },
    { name: "Avanza Zero", ticker: "Avanza Zero", isin: "SE0001718388", instrumentId: "41567", currency: "SEK", market: "FUND", assetType: "FUND" },
    { name: "Investor B", ticker: "INVE B", instrumentId: "5247", currency: "SEK", market: "Stockholmsbörsen" },
    { name: "Palantir", ticker: "PLTR", isin: "US69608A1088", instrumentId: "1138439", currency: "USD", market: "XNAS" },
    { name: "Alibaba", ticker: "BABA", isin: "US01609W1027", instrumentId: "506278", currency: "USD", market: "XNAS" },
    { name: "Berkshire Hathaway B", ticker: "BRK.B", isin: "US0846707026", instrumentId: "4109", currency: "USD", market: "XNAS" },
];
const route = createMarketQuoteRoutes({ logger: { warn() {} } });
const remote = process.argv.includes("--deployed");
let remoteFetch;
if (remote) {
    // Capture credentials in memory only; never print CLI output or use a service-role key.
    const output = execFileSync("powershell.exe", ["-NoProfile", "-Command",
        "npx --yes supabase projects api-keys --project-ref ertvxedbqcqydeypnorm --output json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const keys = JSON.parse(output);
    const anon = keys.find((key) => key.name === "anon")?.api_key;
    if (!anon?.startsWith("eyJ")) throw new Error("LEGACY_ANON_KEY_UNAVAILABLE");
    const configuredKey = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .match(/^VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (!configuredKey) throw new Error("FRONTEND_API_KEY_UNAVAILABLE");
    remoteFetch = createMarketApiFetch({
        baseUrl: "https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api",
        apiKey: configuredKey,
        getSession: async () => ({ data: { session: { access_token: anon, user: { id: "readonly-deployment-check" } } } }),
    });
}
if (process.argv.includes("--inspect-public-fields")) {
    for (const [provider, url] of [
        ["Avanza stock", "https://www.avanza.se/_api/market-guide/stock/1166171"],
        ["Avanza fund", "https://www.avanza.se/_api/market-guide/fund/41567"],
        ["Avanza fund guide", "https://www.avanza.se/_api/fund-guide/guide/41567"],
        ["Nordnet", "https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=isin%3DCA00288U1066"],
    ]) {
        const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0",
            Referer: provider === "Nordnet" ? "https://www.nordnet.se/" : "https://www.avanza.se/", "Client-Id": "NEXT" }, signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        console.log(JSON.stringify({ provider, status: response.status, quote: data.quote, currency: data.currency,
            listing: data.listing,
            nav: data.nav, navDate: data.navDate, navCurrency: data.navCurrency,
            instrumentInfo: data.results?.[0]?.instrument_info ? {
                instrument_id: data.results[0].instrument_info.instrument_id, isin: data.results[0].instrument_info.isin,
                currency: data.results[0].instrument_info.currency,
            } : undefined, priceInfo: data.results?.[0]?.price_info }));
    }
    process.exit(0);
}
async function request(path) {
    if (remote) {
        const response = await remoteFetch(path);
        const body = await response.json();
        console.log(JSON.stringify({ environment: "deployed", path, apiVersion: body.apiVersion, status: response.status }));
        return body;
    }
    const result = await route(new URL(path, "http://localhost"));
    if (result.status !== 200) throw Object.assign(new Error("MARKET_API_REQUEST_FAILED"), {
        code: "MARKET_API_REQUEST_FAILED", httpStatus: result.status, diagnostics: result.body.diagnostics,
    });
    return result.body;
}
const providers = {
    getYahooPrice: (symbol) => request(`/api/yahoo-price/${encodeURIComponent(symbol)}`),
    getAvanzaPriceByInstrumentId: (id) => request(`/api/avanza-price/${encodeURIComponent(id)}`),
    getAvanzaPriceByIsin: (isin) => request(`/api/avanza-search/${encodeURIComponent(isin)}`),
    getNordnetPriceByInstrumentId: (id) => request(`/api/nordnet-price/${encodeURIComponent(id)}`),
    getNordnetPriceByIsin: (isin) => request(`/api/nordnet-search/${encodeURIComponent(isin)}`),
    getFundNav: (holding) => request(`/api/fund-nav?${new URLSearchParams({ provider: holding.provider, instrumentId: holding.instrumentId, isin: holding.isin })}`),
};
let failures = 0;
for (const instrument of instruments) {
    let diagnostics;
    const quote = await getVerifiedHoldingQuote({ provider: "Avanza", assetType: "STOCK", ...instrument }, providers, Date.now,
        (value) => { diagnostics = value; });
    if (!quote) failures++;
    console.log(JSON.stringify({ instrument: instrument.name, verified: Boolean(quote), ...(quote ? {
        price: quote.price, currency: quote.currency,
        ...(quote.kind === "published_nav" ? {} : { sourceTimestamp: new Date(quote.timestamp).toISOString() }),
        ...(quote.date ? { publishedDate: quote.date } : {}),
    } : {}), diagnostics }));
}
if (remote) {
    const preflight = await fetch("https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api/api/yahoo-price/ABCL", {
        method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,apikey" },
    });
    const allowedHeaders = preflight.headers.get("access-control-allow-headers") ?? "";
    const corsVerified = preflight.ok && preflight.headers.get("access-control-allow-origin") === "*"
        && allowedHeaders.includes("authorization") && allowedHeaders.includes("apikey");
    console.log(JSON.stringify({ check: "frontend-cors-preflight", verified: corsVerified, httpStatus: preflight.status }));
    if (!corsVerified) failures++;
    try {
        await request("/api/yahoo-price/PORTFOLIO-INVALID-SYMBOL-TEST-000000");
        console.log(JSON.stringify({ check: "invalid-provider-symbol", verified: false, reason: "UNEXPECTED_SUCCESS" }));
        failures++;
    } catch (error) {
        const verified = error.code === "MARKET_API_REQUEST_FAILED" && [404, 502].includes(error.httpStatus)
            && Array.isArray(error.diagnostics) && error.diagnostics.length > 0;
        console.log(JSON.stringify({ check: "invalid-provider-symbol", verified, code: error.code,
            httpStatus: error.httpStatus, diagnostics: error.diagnostics }));
        if (!verified) failures++;
    }
}
process.exitCode = failures ? 1 : 0;
