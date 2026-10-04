const sensitive = /api[\s_-]?key|token|authorization|bearer|password|secret|cookie|credential|session|private[\s_-]?key|\beyJ[\w-]+\.[\w-]+\.[\w-]+/i;
export function diagnosticInstrument(holding) {
    return Object.fromEntries(["name", "ticker", "instrumentId", "provider", "assetType", "market", "country", "isin"].map((key) => [key, holding[key] ?? null])
        .concat([["exchange", holding.exchange ?? holding.market ?? null]]));
}
export function attachHttpInstrument(error, holding) {
    if (error?.diagnostics?.code === "MARKET_PROVIDER_HTTP_ERROR") {
        // Attach at the consumer, not in the cached request, so shared errors identify the current holding.
        const contextual = new Error(error.message);
        contextual.diagnostics = { ...error.diagnostics, instrument: diagnosticInstrument(holding), listingCode: String(holding.market ?? "").toUpperCase() };
        return contextual;
    }
    return error;
}
async function safeBody(response, secrets) {
    try {
        let raw;
        if (response.body?.getReader) {
            const reader = response.body.getReader();
            const chunks = []; let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.length;
                    if (size > 4096) { await reader.cancel(); return { responseBodyOmitted: "too_large" }; }
                    chunks.push(value);
                }
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            raw = new TextDecoder().decode(bytes);
        } else if (response.text) raw = await response.text();
        else return { responseBodyOmitted: "unavailable" };
        if (raw.length > 4096) return { responseBodyOmitted: "too_large" };
        let decoded = raw;
        for (let i = 0; i < 3; i++) { try { decoded = decodeURIComponent(decoded); } catch { break; } }
        if (sensitive.test(decoded) || secrets.filter(Boolean).some((secret) => decoded.includes(secret) || raw.includes(secret))) return { responseBodyOmitted: "potential_secrets" };
        // HTML and arbitrary JSON data are omitted; only common public error fields are allowed.
        let summary;
        try {
            const parsed = JSON.parse(raw);
            const error = parsed.chart?.error ?? parsed.error ?? parsed;
            if (typeof error === "string") summary = error;
            else summary = JSON.stringify(Object.fromEntries(["code", "message", "description", "status"].filter((key) =>
                ["string", "number"].includes(typeof error?.[key])).map((key) => [key, error[key]])));
            if (summary === "{}") return { responseBodyOmitted: "no_safe_error_fields" };
        } catch {
            if (/[<>]|https?:\/\//i.test(raw) || !/^(not found|unavailable|service unavailable|bad request|forbidden|too many requests|internal server error)\b/i.test(raw.trim())) return { responseBodyOmitted: "unstructured_content" };
            summary = raw.trim();
        }
        if (sensitive.test(summary) || secrets.filter(Boolean).some((secret) => summary.includes(secret))) return { responseBodyOmitted: "potential_secrets" };
        return { responseBody: summary.slice(0, 512), responseBodyTruncated: summary.length > 512 };
    } catch { return { responseBodyOmitted: "unavailable" }; }
}
export async function providerHttpError(response, url, headers, knownSecrets = []) {
    const parsed = new URL(url);
    const provider = ({ "query1.finance.yahoo.com": "Yahoo", "www.avanza.se": "Avanza", "www.nordnet.se": "Nordnet",
        "api.coingecko.com": "CoinGecko", "api.frankfurter.app": "Frankfurter", "api.lysa.se": "Lysa" })[parsed.hostname] ?? parsed.hostname;
    const secrets = [...knownSecrets, ...[...parsed.searchParams].filter(([key]) => sensitive.test(key)).map(([, value]) => value),
        ...Object.entries(headers).filter(([key]) => sensitive.test(key)).map(([, value]) => String(value))];
    // Only explicitly public identity parameters are retained, never a full query string.
    const symbol = provider === "Yahoo" ? decodeURIComponent(parsed.pathname.split("/").at(-1)) :
        provider === "CoinGecko" ? parsed.searchParams.get("ids") : provider === "Frankfurter" ? `${parsed.searchParams.get("from")}-${parsed.searchParams.get("to")}` :
        ["Avanza", "Nordnet"].includes(provider) ? (parsed.searchParams.get("apply_filters") ?? parsed.pathname.split("/").at(-1)) : null;
    const error = new Error(`Market provider HTTP ${response.status}`);
    error.diagnostics = { code: "MARKET_PROVIDER_HTTP_ERROR", marketProvider: provider, normalizedSymbol: symbol,
        httpStatus: response.status, endpoint: `${parsed.origin}${parsed.pathname}`, ...await safeBody(response, secrets) };
    return error;
}
