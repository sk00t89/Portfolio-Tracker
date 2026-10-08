export const MARKET_QUOTE_VERSION = "market-quotes-v2";
const providers = ["Yahoo", "Avanza", "Nordnet", "CoinGecko", "Fund NAV"];
const stages = ["chart", "instrument-id", "isin", "isin-discovery", "isin-detail", "published-nav", "crypto",
    "query1.finance.yahoo.com", "query2.finance.yahoo.com", "http", "freshness", "identity", "quote"];
export function safeQuoteDiagnostics(input) {
    return (Array.isArray(input) ? input : []).slice(0, 30).map((item) => ({
        provider: providers.includes(item?.provider) ? item.provider : "Unknown",
        stage: stages.includes(item?.stage) ? item.stage : "quote",
        outcome: ["accepted", "received"].includes(item?.outcome) ? item.outcome : "rejected",
        ...(typeof item?.reasonCode === "string" && /^[A-Z_]{1,60}$/.test(item.reasonCode) ? { reasonCode: item.reasonCode } : {}),
        ...(Number.isInteger(item?.httpStatus) && item.httpStatus >= 100 && item.httpStatus <= 599 ? { httpStatus: item.httpStatus } : {}),
    }));
}
