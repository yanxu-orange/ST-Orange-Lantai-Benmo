import { toSafeErrorRecord } from '../domain/errors.js';

const SENSITIVE_KEY = /^(api[_-]?key|password|authorization|secret|secretId)$/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function sanitizeLogValue(value) {
    if (typeof value === 'string') return value.replace(BEARER_VALUE, 'Bearer [REDACTED]');
    if (Array.isArray(value)) return value.map(sanitizeLogValue);
    if (!value || typeof value !== 'object') return value;
    if (value instanceof Error) return toSafeErrorRecord(value);

    const result = {};
    for (const [key, child] of Object.entries(value)) {
        result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeLogValue(child);
    }
    return result;
}

export function createSafeLogger({ sink = console, level = 'warn' } = {}) {
    const weights = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
    const threshold = weights[level] ?? weights.warn;
    const write = (method, message, details) => {
        if ((weights[method] ?? 100) < threshold) return;
        const fn = sink?.[method];
        if (typeof fn !== 'function') return;
        if (details === undefined) fn.call(sink, `[TKM] ${message}`);
        else fn.call(sink, `[TKM] ${message}`, sanitizeLogValue(details));
    };
    return {
        debug: (message, details) => write('debug', message, details),
        info: (message, details) => write('info', message, details),
        warn: (message, details) => write('warn', message, details),
        error: (message, details) => write('error', message, details),
    };
}
