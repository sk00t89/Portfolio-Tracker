import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { snapshotHoldingFromDatabase } from "../_shared/snapshotEngine.js";
import { createSnapshotProviders } from "../_shared/snapshotProviders.js";
import { runUserSnapshot } from "../_shared/snapshotRunner.js";
import { zonedParts } from "../_shared/marketCalendar.js";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
async function matchesSecret(actual: string, expected: string) {
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
    const [a, b] = await Promise.all([digest(actual), digest(expected)]);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    return difference === 0;
}
Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const secret = Deno.env.get("SNAPSHOT_CRON_SECRET") ?? "";
    if (secret.length < 32 || !await matchesSecret(req.headers.get("x-snapshot-secret") ?? "", secret)) return json({ error: "Unauthorized" }, 401);
    try {
        const body = await req.json();
        const dryRun = Deno.env.get("SNAPSHOT_WRITES_ENABLED") !== "true" || body.dryRun !== false;
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
        const database = {
            async input(userId: string) {
                const { data, error } = await admin.rpc("get_portfolio_snapshot_input", { p_user_id: userId });
                if (error) throw new Error("Snapshot input query failed");
                return data ? { ...data, holdings: data.holdings.map(snapshotHoldingFromDatabase) } : null;
            },
            async save(value: any) {
                const { data, error } = await admin.rpc("save_server_portfolio_daily_value", {
                    p_user_id: value.userId, p_revision: value.revision, p_valuation_date: value.date,
                    p_total_value_sek: value.totalValueSek, p_observed_at: value.observedAt, p_metadata: value.metadata,
                });
                if (error) throw new Error("Snapshot write rejected: inputs changed or observation invalid");
                return data === true;
            },
            async outcome(userId: string, date: string, started: number, status: string, reason: string | null) {
                const { error } = await admin.rpc("record_portfolio_snapshot_outcome", { p_user_id: userId, p_date: date,
                    p_attempted_at: new Date(started).toISOString(), p_status: status, p_reason: reason });
                if (error) console.error("Snapshot outcome recording failed");
            },
        };
        const providers = createSnapshotProviders({ coinGeckoKey: Deno.env.get("COINGECKO_API_KEY") ?? "" });
        const time = zonedParts(Date.now());
        // Production snapshots are deliberately taken after both exchanges close (including DST differences).
        if (!dryRun && time.time < "23:30") return json({ error: "Snapshot write window begins 23:30 Europe/Stockholm" }, 409);
        let query = admin.from("portfolio_snapshot_settings").select("user_id").eq("manual_assets_ready", true).order("user_id").limit(1);
        if (body.userId) query = query.eq("user_id", body.userId);
        else if (body.afterUserId) query = query.gt("user_id", body.afterUserId);
        const { data: users, error } = await query;
        if (error) return json({ error: "User selection failed" }, 500);
        const results = [];
        for (const user of users ?? []) {
            // Daily outcome is independent of the client history row; intraday client values cannot suppress closing snapshots.
            if (!dryRun) {
                const { data: previous, error: runError } = await admin.from("portfolio_snapshot_runs").select("status").eq("user_id", user.user_id).eq("valuation_date", time.date).maybeSingle();
                if (runError) return json({ error: "Outcome query failed" }, 500);
                if (["saved", "superseded"].includes(previous?.status)) continue;
            }
            results.push({ userId: user.user_id, ...await runUserSnapshot({ userId: user.user_id, database, providers, dryRun }) });
        }
        // A bounded batch avoids monopolizing the Edge runtime. Continuation is queued server-side by SQL.
        const nextCursor = !body.userId && users?.length === 1 ? users[0].user_id : null;
        if (nextCursor && body.continue === true) {
            const { error: queueError } = await admin.rpc("enqueue_portfolio_snapshot_batch", { p_after_user_id: nextCursor, p_dry_run: dryRun });
            if (queueError) return json({ results, nextCursor, error: "Continuation enqueue failed" }, 500);
        }
        return json({ dryRun, results, nextCursor });
    } catch {
        return json({ error: "Snapshot request failed" }, 500);
    }
});
