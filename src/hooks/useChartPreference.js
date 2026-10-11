import { useState } from "react";

export default function useChartPreference(key, fallback, allowed) {
    const [value, setValue] = useState(() => {
        try {
            const saved = globalThis.localStorage?.getItem(key);
            return allowed.includes(saved) ? saved : fallback;
        } catch {
            return fallback;
        }
    });
    const select = (next) => {
        if (!allowed.includes(next)) return;
        setValue(next);
        try {
            globalThis.localStorage?.setItem(key, next);
        } catch {
            // The current selection still works when browser storage is unavailable.
        }
    };
    return [value, select];
}
