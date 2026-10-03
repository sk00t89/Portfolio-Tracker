import { supabase } from "../lib/supabase";
import {
    appHoldingToDatabase,
    databaseHoldingToApp,
} from "../utils/holdingDatabaseMapper.js";

export async function getHoldings() {
    const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .order("created_at", { ascending: true });

    return {
        data: data?.map(databaseHoldingToApp) ?? [],
        error,
    };
}

export async function createHolding(holding) {
    const { data, error } = await supabase
        .from("holdings")
        .insert(appHoldingToDatabase(holding))
        .select()
        .single();

    return {
        data: data ? databaseHoldingToApp(data) : null,
        error,
    };
}

export async function updateHolding(id, holding) {
    const databaseHolding = appHoldingToDatabase(holding);
    delete databaseHolding.id;

    const { data, error } = await supabase
        .from("holdings")
        .update(databaseHolding)
        .eq("id", id)
        .select()
        .single();

    return {
        data: data ? databaseHoldingToApp(data) : null,
        error,
    };
}

export async function deleteHoldingById(id) {
    const { error } = await supabase
        .from("holdings")
        .delete()
        .eq("id", id);

    return { error };
}

export async function deleteAllHoldings() {
    const { error } = await supabase
        .from("holdings")
        .delete()
        .not("id", "is", null);

    return { error };
}

export async function getAccounts() {
    const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: true });

    return { data, error };
}

export async function createAccount(account) {
    const { data, error } = await supabase
        .from("accounts")
        .insert(account)
        .select()
        .single();

    return { data, error };
}

export async function getOrCreateAccountForPlatform(platform) {
    const normalizedPlatform = platform?.trim();

    if (!normalizedPlatform) {
        return { data: null, error: null };
    }

    const { data: existingAccounts, error: findError } =
        await supabase
            .from("accounts")
            .select("*")
            .eq("platform", normalizedPlatform)
            .eq("name", normalizedPlatform)
            .order("created_at", { ascending: true })
            .limit(1);

    if (findError) {
        return { data: null, error: findError };
    }

    const existingAccount =
        existingAccounts?.[0] ?? null;

    if (existingAccount) {
        return { data: existingAccount, error: null };
    }

    return createAccount({
        name: normalizedPlatform,
        platform: normalizedPlatform,
        account_type: null,
    });
}
