import { useEffect, useRef, useState } from "react";
import { getPortfolioHistory, savePortfolioDailyValue } from "../services/portfolioHistory.js";
import { stockholmDate } from "../utils/dashboardHistory.js";
import { validateValuationFreshness } from "../utils/valuationFreshness.js";
import { createHistoryWriteQueue, nextObservationTime } from "../utils/historyWriteQueue.js";

const enqueueWrite = createHistoryWriteQueue();

export default function usePortfolioHistory(userId, portfolioValue, ready, valuationInputs) {
    const [state, setState] = useState({ userId: null, points: [], error: null, loading: true });
    const [tick, setTick] = useState(0);
    const savedValue = useRef(null);
    const [freshnessReason, setFreshnessReason] = useState(null);
    const validationKey = JSON.stringify(valuationInputs);
    useEffect(() => {
        const interval = setInterval(() => setTick((value) => value + 1), 60_000);
        return () => clearInterval(interval);
    }, []);
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        async function load() {
            try {
                const points = await getPortfolioHistory(userId);
                if (!cancelled) setState({ userId, points, error: null, loading: false });
            } catch {
                if (!cancelled) setState({ userId, points: [], loading: false,
                    error: "Historiken kunde inte läsas. Kontrollera anslutningen och att dashboard-SQL har körts i Supabase." });
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [userId]);
    useEffect(() => {
        if (!userId || !ready || !Number.isFinite(portfolioValue) || portfolioValue < 0) return;
        const observedAt = nextObservationTime();
        const date = stockholmDate(observedAt);
        // A newly verified quote set advances ordering even if the total is unchanged.
        const key = `${userId}:${date}:${portfolioValue}:${validationKey}`;
        let cancelled = false;
        // Allow consecutive price/import updates to settle before writing one daily value.
        const timeout = setTimeout(async () => {
            try {
                await enqueueWrite(async () => {
                    if (cancelled || date !== stockholmDate()) return;
                    const freshness = validateValuationFreshness(JSON.parse(validationKey));
                    setFreshnessReason(freshness.reason);
                    if (!freshness.ready || savedValue.current === key) return;
                    await savePortfolioDailyValue(date, portfolioValue, observedAt);
                    if (cancelled) return;
                    const points = await getPortfolioHistory(userId);
                    if (!cancelled) {
                        savedValue.current = key;
                        setState({ userId, points, loading: false, error: null });
                    }
                });
            } catch {
                if (cancelled) return;
                savedValue.current = null;
                if (!cancelled) setState((current) => ({ userId,
                    points: current.userId === userId ? current.points : [], loading: false,
                    error: "Dagens värde kunde inte sparas. Kontrollera anslutningen och att dashboard-SQL har körts i Supabase." }));
            }
        }, 2000);
        return () => { cancelled = true; clearTimeout(timeout); };
    }, [userId, portfolioValue, ready, tick, validationKey]);
    return state.userId === userId ? { ...state, freshnessReason } : { points: [], error: null, loading: true, freshnessReason: null };
}
