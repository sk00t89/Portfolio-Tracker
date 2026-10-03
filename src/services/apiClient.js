import { supabase } from "../lib/supabase.js";

const DEFAULT_LOCAL_API_URL = "http://localhost:3001";

export const MARKET_API_URL = (
    import.meta.env.VITE_MARKET_API_URL ??
    DEFAULT_LOCAL_API_URL
).replace(/\/$/, "");

export async function apiFetch(path, options = {}) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    const headers = new Headers(options.headers ?? {});

    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }

    headers.set(
        "apikey",
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""
    );

    return fetch(
        `${MARKET_API_URL}${path.startsWith("/") ? path : `/${path}`}`,
        {
            ...options,
            headers,
        }
    );
}
