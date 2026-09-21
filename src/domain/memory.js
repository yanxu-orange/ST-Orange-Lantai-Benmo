import { createStableId, isoNow } from '../storage/schema-utils.js';
import { parseStoryTimePoint } from './story-time.js';
import { normalizeAtomicTextList, parseDelimitedTextList } from './text-list.js';
import { normalizeMemoryDetailAliases } from './detail-aliases.js';

export const MEMORY_MODES = Object.freeze(['resident', 'trigger']);
export const MEMORY_SOURCE_TYPES = Object.freeze(['manual', 'manual-summary', 'auto-summary', 'external', 'merge']);

export function isActiveMemory(memory) {
    return Boolean(memory && typeof memory === 'object' && !memory.supersededBy);
}

function normalizeMemoryRelationIds(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.flatMap(item => {
        const id = typeof item === 'string' ? item.trim() : '';
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [id];
    });
}

const LEGACY_MEMORY_TEXT_LIST_POLICY = Object.freeze({
    delimiters: Object.freeze([',', '，', '、', ';', '；', '\r\n', '\n', '\r']),
});

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTextList(value) {
    const values = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const result = [];
    for (const item of values.flatMap(entry => String(entry ?? '').split(/[，,、；;\r\n]+/))) {
        const text = cleanText(item);
        const key = text.toLocaleLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

/**
 * Transitional Memory Domain boundary. Structured arrays are atomic; strings
 * retain the delimiter behavior required by callers that have not migrated.
 */
export function normalizeMemoryTextListInput(value) {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return normalizeAtomicTextList(value);
    if (typeof value === 'string') return parseDelimitedTextList(value, LEGACY_MEMORY_TEXT_LIST_POLICY);
    throw new TypeError('Memory 列表输入必须是数组、字符串或空值。');
}

export function normalizeMemoryFloorRanges(value) {
    const source = Array.isArray(value?.[0]) ? value : [value];
    if (!source.length) return null;
    const ranges = [];
    for (const range of source) {
        if (!Array.isArray(range) || range.length < 1) return null;
        const startText = String(range[0] ?? '').trim();
        const endText = String(range[1] ?? '').trim() || startText;
        if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText)) return null;
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
        ranges.push([start, end]);
    }
    if (!ranges.length) return null;
    return ranges.length === 1 ? ranges[0] : ranges;
}

function normalizeTimePoint(value, fallbackRaw = '', { fictionalCalendar = {} } = {}) {
    const source = value && typeof value === 'object' ? value : { raw: value };
    const raw = cleanText(source.raw) || fallbackRaw;
    if (source.status !== 'parsed') return parseStoryTimePoint(raw, { fictionalCalendar });
    return {
        raw,
        status: source.status === 'parsed' ? 'parsed' : 'pending',
        value: source.status === 'parsed' && source.value && typeof source.value === 'object'
            ? structuredClone(source.value)
            : null,
        sortKey: source.status === 'parsed' && typeof source.sortKey === 'string'
            ? source.sortKey
            : null,
    };
}

export function validateMemoryInput(input) {
    const errors = {};
    if (!MEMORY_MODES.includes(input?.mode)) errors.mode = '请选择常驻记忆或触发记忆。';
    const summarySource = ['manual-summary', 'auto-summary'].includes(input?.source?.type);
    if (!summarySource && !cleanText(input?.time?.start?.raw ?? input?.startTime)) errors.startTime = '请填写故事时间。';
    if (!normalizeMemoryFloorRanges(input?.source?.floorRange)) errors.sourceFloorRanges = '请填写有效的来源楼层。';
    if (!cleanText(input?.body)) errors.body = '请填写记忆正文。';
    return errors;
}

