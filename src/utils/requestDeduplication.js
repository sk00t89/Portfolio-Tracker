export function createInFlightRequests() {
    const pending = new Map();
    return (key, operation) => {
        if (!pending.has(key)) {
            const promise = Promise.resolve().then(operation);
            pending.set(key, promise);
            promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); }).catch(() => {});
        }
        return pending.get(key);
    };
}
