import { supabase } from "../lib/supabase.js";

const TRANSACTIONS_KEY = "transactions";
const PERFORMANCE_KEY = "performance";

async function getLysaDataByType(dataType) {
    const { data, error } = await supabase
        .from("lysa_data")
        .select("data")
        .eq("data_type", dataType)
        .maybeSingle();

    return {
        data: data?.data ?? [],
        error,
    };
}

async function saveLysaDataByType(dataType, value) {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return {
            data: null,
            error:
                userError ??
                new Error("Ingen inloggad användare"),
        };
    }

    const { data, error } = await supabase
        .from("lysa_data")
        .upsert(
            {
                user_id: user.id,
                data_type: dataType,
                data: value,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "user_id,data_type",
            }
        )
        .select()
        .single();

    return {
        data: data?.data ?? null,
        error,
    };
}

export function getLysaTransactions() {
    return getLysaDataByType(TRANSACTIONS_KEY);
}

export function getLysaPerformance() {
    return getLysaDataByType(PERFORMANCE_KEY);
}

export function saveLysaTransactions(transactions) {
    return saveLysaDataByType(
        TRANSACTIONS_KEY,
        transactions
    );
}

export function saveLysaPerformance(performance) {
    return saveLysaDataByType(
        PERFORMANCE_KEY,
        performance
    );
}

export async function deleteLysaData() {
    const { error } = await supabase
        .from("lysa_data")
        .delete()
        .in("data_type", [
            TRANSACTIONS_KEY,
            PERFORMANCE_KEY,
        ]);

    return { error };
}
