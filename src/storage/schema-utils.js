export function cloneJson(value) {
    return globalThis.structuredClone
        ? globalThis.structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

export function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergePreservingUnknown(defaults, current) {
    if (!isRecord(current)) return cloneJson(defaults);

    const result = cloneJson(defaults);
    for (const [key, value] of Object.entries(current)) {
        if (isRecord(value) && isRecord(result[key])) {
            result[key] = mergePreservingUnknown(result[key], value);
        } else {
            result[key] = cloneJson(value);
        }
    }
    return result;
}

export function createStableId(prefix, randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
    const suffix = typeof randomUUID === 'function'
        ? randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
}

export function isoNow(now = () => new Date()) {
    const value = now();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
