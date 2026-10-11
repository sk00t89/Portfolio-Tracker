import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { readPortfolioPerformance } from "../services/portfolioPerformance.js";

export default function usePortfolioPerformance(userId) {
    const [state, setState] = useState(null);
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        let reading = false;
        const read = async () => {
            if (reading || cancelled) return;
            reading = true;
            try {
                const result = await readPortfolioPerformance(supabase, import.meta.env.VITE_PORTFOLIO_PERFORMANCE_READ_ENABLED === "true");
                if (!cancelled) setState({ userId, ...result });
            } catch {
                if (!cancelled) setState({ userId, available: false, points: [], reason: "Avkastningsunderlaget kunde inte läsas. Försök igen när anslutningen fungerar." });
            } finally { reading = false; }
        };
        void read();
        // Read again after another device saves an event and after a server close.
        const timer = setInterval(read, 60000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [userId]);
    return state?.userId === userId ? state : { available: false, points: [], reason: "Läser avkastningsunderlag…" };
}
