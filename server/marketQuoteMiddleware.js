import { createMarketQuoteRoutes } from "../supabase/functions/_shared/marketQuoteRoutes.js";

export function createMarketQuoteMiddleware(options) {
    const route = createMarketQuoteRoutes(options);
    return async (req, res, next) => {
        if (req.method && req.method !== "GET") return next();
        const result = await route(new URL(req.originalUrl, "http://localhost"));
        if (result) return res.status(result.status).json(result.body);
        return next();
    };
}
