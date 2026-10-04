import { useEffect, useState } from "react";
import { getMarketStatus } from "../../supabase/functions/_shared/marketCalendar.js";

const read = () => ({ now: Date.now(), markets: ["STOCKHOLM", "USA", "CRYPTO"].map((market) => getMarketStatus(market)) });
export default function useMarketStatus() {
    const [state, setState] = useState(read);
    useEffect(() => {
        const update = () => setState(read());
        const interval = setInterval(update, 30_000);
        document.addEventListener("visibilitychange", update);
        return () => { clearInterval(interval); document.removeEventListener("visibilitychange", update); };
    }, []);
    return state;
}
