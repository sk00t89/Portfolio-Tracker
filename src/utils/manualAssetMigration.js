export function normalizeManualAssets(items) {
    if (!Array.isArray(items)) throw new Error("Ogiltig lokal tillgångslista.");
    return items.filter((item) => item.source === "manual").map((item) => {
        const value = Number(item.value);
        if (!item.name?.trim() || !item.category || !Number.isFinite(value) || value < 0) {
            throw new Error("En lokal tillgång har ogiltigt namn, kategori eller värde. Originalet har behållits.");
        }
        return { ...item, name: item.name.trim(), value, source: "manual" };
    });
}

export async function prepareManualAssetMigration(raw) {
    const assets = normalizeManualAssets(JSON.parse(raw ?? "[]"));
    const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const occurrences = new Map();
    const rows = await Promise.all(assets.map(async (asset) => {
        const identity = JSON.stringify([asset.id ?? null, asset.name, asset.category, asset.value]);
        const occurrence = occurrences.get(identity) ?? 0;
        occurrences.set(identity, occurrence + 1);
        return { name: asset.name, category: asset.category, value_sek: asset.value,
            legacy_key: await hash(`${identity}:${occurrence}`) };
    }));
    return { assets, rows, batchKey: await hash(JSON.stringify(rows)), raw };
}

export function canClaimLegacyBatch(owner, userId) {
    return Boolean(userId && (!owner || owner === userId));
}
