import { supabase } from "../lib/supabase.js";

const toApp = (row) => ({ id: row.id, name: row.name, category: row.category, value: Number(row.value_sek), source: "manual" });
export async function loadManualAssets(userId) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("manual_assets").select("*").eq("user_id", userId)
            .order("created_at").order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...data.map(toApp));
        if (data.length < 1000) break;
    }
    const { data: settings, error } = await supabase.from("portfolio_snapshot_settings").select("manual_assets_ready")
        .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return { assets: rows, ready: settings?.manual_assets_ready === true };
}
export async function importManualAssets(rows, userId) {
    const { error } = await supabase.rpc("import_manual_assets", { p_assets: rows, p_expected_user: userId });
    if (error) throw error;
}
export async function beginManualAssetMigration(userId) {
    const { error } = await supabase.rpc("begin_manual_assets_migration", { p_expected_user: userId });
    if (error) throw error;
}
export async function addManualAsset(userId, asset) {
    const { data, error } = await supabase.from("manual_assets").insert({ user_id: userId,
        name: asset.name, category: asset.category, value_sek: asset.value }).select().single();
    if (error) throw error;
    return toApp(data);
}
export async function deleteManualAsset(userId, id) {
    const { error } = await supabase.from("manual_assets").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
}
export async function replaceManualAssets(items, userId) {
    const { error } = await supabase.rpc("replace_manual_assets", { p_assets: items.map((asset) => ({
        name: asset.name, category: asset.category, value_sek: asset.value,
    })), p_expected_user: userId });
    if (error) throw error;
}
