import { supabase } from "../lib/supabase.js";

export async function getPortfolioHistory(userId) {
    const points = [];
    // Supabase defaults to a 1000-row response limit. Keep All accurate for longer histories.
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("portfolio_daily_values")
            .select("valuation_date,total_value_sek,updated_at,observed_at")
            .eq("user_id", userId).order("valuation_date", { ascending: true })
            .range(offset, offset + 999);
        if (error) throw error;
        points.push(...data.map((row) => ({ date: row.valuation_date,
            valueSek: Number(row.total_value_sek), updatedAt: row.updated_at, observedAt: row.observed_at })));
        if (data.length < 1000) return points;
    }
}

export async function savePortfolioDailyValue(date, valueSek, observedAt) {
    // Ownership comes from auth.uid() inside the RPC; ordering is enforced atomically in SQL.
    const { data, error } = await supabase.rpc("save_portfolio_daily_value", {
        p_valuation_date: date, p_total_value_sek: valueSek, p_observed_at: observedAt,
    });
    if (error) throw error;
    return data;
}
