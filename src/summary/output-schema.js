import { SummaryDomainError } from './errors.js';
import { normalizeSummaryCandidate, normalizeSummaryDraft } from './candidate-normalizer.js';

const storyTime = Object.freeze({ type: 'object', additionalProperties: false, required: ['start', 'end'], properties: { start: { type: 'string' }, end: { type: 'string' } } });
const specialDates = Object.freeze({ type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'storyDate', 'reason'], properties: { name: { type: 'string' }, storyDate: { type: 'string' }, reason: { type: 'string' } } } });
const textArray = Object.freeze({ type: 'array', items: { type: 'string' } });

const draftProperties = Object.freeze({ title: { type: 'string' }, storyTime, body: { type: 'string' }, people: textArray, locations: textArray, classificationTags: textArray, specialDateCandidates: specialDates });
const DRAFT_KEYS = Object.freeze(Object.keys(draftProperties));

export const SUMMARY_DRAFT_OUTPUT_JSON_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false, required: ['memories'], properties: {
        memories: { type: 'array', items: { type: 'object', additionalProperties: false, required: DRAFT_KEYS, properties: draftProperties } },
    },
});

export const KEYWORD_OUTPUT_JSON_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false, required: ['indexes'], properties: {
        indexes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['draftId', 'primaryKeywords', 'auxiliaryKeywords'], properties: { draftId: { type: 'string' }, primaryKeywords: textArray, auxiliaryKeywords: textArray } } },
    },
});

export const SUMMARY_OUTPUT_JSON_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false, required: ['memories'], properties: {
        memories: { type: 'array', items: { type: 'object', additionalProperties: false, required: [...DRAFT_KEYS, 'primaryKeywords', 'auxiliaryKeywords'], properties: { ...draftProperties, primaryKeywords: textArray, auxiliaryKeywords: textArray } } },
    },
});

function assertFixedKeys(value, expectedKeys, field, memoryIndex) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SummaryDomainError('invalid_summary_schema', '总结结果对象结构无效。', { field, memoryIndex });
    const actual = Object.keys(value); const expected = new Set(expectedKeys);
    const missingKeys = expectedKeys.filter(key => !Object.hasOwn(value, key)); const extraKeys = actual.filter(key => !expected.has(key));
    if (missingKeys.length || extraKeys.length) throw new SummaryDomainError('invalid_summary_schema', '总结结果不符合固定字段结构。', { field, memoryIndex, missingKeys, extraKeys });
}

function requireNonEmptyArray(value, field) {
    assertFixedKeys(value, [field], 'root');
    if (!Array.isArray(value[field])) throw new SummaryDomainError('invalid_summary_schema', `总结结果根对象必须包含 ${field} 数组。`);
    if (!value[field].length) throw new SummaryDomainError('empty_summary', '总结没有返回可入库的记忆。');
}

export function validateSummaryDraftOutputData(parsed) {
    requireNonEmptyArray(parsed, 'memories');
    return { memories: parsed.memories.map((item, index) => { assertFixedKeys(item, DRAFT_KEYS, 'memory', index); assertFixedKeys(item.storyTime, ['start', 'end'], 'storyTime', index); return normalizeSummaryDraft(item, index); }) };
}

export function validateKeywordOutputData(parsed, { draftIds = [] } = {}) {
    requireNonEmptyArray(parsed, 'indexes');
    const allowed = new Set(draftIds); const seen = new Set();
    const indexes = parsed.indexes.map((item, index) => {
        assertFixedKeys(item, ['draftId', 'primaryKeywords', 'auxiliaryKeywords'], 'keywordIndex', index);
        if (typeof item.draftId !== 'string' || !item.draftId.trim() || (allowed.size && !allowed.has(item.draftId.trim())) || seen.has(item.draftId.trim())) {
            throw new SummaryDomainError('invalid_keyword_mapping', '关键词结果包含未知或重复的草稿 ID。', { memoryIndex: index, draftId: item.draftId });
        }
        seen.add(item.draftId.trim());
        const normalized = normalizeSummaryCandidate({ title: '_', storyTime: { start: '_', end: '_' }, body: '_', people: [], locations: [], classificationTags: [], specialDateCandidates: [], primaryKeywords: item.primaryKeywords, auxiliaryKeywords: item.auxiliaryKeywords }, index);
        return { draftId: item.draftId.trim(), primaryKeywords: normalized.primaryKeywords, auxiliaryKeywords: normalized.auxiliaryKeywords };
    });
    if (allowed.size && (indexes.length !== allowed.size || [...allowed].some(id => !seen.has(id)))) throw new SummaryDomainError('invalid_keyword_mapping', '关键词结果没有覆盖全部草稿 ID。');
    return { indexes };
}

export function validateSummaryOutputData(parsed) {
    requireNonEmptyArray(parsed, 'memories');
    const keys = [...DRAFT_KEYS, 'primaryKeywords', 'auxiliaryKeywords'];
    return { memories: parsed.memories.map((item, index) => { assertFixedKeys(item, keys, 'memory', index); assertFixedKeys(item.storyTime, ['start', 'end'], 'storyTime', index); return normalizeSummaryCandidate(item, index); }) };
}

export function parseStrictSummaryOutput(raw, options = {}) {
    if (typeof raw !== 'string') throw new SummaryDomainError('invalid_summary_json', '总结结果不是 JSON 文本。');
    let parsed; try { parsed = JSON.parse(raw.trim().replace(/^\uFEFF/, '').trim()); } catch (cause) { throw new SummaryDomainError('invalid_summary_json', '总结结果必须只包含一个完整 JSON 对象。', { cause }); }
    return validateSummaryOutputData(parsed, options);
}
