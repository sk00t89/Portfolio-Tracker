import { supabase } from "../lib/supabase";

export async function getHoldings() {
    const { data, error } = await supabase
        .from("holdings")
        .select("*");

    return { data, error };
}

export async function createHolding(holding) {
    const { data, error } = await supabase
        .from("holdings")
        .insert(holding)
        .select();

    return { data, error };
}

export async function getAccounts() {
    const { data, error } = await supabase
        .from("accounts")
        .select("*");

    return { data, error };
}

export async function createAccount(account) {
    const { data, error } = await supabase
        .from("accounts")
        .insert(account)
        .select();

    return { data, error };
}