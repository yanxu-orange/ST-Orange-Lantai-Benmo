import { ensureGlobalSettings, getRequestHeaders, saveGlobalSettings } from '../st-adapter/context.js';
import { deleteCustomSecret, writeCustomSecret } from '../st-adapter/secrets.js';
import {
    normalizeEndpoint,
    probeCustomOpenAIConnection,
    probeCustomOpenAIGeneration,
} from './custom-openai-probe.js';

function createPresetId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePresetName(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError('方案名称不能为空。');
    }
    return value.trim().slice(0, 80);
}

function normalizeModel(value, { required = true } = {}) {
    const model = typeof value === 'string' ? value.trim() : '';
    if (required && !model) {
        throw new TypeError('插件 API 模型名不能为空。');
    }
    return model;
}

function clonePreset(preset) {
    return preset ? { ...preset } : null;
}

function syncLegacyActiveFields(secondary) {
    const active = secondary.presets.find(item => item.id === secondary.activePresetId) ?? null;
    secondary.endpoint = active?.endpoint ?? '';
    secondary.model = active?.model ?? '';
    secondary.secretId = active?.secretId ?? null;
    secondary.enabled = Boolean(active?.endpoint && active?.model && active?.secretId);
    return active;
}

function ensurePresetState(context, { idFactory = createPresetId } = {}) {
    const settings = ensureGlobalSettings(context);
    const secondary = settings.aiProvider.secondary;
    let migrated = false;

    if (!Array.isArray(secondary.presets)) {
        secondary.presets = [];
        migrated = true;
    }

    if (
        secondary.presets.length === 0
        && (secondary.endpoint || secondary.model || secondary.secretId)
    ) {
        const id = idFactory();
        secondary.presets.push({
            id,
            name: '默认方案',
            endpoint: secondary.endpoint ?? '',
            model: secondary.model ?? '',
            secretId: secondary.secretId ?? null,
        });
        secondary.activePresetId = id;
        migrated = true;
    }

    if (
        secondary.activePresetId
        && !secondary.presets.some(item => item.id === secondary.activePresetId)
    ) {
        secondary.activePresetId = null;
        migrated = true;
    }
    if (!secondary.activePresetId && secondary.presets.length > 0) {
        secondary.activePresetId = secondary.presets[0].id;
        migrated = true;
    }

    if (settings.schemaVersion < 2) {
        settings.schemaVersion = 2;
        migrated = true;
    }
    syncLegacyActiveFields(secondary);
    if (migrated) saveGlobalSettings(context);
    return { settings, secondary, migrated };
}

function requirePreset(secondary, presetId) {
    const preset = secondary.presets.find(item => item.id === presetId);
    if (!preset) throw new TypeError('请先选择并保存一个插件 API 方案。');
    return preset;
}

function findPreset(secondary, presetId) {
    return presetId
        ? secondary.presets.find(item => item.id === presetId) ?? null
        : null;
}

async function runWithDraftSecret({
    context,
    preset,
    apiKey,
    fetchImpl,
    operation,
}) {
    const enteredKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    let temporarySecretId = null;
    if (enteredKey) {
        temporarySecretId = await writeCustomSecret({
            value: enteredKey,
            label: '兰台：临时连接',
            headers: getRequestHeaders(context),
            fetchImpl,
        });
    }

    const secretId = temporarySecretId ?? preset?.secretId ?? null;
    if (!secretId) {
        throw new TypeError('请输入 API Key，或选择一个已保存密钥的方案。');
    }

    let result;
    let operationError = null;
    try {
        result = await operation(secretId);
    } catch (error) {
        operationError = error;
    }

    let cleanupError = null;
    if (temporarySecretId) {
        try {
            await deleteCustomSecret({
                id: temporarySecretId,
                headers: getRequestHeaders(context),
                fetchImpl,
            });
        } catch (error) {
            cleanupError = error;
        }
    }

    if (operationError && cleanupError) {
        throw new Error(`${operationError.message}；临时密钥清理也失败，请在 SillyTavern Secrets 中检查。`);
    }
    if (operationError) throw operationError;
    if (cleanupError) {
        throw new Error('连接已完成，但临时密钥清理失败，请在 SillyTavern Secrets 中检查。');
    }
    return {
        result,
        usedTemporarySecret: Boolean(temporarySecretId),
    };
}

export function captureMainConnectionIdentity(context) {
    return {
        mainApi: context?.mainApi ?? null,
        onlineStatus: context?.onlineStatus ?? null,
        chatCompletionSource: context?.chatCompletionSettings?.chat_completion_source ?? null,
    };
}

function sameConnectionIdentity(before, after) {
    return before.mainApi === after.mainApi
        && before.onlineStatus === after.onlineStatus
        && before.chatCompletionSource === after.chatCompletionSource;
}

function assertMainConnectionUnchanged(context, before) {
    const after = captureMainConnectionIdentity(context);
    if (!sameConnectionIdentity(before, after)) {
        throw new Error('插件 API 操作前后 SillyTavern 当前连接发生变化。');
    }
}

export function getSecondaryApiPresetState(context, options) {
    const { secondary, migrated } = ensurePresetState(context, options);
    const active = secondary.presets.find(item => item.id === secondary.activePresetId) ?? null;
    return {
        activePresetId: secondary.activePresetId,
        activePreset: clonePreset(active),
        presets: secondary.presets.map(clonePreset),
        migrated,
    };
}

