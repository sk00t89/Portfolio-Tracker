import { useEffect, useState } from "react";
import { fetchPerformanceBenchmark } from "../services/performanceBenchmarks.js";

export default function usePerformanceBenchmark(id, period, date, enabled, request) {
    const [state, setState] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const key = `${id}:${period}:${date}:${attempt}`;
    useEffect(() => {
        if (!enabled || !["OMXS30", "SP500"].includes(id) || period === "1D") return;
        const controller = new AbortController();
        fetchPerformanceBenchmark(request, id, period, controller.signal).then(data => {
            if (!controller.signal.aborted) setState({ key, data });
        }).catch(error => {
            if (!controller.signal.aborted) setState({ key, error: error.message });
        });
        return () => controller.abort();
    }, [id, period, enabled, request, key]);
    const active = enabled && id && period !== "1D";
    return { data: active && state?.key === key ? state.data : null,
        error: active && state?.key === key ? state.error : null,
        loading: Boolean(active && state?.key !== key), retry: () => setAttempt(value => value + 1) };
}
