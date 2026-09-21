import { createStableId, isoNow, isRecord } from '../storage/schema-utils.js';

export const PROMPT_MODULE_SCOPES = Object.freeze(['global', 'character', 'chat']);
export const PROMPT_MODULE_ROLES = Object.freeze(['system', 'user', 'assistant']);
export const PROMPT_MODULE_LIFECYCLES = Object.freeze(['prompt', 'collect', 'sync']);
export const PROMPT_MODULE_MAX_DEPTH = 10000;

function requiredText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`);
    return value.trim();
}

function validScope(value) {
    if (!PROMPT_MODULE_SCOPES.includes(value)) throw new Error('模块作用范围不可用。');
    return value;
}

function validRole(value) {
    if (!PROMPT_MODULE_ROLES.includes(value)) throw new Error('模块发送角色不可用。');
    return value;
}

function validLifecycle(value, { defaultValue = 'prompt' } = {}) {
    const lifecycle = value ?? defaultValue;
    if (!PROMPT_MODULE_LIFECYCLES.includes(lifecycle)) throw new Error('模块用途不可用。');
    return lifecycle;
}

function validCaptureToken(value, lifecycle) {
    if (lifecycle === 'prompt') return null;
    if (typeof value !== 'string' || !/^[gch][1-9][0-9]*$/.test(value)) {
        throw new Error('模块回收编号不可用。');
    }
    return value;
}

function validDepth(value) {
    const depth = Number(value);
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > PROMPT_MODULE_MAX_DEPTH) {
        throw new Error(`模块注入深度必须是 0–${PROMPT_MODULE_MAX_DEPTH} 之间的整数。`);
    }
    return depth;
}

function validEnabled(value, { defaultValue } = {}) {
    if (value === undefined && typeof defaultValue === 'boolean') return defaultValue;
    if (typeof value !== 'boolean') throw new Error('模块启用状态不可用。');
    return value;
}

function validTimestamp(value, label) {
    if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
        throw new Error(`${label}不可用。`);
    }
    return value;
}

export function createPromptModule(input, {
    now,
    idFactory = () => createStableId('prompt-module'),
} = {}) {
    if (!isRecord(input)) throw new Error('模块内容不可用。');
    const at = isoNow(now);
    const id = requiredText(idFactory(), '模块 ID');
    const lifecycle = validLifecycle(input.lifecycle);
    return {
        id,
        name: requiredText(input.name, '模块名称'),
        enabled: validEnabled(input.enabled, { defaultValue: true }),
        content: requiredText(input.content, '注入内容'),
        scope: validScope(input.scope),
        role: validRole(input.role),
        depth: validDepth(input.depth),
        lifecycle,
        captureTag: validCaptureToken(input.captureTag, lifecycle),
        createdAt: at,
        updatedAt: at,
    };
}

export function updatePromptModule(current, patch, { now } = {}) {
    const original = normalizePromptModule(current, current?.scope);
    if (!isRecord(patch)) throw new Error('模块修改内容不可用。');
    if (Object.hasOwn(patch, 'scope') && patch.scope !== original.scope) {
        throw new Error('已有模块不能直接更改作用范围。');
    }
    const lifecycle = Object.hasOwn(patch, 'lifecycle') ? validLifecycle(patch.lifecycle) : original.lifecycle;
    return {
        ...original,
        name: Object.hasOwn(patch, 'name') ? requiredText(patch.name, '模块名称') : original.name,
        enabled: Object.hasOwn(patch, 'enabled') ? validEnabled(patch.enabled) : original.enabled,
        content: Object.hasOwn(patch, 'content') ? requiredText(patch.content, '注入内容') : original.content,
        role: Object.hasOwn(patch, 'role') ? validRole(patch.role) : original.role,
        depth: Object.hasOwn(patch, 'depth') ? validDepth(patch.depth) : original.depth,
        lifecycle,
        captureTag: lifecycle === original.lifecycle
            ? original.captureTag
            : validCaptureToken(patch.captureTag, lifecycle),
        updatedAt: isoNow(now),
    };
}

export function normalizePromptModule(value, expectedScope) {
    if (!isRecord(value)) throw new Error('模块记录不可用。');
    const scope = validScope(value.scope);
    if (expectedScope && scope !== expectedScope) throw new Error('模块记录与保存范围不一致。');
    const lifecycle = validLifecycle(value.lifecycle);
    const id = requiredText(value.id, '模块 ID');
    return {
        id,
        name: requiredText(value.name, '模块名称'),
        enabled: validEnabled(value.enabled),
        content: requiredText(value.content, '注入内容'),
        scope,
        role: validRole(value.role),
        depth: validDepth(value.depth),
        lifecycle,
        captureTag: validCaptureToken(value.captureTag, lifecycle),
        createdAt: validTimestamp(value.createdAt, '模块创建时间'),
        updatedAt: validTimestamp(value.updatedAt, '模块更新时间'),
    };
}

export function normalizePromptModules(values, expectedScope) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
        try {
            const module = normalizePromptModule(value, expectedScope);
            if (seen.has(module.id)) continue;
            seen.add(module.id);
            normalized.push(module);
        } catch {
            // Invalid unpublished module records are ignored instead of becoming runtime prompts.
        }
    }
    return normalized;
}

export function reorderPromptModules(modules, orderedIds, expectedScope) {
    const current = normalizePromptModules(modules, expectedScope);
    if (!Array.isArray(orderedIds) || orderedIds.length !== current.length) {
        throw new Error('模块排序必须包含当前分组的全部模块。');
    }
    const byId = new Map(current.map(module => [module.id, module]));
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some(id => !byId.has(id))) {
        throw new Error('模块排序包含未知或重复项目。');
    }
    return orderedIds.map(id => byId.get(id));
}
