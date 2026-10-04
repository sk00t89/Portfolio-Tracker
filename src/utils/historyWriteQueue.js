// Shared across hook instances. A rejected write must not block later observations.
export function createHistoryWriteQueue() {
    let tail = Promise.resolve();
    return (operation) => {
        const result = tail.then(operation);
        tail = result.catch(() => {});
        return result;
    };
}

let lastObservationTime = 0;
export function nextObservationTime(now = Date.now()) {
    lastObservationTime = Math.max(now, lastObservationTime + 1);
    return new Date(lastObservationTime).toISOString();
}
