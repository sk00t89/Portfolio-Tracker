import { referenceFx, validDate, REFERENCE_DATA_VERSION } from "../../supabase/functions/_shared/referenceData.js";
import { stockholmDate } from "../utils/calendarDate.js";
export function createReferenceFxClient({ request, storage, clock = Date.now }) {
    const pending = new Map();
    return function rates(from, to, date = stockholmDate(clock())) {
        const key = `referenceFx_v1_${from}_${to}_${date}`;
        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to || !validDate(date)) return Promise.reject(new Error("FX_PAIR_INVALID"));
        const verify = data => {
            if (data?.apiVersion !== REFERENCE_DATA_VERSION || !Array.isArray(data.observations)) throw new Error("FX_VERSION_INVALID");
            const checkedAt = data.current?.checkedAt;
            if (!Number.isFinite(checkedAt) || checkedAt > clock() || clock() - checkedAt > 10 * 60_000) throw new Error("FX_CHECK_EXPIRED");
            const validated = referenceFx(data.observations.map(p => {
                if (p.verified !== true || p.provider !== "Frankfurter" || p.kind !== "daily_reference" || p.sourceTimestamp !== null || p.from !== from || p.to !== to) throw new Error("FX_SOURCE_INVALID");
                return { base: p.from, quote: p.to, rate: p.rate, date: p.sourceDate };
            }), from, to, date, checkedAt);
            return validated;
        };
        try { const cached = JSON.parse(storage?.getItem(key) ?? "null"); if (cached) return Promise.resolve(verify(cached)); }
        catch { /* Missing, legacy, corrupt or expired entries must be fetched again. */ }
        if (!pending.has(key)) pending.set(key, (async () => {
            const response = await request(`/api/reference-fx/${from}/${to}?date=${date}`);
            if (!response.ok) throw new Error("FX_REFERENCE_UNAVAILABLE");
            const data = verify(await response.json());
            try { storage?.setItem(key, JSON.stringify(data)); } catch { /* Storage is optional. */ }
            return data;
        })().finally(() => pending.delete(key)));
        return pending.get(key);
    };
}
