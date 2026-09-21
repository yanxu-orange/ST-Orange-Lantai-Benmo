import { CHAT_SCHEMA_VERSION, GLOBAL_SCHEMA_VERSION } from '../constants.js';
import { cloneJson } from './schema-utils.js';

const FORBIDDEN_SECRET_FIELDS = new Set([
    'apiKey',
    'api_key',
    'password',
    'authorization',
    'Authorization',
]);

function assertNoRawSecrets(value, path = '$') {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoRawSecrets(item, `${path}[${index}]`));
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_SECRET_FIELDS.has(key)) {
            throw new Error(`导出数据包含禁止字段：${path}.${key}`);
        }
        assertNoRawSecrets(child, `${path}.${key}`);
    }
}

export function createAuthorityExport({ scope, data, exportedAt = new Date().toISOString() }) {
    const expectedVersion = scope === 'chat'
        ? CHAT_SCHEMA_VERSION
        : scope === 'global'
            ? GLOBAL_SCHEMA_VERSION
            : null;
    if (expectedVersion === null) throw new TypeError('导出作用域必须是 chat 或 global。');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new TypeError('导出数据根必须是对象。');
    }
    assertNoRawSecrets(data);
    return {
        format: 'time-keyword-memory-export',
        formatVersion: 1,
        scope,
        schemaVersion: expectedVersion,
        exportedAt,
        data: cloneJson(data),
    };
}

export { assertNoRawSecrets };
