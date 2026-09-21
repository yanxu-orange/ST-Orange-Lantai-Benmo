import { SummaryDomainError } from '../summary/errors.js';
import { normalizeSummaryDraft } from '../summary/candidate-normalizer.js';
import { getPromptSchema } from './prompt-registry.js';
import { inspectMemoryDetailAliases } from '../domain/detail-aliases.js';

const SCHEMA_IDS = Object.freeze({
    quality_stage_a: 'schema.quality_a',
    quality_stage_b: 'schema.quality_b',
    quality_keywords_only: 'schema.quality_keywords_only',
    quality_stage_c: 'schema.quality_c',
    fast: 'schema.fast',
    merge: 'schema.merge',
});

function fail(message, details = {}) {
    throw new SummaryDomainError('invalid_summary_schema', message, details);
}

function validateSchemaValue(value, schema, path = 'root') {
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('总结结果对象结构无效。', { field: path });
        const required = schema.required ?? [];
        const missingKeys = required.filter(key => !Object.hasOwn(value, key));
        const known = new Set(Object.keys(schema.properties ?? {}));
        const extraKeys = schema.additionalProperties === false
            ? Object.keys(value).filter(key => !known.has(key))
            : [];
        if (missingKeys.length || extraKeys.length) fail('总结结果不符合固定字段结构。', { field: path, missingKeys, extraKeys });
        for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(value, key)) validateSchemaValue(value[key], childSchema, `${path}.${key}`);
        }
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value)) fail('总结结果数组字段无效。', { field: path });
        if (Number.isSafeInteger(schema.minItems) && value.length < schema.minItems) {
            throw new SummaryDomainError('empty_summary', '总结没有返回可入库的记忆。', { field: path });
        }
        if (Number.isSafeInteger(schema.maxItems) && value.length > schema.maxItems) fail('总结结果数组超出允许数量。', { field: path });
        value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`));
        return;
    }
    if (schema.type === 'string') {
        if (typeof value !== 'string') fail('总结结果文本字段无效。', { field: path });
        if (Number.isSafeInteger(schema.minLength) && value.length < schema.minLength) fail('总结结果文本字段为空。', { field: path });
    }
}

function normalizeTextArray(value) {
    const seen = new Set();
    return value.map(item => item.trim()).filter(item => {
        const key = item.toLocaleLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function allowedEventNames(value) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        fail('事件关键词允许列表无效。', { field: 'validationOptions.allowedEventKeywordNames' });
    }
    return new Set(value.map(item => item.trim()).filter(Boolean));
}

function validateEventKeywords(value, allowed, index) {
    const normalized = normalizeTextArray(value);
    const unknown = normalized.filter(item => !allowed.has(item));
    if (unknown.length) {
        throw new SummaryDomainError('invalid_event_keyword', '事件关键词不在当前运行时允许列表中。', {
            memoryIndex: index,
            unknownEventKeywords: unknown,
        });
    }
    return normalized;
}

function validateDraftIds(indexes, draftIds, allowed) {
    const expected = new Set(draftIds);
    const seen = new Set();
    const normalized = indexes.map((item, index) => {
        const draftId = item.draftId.trim();
        if (!draftId || (expected.size && !expected.has(draftId)) || seen.has(draftId)) {
            throw new SummaryDomainError('invalid_keyword_mapping', '关键词结果包含未知或重复的草稿 ID。', { memoryIndex: index, draftId });
        }
        seen.add(draftId);
        const detailKeywords = normalizeTextArray(item.detailKeywords);
        const hasDetailAliases = Object.hasOwn(item, 'detailAliases');
        const detailAliases = inspectMemoryDetailAliases(item.detailAliases, detailKeywords);
        return {
            draftId,
            eventKeywords: validateEventKeywords(item.eventKeywords, allowed, index),
            detailKeywords,
            ...(hasDetailAliases ? {
                detailAliases: detailAliases.value,
                detailAliasDiagnostics: detailAliases.diagnostics,
            } : {}),
        };
    });
    if (expected.size && (normalized.length !== expected.size || [...expected].some(id => !seen.has(id)))) {
        throw new SummaryDomainError('invalid_keyword_mapping', '关键词结果没有覆盖全部草稿 ID。');
    }
    return normalized;
}

function validateAliasIndexes(indexes, draftIds, drafts) {
    if (!Array.isArray(drafts) || !drafts.length) fail('通称验证缺少冻结关键词。');
    const frozen = new Map();
    for (const draft of drafts) {
        if (!draft || typeof draft.draftId !== 'string' || !draft.draftId.trim()
            || !Array.isArray(draft.detailKeywords) || draft.detailKeywords.some(word => typeof word !== 'string')
            || frozen.has(draft.draftId)) fail('通称验证的冻结关键词无效。');
        frozen.set(draft.draftId, draft.detailKeywords);
    }
    const expected = new Set(draftIds.length ? draftIds : frozen.keys());
    if (expected.size !== frozen.size || [...expected].some(id => !frozen.has(id))) fail('通称验证的冻结 ID 不一致。');
    const seen = new Set();
    const normalized = indexes.map(item => {
        const id = item.draftId;
        if (!expected.has(id) || seen.has(id)) throw new SummaryDomainError('invalid_alias_mapping', '通称结果包含未知或重复的草稿 ID。');
        seen.add(id);
        const details = frozen.get(id);
        if (item.detailAliases.some(binding => !details.includes(binding.parentDetail))) {
            throw new SummaryDomainError('invalid_alias_mapping', '通称父词不属于对应草稿的冻结关键词。');
        }
        const inspected = inspectMemoryDetailAliases(item.detailAliases, details);
        return { draftId: id, detailAliases: inspected.value, detailAliasDiagnostics: inspected.diagnostics };
    });
    if (seen.size !== expected.size) throw new SummaryDomainError('invalid_alias_mapping', '通称结果没有覆盖全部草稿 ID。');
    return normalized;
}

export function validatePromptTaskOutput(task, parsed, { draftIds = [], drafts = [], allowedEventKeywordNames = [] } = {}) {
    const schemaId = SCHEMA_IDS[task];
    if (!schemaId) throw new TypeError(`未知 Prompt task：${String(task)}`);
    validateSchemaValue(parsed, getPromptSchema(schemaId));
    if (task === 'merge') return {
        title: parsed.title.trim(),
        body: parsed.body.trim(),
        coherenceWarning: parsed.coherenceWarning.trim(),
    };
    if (task === 'quality_stage_c') return { indexes: validateAliasIndexes(parsed.indexes, draftIds, drafts) };
    if (['quality_stage_b', 'quality_keywords_only'].includes(task)) {
        return { indexes: validateDraftIds(parsed.indexes, draftIds, allowedEventNames(allowedEventKeywordNames)) };
    }
    const allowed = task === 'fast' ? allowedEventNames(allowedEventKeywordNames) : null;
    const memories = parsed.memories.map((item, index) => {
        const draft = normalizeSummaryDraft(item, index);
        return {
            ...draft,
            eventKeywords: task === 'fast' ? validateEventKeywords(draft.eventKeywords, allowed, index) : [],
            detailKeywords: task === 'fast' ? draft.detailKeywords : [],
            primaryKeywords: [],
            auxiliaryKeywords: [],
        };
    });
    return { memories };
}
