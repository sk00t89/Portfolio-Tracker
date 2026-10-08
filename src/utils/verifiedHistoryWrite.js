import { stockholmDate } from "./dashboardHistory.js";
import { validateValuationFreshness } from "./valuationFreshness.js";

// This gate is shared with the hook so failed quotes cannot reach the history RPC.
export async function writeVerifiedHistory({ inputs, valueSek, observedAt }, save, now = Date.now()) {
    const freshness = validateValuationFreshness(inputs, now);
    if (!freshness.ready) return freshness;
    const time = Date.parse(observedAt);
    if (!Number.isFinite(valueSek) || valueSek < 0 || !Number.isFinite(time) ||
        time > now + 60_000 || time < now - 20 * 60_000 || stockholmDate(time) !== stockholmDate(now)) {
        return { ready: false, reason: "Ogiltig tidpunkt eller summa för dagens portföljvärde." };
    }
    await save(stockholmDate(time), valueSek, observedAt);
    return freshness;
}
