import { supabase } from "../lib/supabase.js";
import { createMarketApiFetch, resolveMarketApiUrl } from "./marketApiFetch.js";

export const MARKET_API_URL = resolveMarketApiUrl({ configuredUrl: import.meta.env.VITE_MARKET_API_URL,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL, development: import.meta.env.DEV });

export const apiFetch = createMarketApiFetch({ baseUrl: MARKET_API_URL,
    apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    getSession: () => supabase.auth.getSession() });
