import test from "node:test";
import assert from "node:assert/strict";
import { canClaimLegacyBatch, prepareManualAssetMigration, normalizeManualAssets } from "../src/utils/manualAssetMigration.js";
const assets = [{ id: 1, name: "Sparkonto", category: "CASH", value: 500, source: "manual" }];
test("manual migration is deterministic and retains original raw backup", async () => {
    const raw = JSON.stringify(assets);
    const first = await prepareManualAssetMigration(raw);
    const second = await prepareManualAssetMigration(raw);
    assert.deepEqual(first, second);
    assert.equal(first.raw, raw);
    assert.equal(first.rows[0].value_sek, 500);
    assert.equal(first.rows[0].legacy_key.length, 64);
});
test("intentional identical legacy assets retain distinct migration identities", async () => {
    const batch = await prepareManualAssetMigration(JSON.stringify([assets[0], assets[0]]));
    assert.notEqual(batch.rows[0].legacy_key, batch.rows[1].legacy_key);
});
test("unassigned legacy batches need account selection and cannot move to another claimed account", () => {
    assert.equal(canClaimLegacyBatch(null, "user1"), true);
    assert.equal(canClaimLegacyBatch("user1", "user1"), true);
    assert.equal(canClaimLegacyBatch("user1", "user2"), false);
    assert.equal(canClaimLegacyBatch(null, null), false);
});
test("invalid local data fails without partial import; empty legacy store is valid", async () => {
    for (const raw of ["invalid JSON", "{}", JSON.stringify([...assets, { ...assets[0], value: -1 }])]) await assert.rejects(prepareManualAssetMigration(raw));
    assert.deepEqual((await prepareManualAssetMigration(null)).rows, []);
    assert.deepEqual(normalizeManualAssets([{ source: "market" }]), []);
});
