import { useEffect, useState } from "react";
import { createDailyReferenceRefresh, dailyReferenceTargets, watchDailyReferences } from "../services/dailyReferenceRefresh.js";

export default function useDailyReferences(holdings, userId, request, enabled = true) {
    const [reader] = useState(() => createDailyReferenceRefresh({ request }));
    const [state, setState] = useState(null);
    const spec = JSON.stringify(dailyReferenceTargets(holdings));
    useEffect(() => {
        if (!userId || !enabled) return;
        let cancelled = false;
        const targets = JSON.parse(spec);
        const stop = watchDailyReferences({ eventTarget: document, refresh: now => {
            reader.refresh(targets, userId, now).then(references => {
                if (!cancelled) setState({ userId, spec, references });
            });
        } });
        return () => { cancelled = true; stop(); };
    }, [reader, userId, spec, enabled]);
    const ready = enabled && state?.userId === userId && state?.spec === spec;
    return holdings.map(h => ({ ...h, dailyReference: {
        ...h.dailyReference,
        ...(ready ? state.references[h.id] : {}),
        loading: !ready && (h.currency !== "SEK" || h.assetType === "FUND" || h.platform === "Lysa"),
    } }));
}
