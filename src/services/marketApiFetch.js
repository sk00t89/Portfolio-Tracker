import { createInFlightRequests } from "../utils/requestDeduplication.js";
import { MARKET_QUOTE_VERSION, safeQuoteDiagnostics } from "../../supabase/functions/_shared/quoteDiagnostics.js";

export function resolveMarketApiUrl({ configuredUrl, supabaseUrl, development }) {
    if (configuredUrl?.trim()) return configuredUrl.trim().replace(/\/$/, "");
    if (development) return "http://localhost:3001";
    if (!supabaseUrl) throw new Error("MARKET_API_CONFIGURATION_MISSING");
    return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/market-api`;
}

export function createMarketApiFetch({ baseUrl, apiKey, getSession, fetcher = fetch }) {
    const once = createInFlightRequests();
    return async (path, options = {}) => {
        const { data } = await getSession();
        const session = data.session;
        const method = options.method ?? "GET";
        const operation = async () => {
            const headers = new Headers(options.headers ?? {});
            if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
            headers.set("apikey", apiKey ?? "");
            const response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, { ...options, headers });
            const isQuote = /^\/api\/(yahoo-price|avanza-price|avanza-search|nordnet-price|nordnet-search)\//.test(path) || path.startsWith("/api/fund-nav?");
            let body;
            try { body = await response.clone().json(); } catch { /* An unreadable response is diagnosed below. */ }
            if (!response.ok || (isQuote && body?.apiVersion !== MARKET_QUOTE_VERSION)) {
                const error = new Error(!response.ok ? "MARKET_API_REQUEST_FAILED" : "MARKET_API_VERSION_MISMATCH");
                error.code = error.message;
                error.httpStatus = response.status;
                if (path.startsWith("/api/index-history?") && typeof body?.code === "string" && /^INDEX_[A-Z_]+$/.test(body.code)) {
                    error.indexCode = body.code;
                }
                error.diagnostics = safeQuoteDiagnostics(body?.diagnostics);
                throw error;
            }
            return response;
        };
        // Only equivalent default GET requests are shared; every consumer gets its own body stream.
        const share = method === "GET" && !options.signal && !options.headers;
        const response = await (share ? once(`${session?.user?.id ?? "anonymous"}:${method}:${path}`, operation) : operation());
        return response.clone();
    };
}
