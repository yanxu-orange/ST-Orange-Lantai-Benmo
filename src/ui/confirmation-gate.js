export function createConfirmationGate() {
    let pending = null;

    return {
        isPending() {
            return Boolean(pending);
        },
        request() {
            if (pending) return pending.promise;
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            pending = { promise, resolve };
            return promise;
        },
        settle(confirmed) {
            if (!pending) return false;
            const current = pending;
            pending = null;
            current.resolve(Boolean(confirmed));
            return true;
        },
    };
}