export function createMemory(input, {
    now,
    idFactory = () => createStableId('memory'),
    fictionalCalendar = {},
} = {}) {
    const errors = validateMemoryInput(input);
    if (Object.keys(errors).length) {
        const error = new Error('记忆内容尚未填写完整。');
        error.code = 'MEMORY_VALIDATION_FAILED';
        error.fields = errors;
        throw error;
    }

    const at = isoNow(now);
    const startRaw = cleanText(input?.time?.start?.raw ?? input?.startTime);
    const summarySource = ['manual-summary', 'auto-summary'].includes(input?.source?.type);
    const endRaw = cleanText(input?.time?.end?.raw ?? input?.endTime) || (summarySource ? '' : startRaw);
    const detailKeywords = normalizeMemoryTextListInput(input?.keywords?.detail ?? input.detailKeywords);
    const detailAliases = normalizeMemoryDetailAliases(
        input?.keywords?.detailAliases ?? input.detailAliases,
        detailKeywords,
    );
    const hasDetailAliases = Object.hasOwn(input?.keywords ?? {}, 'detailAliases') || Object.hasOwn(input ?? {}, 'detailAliases');
    const mergedFrom = normalizeMemoryRelationIds(input?.mergedFrom);
    const supersededBy = typeof input?.supersededBy === 'string' && input.supersededBy.trim()
        ? input.supersededBy.trim()
        : null;
    return {
        id: idFactory(),
        mode: input.mode,
        title: cleanText(input.title),
        time: {
            start: normalizeTimePoint(input?.time?.start ?? input?.startTime, '', { fictionalCalendar }),
            end: normalizeTimePoint(input?.time?.end ?? input?.endTime, endRaw, { fictionalCalendar }),
        },
        body: cleanText(input.body),
        people: normalizeMemoryTextListInput(input.people),
        locations: normalizeMemoryTextListInput(input.locations),
        keywords: {
            event: normalizeMemoryTextListInput(input?.keywords?.event ?? input.eventKeywords),
            detail: detailKeywords,
            ...(hasDetailAliases ? { detailAliases } : {}),
            primary: normalizeMemoryTextListInput(input?.keywords?.primary ?? input.primaryKeywords),
            auxiliary: normalizeMemoryTextListInput(input?.keywords?.auxiliary ?? input.auxiliaryKeywords),
        },
        source: {
            type: MEMORY_SOURCE_TYPES.includes(input?.source?.type) ? input.source.type : 'manual',
            batchId: input?.source?.batchId ?? null,
            floorRange: normalizeMemoryFloorRanges(input?.source?.floorRange),
            externalId: input?.source?.externalId ?? null,
            batchOrdinal: Number.isSafeInteger(input?.source?.batchOrdinal) ? input.source.batchOrdinal : null,
            itemOrdinal: Number.isSafeInteger(input?.source?.itemOrdinal) ? input.source.itemOrdinal : null,
            eventOrdinal: Number.isSafeInteger(input?.source?.eventOrdinal) && input.source.eventOrdinal > 0
                ? input.source.eventOrdinal
                : null,
            matchedResidentTags: normalizeMemoryTextListInput(input?.source?.matchedResidentTags),
        },
        ...(mergedFrom.length ? { mergedFrom } : {}),
        ...(supersededBy ? { supersededBy } : {}),
        createdAt: at,
        updatedAt: at,
    };
}

export function updateMemory(existing, patch, { now, fictionalCalendar = {} } = {}) {
    if (!existing || typeof existing !== 'object') throw new Error('找不到要编辑的记忆。');
    const hasRawTimePatch = Object.hasOwn(patch, 'startTime') || Object.hasOwn(patch, 'endTime');
    const nextTime = hasRawTimePatch ? {
        start: patch.startTime ?? existing.time?.start?.raw,
        end: patch.endTime ?? existing.time?.end?.raw,
    } : (patch.time ?? existing.time);
    const keywordPatch = patch?.keywords && typeof patch.keywords === 'object'
        ? patch.keywords
        : {};
    const nextKeywords = {
        event: Object.hasOwn(patch, 'eventKeywords')
            ? patch.eventKeywords
            : (Object.hasOwn(keywordPatch, 'event') ? keywordPatch.event : existing.keywords?.event),
        detail: Object.hasOwn(patch, 'detailKeywords')
            ? patch.detailKeywords
            : (Object.hasOwn(keywordPatch, 'detail') ? keywordPatch.detail : existing.keywords?.detail),
        ...((Object.hasOwn(patch, 'detailAliases') || Object.hasOwn(keywordPatch, 'detailAliases')
            || Object.hasOwn(existing.keywords ?? {}, 'detailAliases')) ? {
            detailAliases: Object.hasOwn(patch, 'detailAliases')
                ? patch.detailAliases
                : (Object.hasOwn(keywordPatch, 'detailAliases') ? keywordPatch.detailAliases : existing.keywords?.detailAliases),
        } : {}),
        primary: Object.hasOwn(patch, 'primaryKeywords')
            ? patch.primaryKeywords
            : (Object.hasOwn(keywordPatch, 'primary') ? keywordPatch.primary : existing.keywords?.primary),
        auxiliary: Object.hasOwn(patch, 'auxiliaryKeywords')
            ? patch.auxiliaryKeywords
            : (Object.hasOwn(keywordPatch, 'auxiliary') ? keywordPatch.auxiliary : existing.keywords?.auxiliary),
    };
    const nextSource = Object.hasOwn(patch, 'source')
        ? { ...(existing.source ?? {}), ...(patch.source ?? {}) }
        : existing.source;
    const candidate = {
        ...existing,
        ...patch,
        time: nextTime,
        keywords: nextKeywords,
        source: nextSource,
    };
    const replacement = createMemory(candidate, {
        now,
        idFactory: () => existing.id,
        fictionalCalendar,
    });
    replacement.createdAt = existing.createdAt;
    replacement.updatedAt = isoNow(now);
    return replacement;
}

export function memorySearchText(memory) {
    return [
        memory?.title,
        memory?.body,
        ...(memory?.people ?? []),
        ...(memory?.locations ?? []),
        ...(memory?.keywords?.event ?? []),
        ...(memory?.keywords?.detail ?? []),
        ...(memory?.keywords?.primary ?? []),
        ...(memory?.keywords?.auxiliary ?? []),
    ].filter(Boolean).join('\n').toLocaleLowerCase();
}

export function compareMemoriesByEndTime(a, b) {
    const aKey = a?.time?.end?.sortKey || a?.time?.end?.raw || a?.createdAt || '';
    const bKey = b?.time?.end?.sortKey || b?.time?.end?.raw || b?.createdAt || '';
    const byTime = String(bKey).localeCompare(String(aKey), 'zh-Hans-CN', { numeric: true });
    return byTime || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}
