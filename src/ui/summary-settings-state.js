import { cloneJson, createStableId } from '../storage/schema-utils.js';
import {
    createDefaultSummaryPromptScheme,
    createDefaultKeywordPromptScheme,
    DEFAULT_KEYWORD_PROMPT_SCHEME_ID,
    DEFAULT_SUMMARY_PROMPT_SCHEME_ID,
    normalizeSummaryPromptScheme,
    restoreDefaultSummaryPromptScheme,
    restoreDefaultKeywordPromptScheme,
} from '../summary/prompt-scheme.js';
import { DEFAULT_SUMMARY_CLEANING_RULES, normalizeSummaryCleaningRule } from '../summary/source-cleaning.js';
import {
    getDefaultPromptText,
    getPromptTextDefinition,
    normalizePromptOverrides,
    normalizeCustomSummaryPrompts,
    promptTextForEditor,
    promptTextStatus,
} from '../prompts/prompt-customization.js';
import {
    defaultEventLibrary,
    configuredEventLibrary,
    normalizeEventLibrary,
} from '../prompts/event-library.js';

export function createSummaryPromptDraft(scheme) {
    return cloneJson(scheme ?? createDefaultSummaryPromptScheme());
}

export function createBlankSummaryPromptScheme({ idFactory = () => createStableId('summary-scheme') } = {}) {
    return {
        id: idFactory(),
        name: '新总结方案',
        blocks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export function duplicateSummaryPromptScheme(scheme, {
    idFactory = () => createStableId('summary-scheme'),
    blockIdFactory = () => createStableId('summary-block'),
} = {}) {
    const copy = createSummaryPromptDraft(scheme);
    copy.id = idFactory();
    copy.name = `${copy.name || '总结方案'} 副本`;
    copy.blocks = copy.blocks.map(block => ({ ...block, id: blockIdFactory() }));
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    return copy;
}

export function saveSummaryPromptScheme(schemes, draft, options) {
    const normalized = normalizeSummaryPromptScheme(draft, options);
    const next = cloneJson(Array.isArray(schemes) ? schemes : []);
    const index = next.findIndex(item => item?.id === normalized.id);
    if (index >= 0) next[index] = normalized;
    else next.push(normalized);
    return next;
}

export function deleteSummaryPromptScheme(schemes, id) {
    const source = cloneJson(Array.isArray(schemes) ? schemes : []);
    if (source.length <= 1) throw new Error('至少保留一个总结提示词方案。');
    const next = source.filter(item => item?.id !== id);
    if (next.length === source.length) throw new Error('找不到要删除的总结提示词方案。');
    return next;
}

export function restoreBuiltInSummaryPromptScheme(schemes, options) {
    return restoreDefaultSummaryPromptScheme(schemes, options);
}

export function restoreBuiltInKeywordPromptScheme(schemes, options) {
    return restoreDefaultKeywordPromptScheme(schemes, options);
}

export function createKeywordPromptDraft(scheme) {
    return cloneJson(scheme ?? createDefaultKeywordPromptScheme());
}

export function nextActiveSummaryPromptSchemeId(schemes, preferredId = '') {
    const ids = (Array.isArray(schemes) ? schemes : []).map(item => item?.id).filter(Boolean);
    if (ids.includes(preferredId)) return preferredId;
    if (ids.includes(DEFAULT_SUMMARY_PROMPT_SCHEME_ID)) return DEFAULT_SUMMARY_PROMPT_SCHEME_ID;
    return ids[0] ?? '';
}

export function nextActiveKeywordPromptSchemeId(schemes, preferredId = '') {
    const ids = (Array.isArray(schemes) ? schemes : []).map(item => item?.id).filter(Boolean);
    if (ids.includes(preferredId)) return preferredId;
    if (ids.includes(DEFAULT_KEYWORD_PROMPT_SCHEME_ID)) return DEFAULT_KEYWORD_PROMPT_SCHEME_ID;
    return ids[0] ?? '';
}

export function createSummaryCleaningDraft(rules) {
    return cloneJson(Array.isArray(rules) ? rules : DEFAULT_SUMMARY_CLEANING_RULES);
}

export function validateSummaryCleaningDraft(rules) {
    return (Array.isArray(rules) ? rules : []).map(rule => ({
        ...normalizeSummaryCleaningRule(rule),
        enabled: rule?.enabled !== false,
    }));
}

export function restoreDefaultSummaryCleaningRules() {
    return cloneJson(DEFAULT_SUMMARY_CLEANING_RULES);
}

export function createSummaryPromptTextDraft(summary, key) {
    getPromptTextDefinition(key);
    return {
        key,
        value: promptTextForEditor(summary, key),
        useDefault: promptTextStatus(summary, key) === 'default',
    };
}

export function restoreSummaryPromptTextDraft(draft) {
    return { key: draft.key, value: getDefaultPromptText(draft.key), useDefault: true };
}

export function applySummaryPromptTextDraft(summary, draft) {
    getPromptTextDefinition(draft?.key);
    const value = typeof draft?.value === 'string' ? draft.value : '';
    if (!value.trim()) throw new Error('完整提示词不能为空。');
    const next = cloneJson(summary ?? {});
    next.promptOverrides = normalizePromptOverrides(next.promptOverrides);
    next.promptOverrides[draft.key] = draft.useDefault ? null : value;
    return next;
}

export function createSummaryCustomPromptDraft(item = null, {
    idFactory = () => createStableId('summary-custom-prompt'),
} = {}) {
    return item ? {
        id: item.id,
        name: item.name,
        content: item.content,
        position: item.position === 'after' ? 'after' : 'before',
    } : {
        id: idFactory(),
        name: '',
        content: '',
        position: 'before',
    };
}

export function applySummaryCustomPromptDraft(summary, draft) {
    const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
    const content = typeof draft?.content === 'string' ? draft.content : '';
    const id = typeof draft?.id === 'string' ? draft.id.trim() : '';
    if (!id) throw new Error('自定义提示词标识不可用。');
    if (!name) throw new Error('请填写自定义名称。');
    if (!content.trim()) throw new Error('请填写自定义提示词。');
    const next = cloneJson(summary ?? {});
    next.promptOverrides = normalizePromptOverrides(next.promptOverrides);
    const customPrompts = normalizeCustomSummaryPrompts(next.promptOverrides.customPrompts);
    const item = { id, name, content, position: draft.position === 'after' ? 'after' : 'before' };
    const index = customPrompts.findIndex(entry => entry.id === id);
    if (index >= 0) customPrompts[index] = item;
    else customPrompts.push(item);
    next.promptOverrides.customPrompts = customPrompts;
    return next;
}

export function deleteSummaryCustomPrompt(summary, id) {
    const next = cloneJson(summary ?? {});
    next.promptOverrides = normalizePromptOverrides(next.promptOverrides);
    next.promptOverrides.customPrompts = next.promptOverrides.customPrompts.filter(item => item.id !== id);
    return next;
}

export function createSummaryEventLibraryDraft(summary) {
    return {
        entries: configuredEventLibrary(summary),
        useDefault: summary?.eventLibraryOverride === null || summary?.eventLibraryOverride === undefined,
    };
}

export function restoreSummaryEventLibraryDraft() {
    return { entries: defaultEventLibrary(), useDefault: true };
}

export function applySummaryEventLibraryDraft(summary, draft) {
    const entries = normalizeEventLibrary(draft?.entries);
    const next = cloneJson(summary ?? {});
    next.eventLibraryOverride = draft?.useDefault === true ? null : entries;
    return next;
}

export function applyEventLibrarySelection(draft, indices, action) {
    if (!['enable', 'disable', 'delete'].includes(action)) throw new Error('未知的词库操作。');
    const selected = new Set(indices);
    if ([...selected].some(i => !Number.isInteger(i) || i < 0 || i >= draft.entries.length)) throw new Error('选择的事件词已变化。');
    const next = cloneJson(draft);
    next.useDefault = false;
    next.entries = next.entries.flatMap((entry, i) => {
        if (!selected.has(i)) return [entry];
        if (action === 'delete') return [];
        if (action === 'disable') entry.enabled = false;
        else delete entry.enabled;
        return [entry];
    });
    return next;
}

export function requiresFastModeConfirmation(summary, nextMode) {
    return nextMode === 'fast'
        && summary?.generationMode !== 'fast'
        && summary?.fastModeWarningAcknowledged !== true;
}

export function applySummaryGenerationMode(summary, nextMode) {
    if (!['quality', 'fast', 'enhanced'].includes(nextMode)) throw new TypeError('未知的总结生成模式。');
    const next = cloneJson(summary ?? {});
    next.generationMode = nextMode;
    if (nextMode === 'fast') next.fastModeWarningAcknowledged = true;
    return next;
}

export async function persistSummarySettings({ getGlobalSettings, saveGlobalSettings, nextSummary }) {
    if (typeof getGlobalSettings !== 'function' || typeof saveGlobalSettings !== 'function') {
        throw new TypeError('总结设置持久化入口不可用。');
    }
    const settings = getGlobalSettings();
    const previous = cloneJson(settings.summary);
    const hadUpdatedAt = Object.hasOwn(settings, 'updatedAt');
    const previousUpdatedAt = settings.updatedAt;
    settings.summary = cloneJson(nextSummary);
    try {
        await saveGlobalSettings();
        return cloneJson(settings.summary);
    } catch (error) {
        settings.summary = previous;
        if (hadUpdatedAt) settings.updatedAt = previousUpdatedAt;
        else delete settings.updatedAt;
        throw error;
    }
}