export function selectSecondaryApiPreset({ context, presetId }) {
    const { secondary } = ensurePresetState(context);
    const preset = requirePreset(secondary, presetId);
    secondary.activePresetId = preset.id;
    syncLegacyActiveFields(secondary);
    saveGlobalSettings(context);
    return clonePreset(preset);
}

export async function saveSecondaryApiScheme({
    context,
    presetId = null,
    sourcePresetId = null,
    name,
    endpoint,
    model = '',
    apiKey = '',
    idFactory = createPresetId,
    fetchImpl = globalThis.fetch,
}) {
    const { secondary } = ensurePresetState(context, { idFactory });
    const existing = findPreset(secondary, presetId);
    if (presetId && !existing) throw new TypeError('要更新的插件 API 方案不存在。');
    const source = findPreset(secondary, sourcePresetId);
    const normalized = {
        name: normalizePresetName(name),
        endpoint: normalizeEndpoint(endpoint),
        model: normalizeModel(model, { required: false }),
    };
    const enteredKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    const inheritedSecretId = existing?.secretId ?? source?.secretId ?? null;
    const staleSecretId = existing?.secretId ?? null;
    const secretId = enteredKey
        ? await writeCustomSecret({
            value: enteredKey,
            label: `兰台：${normalized.name}`,
            headers: getRequestHeaders(context),
            fetchImpl,
        })
        : inheritedSecretId;

    let preset = existing;
    if (preset) {
        Object.assign(preset, normalized, { secretId });
    } else {
        preset = {
            id: idFactory(),
            ...normalized,
            secretId,
        };
        secondary.presets.push(preset);
    }
    secondary.activePresetId = preset.id;
    syncLegacyActiveFields(secondary);
    saveGlobalSettings(context);

    let staleSecretDeleteFailed = false;
    if (
        staleSecretId
        && staleSecretId !== secretId
        && !secondary.presets.some(item => item.secretId === staleSecretId)
    ) {
        try {
            await deleteCustomSecret({
                id: staleSecretId,
                headers: getRequestHeaders(context),
                fetchImpl,
            });
        } catch {
            staleSecretDeleteFailed = true;
        }
    }
    return {
        preset: clonePreset(preset),
        staleSecretDeleteFailed,
    };
}

export async function fetchSecondaryApiPresetModels({
    context,
    presetId = null,
    endpoint,
    apiKey = '',
    fetchImpl = globalThis.fetch,
    signal,
}) {
    const { secondary } = ensurePresetState(context);
    const preset = findPreset(secondary, presetId);
    const effectiveEndpoint = endpoint ?? preset?.endpoint ?? '';

    const before = captureMainConnectionIdentity(context);
    let operation;
    try {
        operation = await runWithDraftSecret({
            context,
            preset,
            apiKey,
            fetchImpl,
            operation: secretId => probeCustomOpenAIConnection({
                endpoint: effectiveEndpoint,
                secretId,
                headers: getRequestHeaders(context),
                fetchImpl,
                signal,
            }),
        });
    } finally {
        assertMainConnectionUnchanged(context, before);
    }
    return {
        models: [...new Set(operation.result.models)].sort((a, b) => a.localeCompare(b)),
        usedTemporarySecret: operation.usedTemporarySecret,
        mainConnectionUnchanged: true,
    };
}

export async function runSecondaryApiGenerationProbe({
    context,
    presetId = null,
    endpoint,
    model,
    apiKey = '',
    fetchImpl = globalThis.fetch,
    signal,
}) {
    const { secondary } = ensurePresetState(context);
    const preset = findPreset(secondary, presetId ?? secondary.activePresetId);
    const effectiveEndpoint = endpoint ?? preset?.endpoint ?? '';
    const effectiveModel = normalizeModel(model ?? preset?.model ?? '');

    const before = captureMainConnectionIdentity(context);
    let operation;
    try {
        operation = await runWithDraftSecret({
            context,
            preset,
            apiKey,
            fetchImpl,
            operation: secretId => probeCustomOpenAIGeneration({
                endpoint: effectiveEndpoint,
                model: effectiveModel,
                secretId,
                headers: getRequestHeaders(context),
                fetchImpl,
                signal,
            }),
        });
    } finally {
        assertMainConnectionUnchanged(context, before);
    }
    return {
        ...operation.result,
        presetId: preset?.id ?? null,
        usedTemporarySecret: operation.usedTemporarySecret,
        mainConnectionUnchanged: true,
    };
}

export async function deleteSecondaryApiPreset({
    context,
    presetId,
    fetchImpl = globalThis.fetch,
}) {
    const { secondary } = ensurePresetState(context);
    const preset = requirePreset(secondary, presetId);
    secondary.presets = secondary.presets.filter(item => item.id !== preset.id);
    if (secondary.activePresetId === preset.id) {
        secondary.activePresetId = secondary.presets[0]?.id ?? null;
    }
    syncLegacyActiveFields(secondary);
    saveGlobalSettings(context);
    let secretDeleteFailed = false;
    const secretStillReferenced = preset.secretId
        && secondary.presets.some(item => item.secretId === preset.secretId);
    if (preset.secretId && !secretStillReferenced) {
        try {
            await deleteCustomSecret({
                id: preset.secretId,
                headers: getRequestHeaders(context),
                fetchImpl,
            });
        } catch {
            secretDeleteFailed = true;
        }
    }
    return {
        deletedPresetId: preset.id,
        activePresetId: secondary.activePresetId,
        secretDeleteFailed,
    };
}

export {
    ensurePresetState,
    findPreset,
    normalizeModel,
    normalizePresetName,
    runWithDraftSecret,
    sameConnectionIdentity,
};
