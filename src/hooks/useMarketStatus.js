import { useEffect, useState } from "react";
import { getMarketStatus } from "../../supabase/functions/_shared/marketCalendar.js";

const read = () => ({ now: Date.now(), markets: ["STOCKHOLM", "USA", "CRYPTO"].map((market) => getMarketStatus(market)) });
export default function useMarketStatus(refreshKey) {
    const [state, setState] = useState(read);
    useEffect(() => {
        let cancelled = false;
        const update = () => setState(read());
        // New quote objects can be newer than the last 30-second clock tick.
        queueMicrotask(() => { if (!cancelled) update(); });
        const interval = setInterval(update, 30_000);
        document.addEventListener("visibilitychange", update);
        return () => { cancelled = true; clearInterval(interval); document.removeEventListener("visibilitychange", update); };
    }, [refreshKey]);
    return state;
}
