import { useEffect, useRef, useState } from "react";
import { addManualAsset, beginManualAssetMigration, deleteManualAsset, importManualAssets, loadManualAssets, replaceManualAssets } from "../services/manualAssets.js";
import { canClaimLegacyBatch, normalizeManualAssets, prepareManualAssetMigration } from "../utils/manualAssetMigration.js";

export default function useManualAssets(userId) {
    const currentUser = useRef(userId);
    const operationRunning = useRef(false);
    useEffect(() => { currentUser.current = userId; }, [userId]);
    const [state, setState] = useState({ userId: null, assets: [], ready: false, pending: null, error: null, busy: false });
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        async function load() {
            try {
                const batch = await prepareManualAssetMigration(localStorage.getItem("assets"));
                const owner = localStorage.getItem(`manualAssetOwner:${batch.batchKey}`);
                const ignored = localStorage.getItem(`manualAssetIgnored:${userId}:${batch.batchKey}`);
                const pending = !ignored && batch.assets.length && canClaimLegacyBatch(owner, userId) ? batch : null;
                if (pending) await beginManualAssetMigration(userId);
                let cloud = await loadManualAssets(userId);
                if (!pending && !cloud.ready) {
                    await importManualAssets([], userId);
                    cloud = await loadManualAssets(userId);
                }
                if (!cancelled) setState({ userId, ...cloud, ready: cloud.ready && !pending,
                    pending, error: null, busy: false });
            } catch (error) {
                if (!cancelled) setState({ userId, assets: [], ready: false, pending: null,
                    error: `Manuella tillgångar kunde inte laddas: ${error.message}`, busy: false });
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [userId]);

    async function perform(operation) {
        if (!userId || currentUser.current !== userId || state.userId !== userId || operationRunning.current) return false;
        operationRunning.current = true;
        setState((previous) => ({ ...previous, busy: true, error: null }));
        try {
            await operation();
            const cloud = await loadManualAssets(userId);
            if (currentUser.current === userId) setState((previous) => ({ ...previous, ...cloud,
                ready: cloud.ready && !previous.pending, busy: false, error: null }));
            return true;
        } catch (error) {
            if (currentUser.current === userId) setState((previous) => ({ ...previous, busy: false, ready: false,
                error: `Ändringen kunde inte sparas: ${error.message}` }));
            return false;
        } finally {
            operationRunning.current = false;
        }
    }
    async function migrate() {
        const batch = state.pending;
        if (!batch || !canClaimLegacyBatch(localStorage.getItem(`manualAssetOwner:${batch.batchKey}`), userId)) return false;
        return perform(async () => {
            if (!navigator.locks?.request) throw new Error("Säker lokal migrering kräver en modern webbläsare och HTTPS eller localhost.");
            await navigator.locks.request("portfolio-manual-assets-migration", async () => {
            if (!canClaimLegacyBatch(localStorage.getItem(`manualAssetOwner:${batch.batchKey}`), userId)) throw new Error("En annan flik har redan kopplat tillgångarna till ett konto.");
            if (localStorage.getItem("assets") !== batch.raw) throw new Error("De lokala tillgångarna har ändrats. Ladda om innan migrering.");
            localStorage.setItem(`manualAssetOwner:${batch.batchKey}`, userId);
            localStorage.setItem(`manualAssetsBackup:${userId}:${batch.batchKey}`, batch.raw);
            await importManualAssets(batch.rows, userId);
            // Read the committed cloud state before retiring the original local key.
            await loadManualAssets(userId);
            if (localStorage.getItem("assets") === batch.raw) localStorage.removeItem("assets");
            if (currentUser.current === userId) setState((previous) => ({ ...previous, pending: null }));
            });
        });
    }
    async function useCloudOnly() {
        return perform(async () => {
            await importManualAssets([], userId);
            if (state.pending) localStorage.setItem(`manualAssetIgnored:${userId}:${state.pending.batchKey}`, "true");
            if (currentUser.current === userId) setState((previous) => ({ ...previous, pending: null }));
        });
    }
    const visible = state.userId === userId ? state : { assets: [], ready: false, pending: null, error: null, busy: true };
    return { ...visible, migrate, useCloudOnly,
        addAsset: (asset) => visible.ready ? perform(() => addManualAsset(userId, asset)) : Promise.resolve(false),
        deleteAsset: (id) => visible.ready ? perform(() => deleteManualAsset(userId, id)) : Promise.resolve(false),
        replaceAssets: (items) => visible.ready ? perform(() => replaceManualAssets(normalizeManualAssets(items), userId)) : Promise.resolve(false),
    };
}
