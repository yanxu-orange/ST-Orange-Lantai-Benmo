import { AiProviderError, generateProviderJson, taskMessages } from '../ai-provider/provider-service.js';
import { ensureGlobalSettings } from './context.js';
import { getSecondaryApiPresetState } from '../ai-provider/secondary-api-config.js';
import { validateKeywordOutputData, validateSummaryDraftOutputData, validateSummaryOutputData } from '../summary/output-schema.js';
import { validatePromptTaskOutput } from '../prompts/validators.js';
import { cloneJson } from '../storage/schema-utils.js';

const SUMMARY_SCHEMA_NAME = 'tkm_manual_summary';

function applicationMessages(compiled) {
    return compiled.messages.map(({ role, content }) => ({ role, content }));
}

function degradeMessagesToText(messages) {
    return messages.map((message, index) => {
        const role = String(message.role ?? 'user').toUpperCase();
        const content = String(message.content ?? '');
        return `===== ${role} MESSAGE ${index + 1} | ${content.length} chars =====\n${content}\n===== END ${role} MESSAGE ${index + 1} =====`;
    }).join('\n\n');
}

export function wrapSummaryJsonSchema(schema) {
    const value = cloneJson(schema);
    // Local validation deliberately accepts malformed optional alias metadata
    // so it cannot discard a valid summary. Strict API schemas cannot use that
    // permissive {} schema: require a typed array on the wire (empty is valid).
    function typeAliasMetadata(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'object' && Object.hasOwn(node.properties ?? {}, 'detailAliases')) {
            node.properties.detailAliases = {
                type: 'array',
                description: 'Explicit aliases for existing detail keywords; use an empty array when none apply.',
                items: {
                    type: 'object', additionalProperties: false,
                    required: ['parentDetail', 'aliases'],
                    properties: {
                        parentDetail: { type: 'string' },
                        aliases: { type: 'array', items: { type: 'string' } },
                    },
                },
            };
            node.required = [...new Set([...(node.required ?? []), 'detailAliases'])];
        }
        for (const child of Object.values(node.properties ?? {})) typeAliasMetadata(child);
        if (node.items) typeAliasMetadata(node.items);
    }
    typeAliasMetadata(value);
    return {
        name: SUMMARY_SCHEMA_NAME,
        value,
        description: 'Time Keyword Memory manual summary result',
        strict: true,
        returnInvalid: true,
    };
}

function hasConnectedMainStatus(value) {
    if (value === null || value === undefined) return false;
    const status = String(value).trim().toLocaleLowerCase();
    return Boolean(status) && status !== 'no_connection';
}

export function describeSummaryProvider(context) {
    const settings = ensureGlobalSettings(context);
    const source = settings.aiProvider?.source ?? null;
    if (source === 'plugin') {
        const preset = getSecondaryApiPresetState(context).activePreset;
        return {
            source,
            available: Boolean(preset?.endpoint && preset?.model && preset?.secretId),
            roleMode: 'messages',
            assistantPrefillGuaranteed: false,
        };
    }
    return {
        source,
        available: source === 'sillytavern'
            && typeof context?.generateRaw === 'function'
            && hasConnectedMainStatus(context?.onlineStatus),
        roleMode: context?.mainApi === 'openai' ? 'messages' : 'text',
        assistantPrefillGuaranteed: false,
    };
}

export function createSummaryProviderAdapter({ getContext, fetchImpl } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
    return {
        describe() { return describeSummaryProvider(getContext()); },
        onStatusChanged(handler) {
            const context = getContext();
            const eventType = context?.eventTypes?.ONLINE_STATUS_CHANGED;
            if (!eventType || typeof context?.eventSource?.on !== 'function') return false;
            context.eventSource.on(eventType, handler);
            return () => context.eventSource?.off?.(eventType, handler);
        },
        prepare(compiled) {
            const context = getContext();
            const provider = describeSummaryProvider(context);
            const transportMessages = taskMessages('manual-summary', applicationMessages(compiled));
            const previewMessages = transportMessages.map((message, index) => index === 0
                ? {
                    ...message,
                    protected: true,
                    blockId: 'summary-background-task-marker',
                    blockName: '总结任务边界',
                }
                : { ...message });
            if (provider.roleMode === 'text') {
                const prompt = degradeMessagesToText(transportMessages);
                return {
                    provider,
                    messages: [{
                        role: 'user',
                        content: prompt,
                        protected: true,
                        degraded: true,
                        blockId: 'summary-provider-text-transport',
                        blockName: 'AI 来源单文本兼容输入',
                    }],
                    transportMessages: [{ role: 'user', content: prompt }],
                    preparedPrompt: { mode: 'text', prompt },
                    jsonSchema: cloneJson(compiled.jsonSchema),
                    transportJsonSchema: wrapSummaryJsonSchema(compiled.jsonSchema),
                    outputKind: compiled.outputKind ?? 'combined',
                    promptTask: compiled.task ?? null,
                    validationOptions: cloneJson(compiled.validationOptions ?? {}),
                };
            }
            return {
                provider,
                messages: previewMessages,
                transportMessages,
                preparedPrompt: null,
                jsonSchema: cloneJson(compiled.jsonSchema),
                transportJsonSchema: wrapSummaryJsonSchema(compiled.jsonSchema),
                outputKind: compiled.outputKind ?? 'combined',
                promptTask: compiled.task ?? null,
                validationOptions: cloneJson(compiled.validationOptions ?? {}),
            };
        },
        async generate(prepared, { signal } = {}) {
            const context = getContext();
            const currentProvider = describeSummaryProvider(context);
            if (!currentProvider.available) {
                throw new AiProviderError('当前选择的 AI 来源不可用。', {
                    code: 'provider_unavailable',
                    source: 'configuration',
                });
            }
            let normalizedPromptTaskData = null;
            const validate = prepared.promptTask
                ? data => {
                    normalizedPromptTaskData = validatePromptTaskOutput(prepared.promptTask, data, prepared.validationOptions);
                    return normalizedPromptTaskData;
                }
                : prepared.outputKind === 'summary-draft'
                    ? validateSummaryDraftOutputData
                    : prepared.outputKind === 'keyword-index'
                        ? data => validateKeywordOutputData(data, prepared.validationOptions)
                        : validateSummaryOutputData;
            const result = await generateProviderJson({
                context,
                task: 'manual-summary',
                messages: prepared.transportMessages,
                preparedPrompt: prepared.preparedPrompt,
                transportPrepared: true,
                jsonSchema: prepared.transportJsonSchema,
                validate,
                strictJson: true,
                fetchImpl,
                signal,
            });
            return {
                ...result,
                ...(prepared.promptTask ? { data: normalizedPromptTaskData } : {}),
                provider: { ...result.provider, roleMode: currentProvider.roleMode },
            };
        },
    };
}
