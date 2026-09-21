function snapshot(value) {
    return JSON.stringify(value ?? null);
}

export function createDirtyState() {
    const baselines = new Map();
    return {
        setBaseline(key, value) { baselines.set(key, snapshot(value)); },
        isDirty(key, value) { return baselines.has(key) && baselines.get(key) !== snapshot(value); },
        clear(key) { baselines.delete(key); },
        clearAll() { baselines.clear(); },
    };
}
