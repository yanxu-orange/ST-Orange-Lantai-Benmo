import { SummaryDomainError } from './errors.js';
import { normalizeAtomicTextList } from '../domain/text-list.js';
import { inspectMemoryDetailAliases } from '../domain/detail-aliases.js';

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function requireString(value, field, index) {
    if (typeof value !== 'string') {
        throw new SummaryDomainError('invalid_summary_schema', '总结结果字段类型无效。', { field, memoryIndex: index });
    }
    return value.trim();
}

function normalizeTextArray(value, field, index, { required = false } = {}) {
    if (!Array.isArray(value)) {
        if (!required && value === undefined) return [];
        throw new SummaryDomainError('invalid_summary_schema', '总结结果数组字段无效。', { field, memoryIndex: index });
    }
    if (value.some(item => typeof item !== 'string')) {
        throw new SummaryDomainError('invalid_summary_schema', '总结结果数组只能包含文本。', { field, memoryIndex: index });
    }
    return normalizeAtomicTextList(value);
}

function normalizeSpecialDates(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const allowedKeys = new Set(['name', 'storyDate', 'reason']);
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const keys = Object.keys(item);
        if (keys.length !== allowedKeys.size || keys.some(key => !allowedKeys.has(key))) continue;
        const name = cleanText(item.name);
        const storyDate = cleanText(item.storyDate);
        const reason = cleanText(item.reason);
        if (!name || !storyDate || !reason) continue;
        result.push({ name, storyDate, reason });
    }
    return result;
}

function normalizeEventOrdinal(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function normalizeSummaryDraft(candidate, index) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new SummaryDomainError('invalid_summary_schema', '记忆候选必须是对象。', { memoryIndex: index });
    }
    if (!candidate.storyTime || typeof candidate.storyTime !== 'object' || Array.isArray(candidate.storyTime)) {
        throw new SummaryDomainError('invalid_summary_schema', '记忆候选缺少故事时间对象。', { field: 'storyTime', memoryIndex: index });
    }
    const start = requireString(candidate.storyTime.start, 'storyTime.start', index);
    const end = candidate.storyTime.end === undefined
        ? ''
        : requireString(candidate.storyTime.end, 'storyTime.end', index);
    const body = requireString(candidate.body, 'body', index);
    const title = candidate.title === undefined ? '' : requireString(candidate.title, 'title', index);
    if (!body) {
        throw new SummaryDomainError('invalid_summary_candidate', '记忆候选缺少必填内容。', {
            memoryIndex: index,
            fields: {
                body: !body,
            },
        });
    }
    normalizeTextArray(candidate.classificationTags, 'classificationTags', index);
    const detailKeywords = normalizeTextArray(candidate.detailKeywords, 'detailKeywords', index);
    const hasDetailAliases = Object.hasOwn(candidate, 'detailAliases');
    const inheritedAliasDiagnostics = Array.isArray(candidate.detailAliasDiagnostics)
        ? candidate.detailAliasDiagnostics.filter(item => item && typeof item === 'object' && !Array.isArray(item))
            .map(item => ({ ...item }))
        : [];
    const detailAliases = inspectMemoryDetailAliases(candidate.detailAliases, detailKeywords);
    return {
        title,
        storyTime: { start, end },
        body,
        people: normalizeTextArray(candidate.people, 'people', index),
        locations: normalizeTextArray(candidate.locations, 'locations', index),
        eventKeywords: normalizeTextArray(candidate.eventKeywords, 'eventKeywords', index),
        detailKeywords,
        ...(hasDetailAliases ? {
            detailAliases: detailAliases.value,
            detailAliasDiagnostics: [...inheritedAliasDiagnostics, ...detailAliases.diagnostics],
        } : {}),
        eventOrdinal: normalizeEventOrdinal(candidate.eventOrdinal),
        // Phase 1 always creates trigger memories. Tag-based classification is
        // deliberately deferred and model-supplied tags cannot activate it.
        classificationTags: [],
        specialDateCandidates: normalizeSpecialDates(candidate.specialDateCandidates),
    };
}

export function normalizeSummaryKeywordDraft(candidate, index) {
    const draft = normalizeSummaryDraft(candidate, index);
    const primaryKeywords = normalizeTextArray(candidate.primaryKeywords, 'primaryKeywords', index, { required: true });
    const auxiliaryKeywords = normalizeTextArray(candidate.auxiliaryKeywords, 'auxiliaryKeywords', index, { required: true });
    return { ...draft, primaryKeywords, auxiliaryKeywords };
}

export function normalizeSummaryCandidate(candidate, index) {
    return normalizeSummaryKeywordDraft(candidate, index);
}
