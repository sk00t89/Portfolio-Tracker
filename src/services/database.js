import { supabase } from "../lib/supabase";
import {
    appHoldingToDatabase,
    databaseHoldingToApp,
} from "../utils/holdingDatabaseMapper.js";

// Keep existing holding writes working while the separately delivered SQL awaits approval.
async function writeHoldingWithOptionalQuote(payload, write) {
    const compatiblePayload = { ...payload };
    let result = await write(compatiblePayload);
    for (let retry = 0; retry < 2; retry++) {
        const optional = ["previous_close", "coin_id"].find((column) =>
            ["PGRST204", "42703"].includes(result.error?.code) && result.error.message?.includes(column));
        if (!optional) break;
        delete compatiblePayload[optional];
        result = await write(compatiblePayload);
    }
    return result;
}

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
    const { data, error } = await writeHoldingWithOptionalQuote(
        appHoldingToDatabase(holding),
        (payload) => supabase.from("holdings").insert(payload).select().single()
    );

    return {
        data: data ? databaseHoldingToApp(data) : null,
        error,
    };
}

export async function updateHolding(id, holding) {
    const databaseHolding = appHoldingToDatabase(holding);
    delete databaseHolding.id;

    const { data, error } = await writeHoldingWithOptionalQuote(databaseHolding,
        (payload) => supabase.from("holdings").update(payload).eq("id", id).select().single()
    );

    return {
        data: data ? { ...databaseHoldingToApp(data),
            previousClose: data.previous_close ?? holding.previousClose ?? null } : null,
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

// Refresh only quote fields, guarded atomically against edits made during the provider request.
export async function updateHoldingQuote(id, quote, expectedHolding, userId) {
    const mapped = appHoldingToDatabase(quote);
    const payload = Object.fromEntries(["current_price", "current_value_sek", "previous_close", "price_updated_at", "currency", "updated_at"]
        .map((key) => [key, mapped[key]]));
    const expected = appHoldingToDatabase(expectedHolding);
    const { data, error } = await writeHoldingWithOptionalQuote(payload, (values) => {
        let query = supabase.from("holdings").update(values).eq("id", id).eq("user_id", userId);
        for (const key of ["quantity", "currency", "asset_type", "product_type", "market", "provider", "instrument_id", "isin", "ticker"]) {
            query = expected[key] == null ? query.is(key, null) : query.eq(key, expected[key]);
        }
        return query.select().single();
    });
    return { data: data ? databaseHoldingToApp(data) : null, error };
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
