import { CHAT_SCHEMA_VERSION, DEFAULT_CHAT_DATA, EXTENSION_KEY } from '../constants.js';
import { parseStoryTimePoint } from '../domain/story-time.js';
import { parseAnniversaryStartYear } from '../domain/anniversary.js';
import { createStableId, isRecord, isoNow, mergePreservingUnknown } from './schema-utils.js';
import { inspectSillyTavernBranchContext } from '../st-adapter/chat-branch.js';
import { normalizeMemoryDetailAliases } from '../domain/detail-aliases.js';
import { inheritSummaryExclusions } from '../summary/exclusions.js';
import { normalizePromptModules } from '../domain/prompt-module.js';
import { normalizeModuleResults } from '../domain/module-results.js';

function chatCaptureCounter(value, modules, results) {
    const stored = Number(value);
    return [...modules, ...results].reduce((max, item) => {
        const match = /^h([1-9][0-9]*)$/.exec(item?.captureTag ?? '');
        return match ? Math.max(max, Number(match[1])) : max;
    }, Number.isSafeInteger(stored) && stored >= 0 ? stored : 0);
}

function migrateChatCaptureTokens(values, initialCounter = 0) {
    const records = Array.isArray(values) ? values : [];
    let counter = chatCaptureCounter(initialCounter, records, []);
    return {
        values: records.map(value => {
            if (!isRecord(value) || !['collect', 'sync'].includes(value.lifecycle)) return value;
            if (/^h[1-9][0-9]*$/.test(value.captureTag ?? '')) return value;
            counter += 1;
            return { ...value, captureTag: `h${counter}` };
        }),
        counter,
    };
}

export const CHAT_BINDING_STATUS = Object.freeze({
    ready: 'ready',
    branchPending: 'branch-pending',
});

export class ChatBranchDecisionRequiredError extends Error {
    constructor(details) {
        super('检测到从其他聊天创建的分支，请先选择如何处理原聊天记忆。');
        this.name = 'ChatBranchDecisionRequiredError';
        this.code = 'CHAT_BRANCH_DECISION_REQUIRED';
        this.details = details;
    }
}

export function getContextChatId(context) {
    const value = typeof context?.getCurrentChatId === 'function'
        ? context.getCurrentChatId()
        : context?.chatId;
    if (value === null || value === undefined || value === '') {
        throw new Error('当前聊天 ID 不可用。');
    }
    return String(value);
}

export function migrateChatData(current, chatId, {
    now,
    idFactory = () => createStableId('chat-root'),
} = {}) {
    if (isRecord(current) && Number(current.schemaVersion) > CHAT_SCHEMA_VERSION) {
        throw new Error(`聊天数据版本 ${current.schemaVersion} 高于当前支持版本 ${CHAT_SCHEMA_VERSION}。`);
    }

    const fromVersion = isRecord(current) && Number.isInteger(current.schemaVersion)
        ? current.schemaVersion
        : 0;
    const at = isoNow(now);
    const data = mergePreservingUnknown(DEFAULT_CHAT_DATA, current);
    data.schemaVersion = CHAT_SCHEMA_VERSION;
    data.rootId = typeof data.rootId === 'string' && data.rootId ? data.rootId : idFactory();
    data.chatId = String(chatId);
    data.createdAt = typeof data.createdAt === 'string' && data.createdAt ? data.createdAt : at;
    data.updatedAt = typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : at;
    data.migrations = Array.isArray(data.migrations) ? data.migrations : [];
    if (fromVersion < 3) {
        const fictionalCalendar = data.storyTime?.fictionalCalendar ?? {};
        data.memories = (data.memories ?? []).map(memory => ({
            ...memory,
            time: {
                start: parseStoryTimePoint(memory.time?.start?.raw, { fictionalCalendar }),
                end: parseStoryTimePoint(memory.time?.end?.raw || memory.time?.start?.raw, { fictionalCalendar }),
            },
        }));
        if (data.storyTime?.current?.raw) {
            data.storyTime.current = {
                ...data.storyTime.current,
                ...parseStoryTimePoint(data.storyTime.current.raw, { fictionalCalendar }),
            };
        }
        data.anniversaries = (data.anniversaries ?? []).map(anniversary => ({
            ...anniversary,
            names: (anniversary.names ?? []).map(name => ({
                ...name,
                startYear: parseAnniversaryStartYear(name.startYearRaw, { fictionalCalendar }),
            })),
        }));
    }
    if (fromVersion < 6) {
        const oldRule = data.storyTime?.extractionRule ?? {};
        data.storyTime.extractionRule = {
            enabled: Boolean(oldRule.enabled),
            mode: oldRule.enabled && oldRule.pattern ? 'regex' : 'markers',
            markers: Array.isArray(oldRule.markers) ? oldRule.markers : [],
            pattern: typeof oldRule.pattern === 'string' ? oldRule.pattern : '',
            flags: typeof oldRule.flags === 'string' && oldRule.flags ? oldRule.flags : 'su',
        };
    }
    if (fromVersion < 7 && isRecord(data.recall?.triggerLimits)) {
        delete data.recall.triggerLimits.confirmed;
    }
    if (fromVersion < 8) {
        data.recall.automaticSameDayEnabled = data.recall?.automaticSameDayEnabled !== false;
    }
    if (fromVersion < 9) {
        data.calendar = {
            activeCalendarId: data.calendar?.activeCalendarId ?? null,
            definitions: Array.isArray(data.calendar?.definitions) ? data.calendar.definitions : [],
            events: Array.isArray(data.calendar?.events) ? data.calendar.events : [],
        };
    }
    if (fromVersion < 10) {
        data.calendar.events = (data.calendar?.events ?? []).map(event => event?.kind === 'countdown'
            ? {
                ...event,
                kind: 'schedule',
                advanceDays: 0,
                durationDays: 1,
                fact: event.fact ?? '',
            }
            : event);
    }
    if (fromVersion < 11) {
        data.calendar.events = Array.isArray(data.calendar?.events) ? data.calendar.events : [];
    }
    if (fromVersion < 12) {
        data.calendar.definitions = (data.calendar?.definitions ?? []).map(definition => ({
            ...definition,
            config: {
                ...(definition?.config ?? {}),
                holidaySettings: {
                    reminderTemplateIds: Array.isArray(definition?.config?.holidaySettings?.reminderTemplateIds)
                        ? [...definition.config.holidaySettings.reminderTemplateIds]
                        : [],
                    showHolidays: definition?.config?.holidaySettings?.showHolidays !== false,
                    showSolarTerms: definition?.config?.holidaySettings?.showSolarTerms !== false,
                },
            },
        }));
    }
    if (fromVersion < 13) {
        const legacyLastValue = data.summary?.progress?.lastSummarizedFloor;
        const currentLastValue = data.summary?.progress?.lastProcessedFloor;
        const legacyLastFloor = legacyLastValue === null || legacyLastValue === undefined
            ? null
            : Number(legacyLastValue);
        const currentLastFloor = currentLastValue === null || currentLastValue === undefined
            ? null
            : Number(currentLastValue);
        data.summary.nextBatchOrdinal = Number.isSafeInteger(Number(data.summary?.nextBatchOrdinal))
            && Number(data.summary.nextBatchOrdinal) > 0
            ? Number(data.summary.nextBatchOrdinal)
            : 1;
        data.summary.progress.startFloor = Number.isSafeInteger(Number(data.summary?.progress?.startFloor))
            && Number(data.summary.progress.startFloor) >= 0
            ? Number(data.summary.progress.startFloor)
            : 0;
        data.summary.progress.lastProcessedFloor = Number.isSafeInteger(currentLastFloor) && currentLastFloor >= 0
            ? currentLastFloor
            : (Number.isSafeInteger(legacyLastFloor) && legacyLastFloor >= 0 ? legacyLastFloor : null);
        data.summary.batches = Array.isArray(data.summary?.batches) ? data.summary.batches : [];
        data.summary.pendingManualReview = data.summary?.pendingManualReview ?? null;
        data.summary.lastSuccessfulInput = data.summary?.lastSuccessfulInput ?? null;
    }
    if (fromVersion < 14) {
        data.memories = (Array.isArray(data.memories) ? data.memories : []).map(memory => ({
            ...memory,
            keywords: {
                ...(isRecord(memory?.keywords) ? memory.keywords : {}),
                event: Object.hasOwn(memory?.keywords ?? {}, 'event') ? memory.keywords.event : [],
                detail: Object.hasOwn(memory?.keywords ?? {}, 'detail') ? memory.keywords.detail : [],
            },
            source: {
                ...(isRecord(memory?.source) ? memory.source : {}),
                eventOrdinal: Number.isSafeInteger(memory?.source?.eventOrdinal)
                    && memory.source.eventOrdinal > 0
                    ? memory.source.eventOrdinal
                    : null,
            },
        }));
    }
    if (fromVersion < 15 && Array.isArray(data.summary?.pendingManualReview?.candidates)) {
        data.summary.pendingManualReview.candidates = data.summary.pendingManualReview.candidates.map(candidate => ({
            ...candidate,
            eventKeywords: Object.hasOwn(candidate ?? {}, 'eventKeywords') ? candidate.eventKeywords : [],
            detailKeywords: Object.hasOwn(candidate ?? {}, 'detailKeywords') ? candidate.detailKeywords : [],
            eventOrdinal: Number.isSafeInteger(candidate?.eventOrdinal) && candidate.eventOrdinal > 0
                ? candidate.eventOrdinal
                : null,
        }));
    }
    if (fromVersion < 16) {
        const hiddenEnd = current?.summary?.progress?.hiddenThroughFloor;
        const hiddenStart = current?.summary?.progress?.startFloor ?? 0;
        if (current?.summary?.auto?.hideSummarizedFloors !== false
            && Number.isSafeInteger(hiddenEnd) && Number.isSafeInteger(hiddenStart) && hiddenEnd >= hiddenStart
            && !data.summary.hiddenSegments.length) {
            data.summary.hiddenSegments.push({ id: 'hidden-segment-legacy', batchId: null, floorRange: [hiddenStart, hiddenEnd], status: 'active' });
        }
    }
    if (fromVersion < 17) {
        data.memories = (Array.isArray(data.memories) ? data.memories : []).map(memory => {
            const keywords = isRecord(memory?.keywords) ? memory.keywords : {};
            const details = Array.isArray(keywords.detail) ? keywords.detail : [];
            return Object.hasOwn(keywords, 'detailAliases') ? {
                ...memory,
                keywords: { ...keywords, detailAliases: normalizeMemoryDetailAliases(keywords.detailAliases, details) },
            } : memory;
        });
        const normalizeCandidate = candidate => Object.hasOwn(candidate ?? {}, 'detailAliases') ? ({
            ...candidate,
            detailAliases: normalizeMemoryDetailAliases(candidate.detailAliases, candidate.detailKeywords),
        }) : candidate;
        if (Array.isArray(data.summary?.pendingManualReview?.candidates)) {
            data.summary.pendingManualReview.candidates = data.summary.pendingManualReview.candidates.map(normalizeCandidate);
        }
        if (Array.isArray(data.summary?.pendingAuto?.candidates)) {
            data.summary.pendingAuto.candidates = data.summary.pendingAuto.candidates.map(normalizeCandidate);
        }
    }
    if (fromVersion < 20) {
        const moduleMigration = migrateChatCaptureTokens(data.modules, Number(data.moduleCaptureCounter) || 0);
        data.modules = moduleMigration.values;
        data.moduleCaptureCounter = moduleMigration.counter;
    }
    if (fromVersion < 22) data.storyTime.manualAnchor = null;
    data.modules = normalizePromptModules(data.modules, 'chat');
    data.moduleResults = normalizeModuleResults(data.moduleResults);
    data.moduleCaptureCounter = chatCaptureCounter(data.moduleCaptureCounter, data.modules, data.moduleResults);
    if (fromVersion < CHAT_SCHEMA_VERSION) {
        data.migrations = [...data.migrations, { fromVersion, toVersion: CHAT_SCHEMA_VERSION, at }];
        data.updatedAt = at;
    }
    return { data, migrated: fromVersion < CHAT_SCHEMA_VERSION, fromVersion };
}

function floorRanges(value) {
    const source = Array.isArray(value?.[0]) ? value : [value];
    if (!source.length) return null;
    const ranges = [];
    for (const range of source) {
        if (!Array.isArray(range) || range.length < 1) return null;
        const start = Number(range[0]);
        const end = Number(range[1] ?? range[0]);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
        ranges.push([start, end]);
    }
    return ranges.length ? ranges : null;
}

function rangeFitsBranch(value, branchPoint) {
    const ranges = floorRanges(value);
    return Boolean(ranges?.length && ranges.every(([, end]) => end <= branchPoint));
}

function branchPreview(source, branchPoint) {
    const completedBatches = (source?.summary?.batches ?? [])
        .filter(batch => batch?.status === 'completed' && !batch?.invalidatedAt && rangeFitsBranch(batch.floorRange, branchPoint));
    const completedBatchIds = new Set(completedBatches.map(batch => batch.id).filter(Boolean));
    let skippedManualWithoutSourceCount = 0;
    let skippedCrossingMemoryCount = 0;
    const inheritedMemories = (source?.memories ?? []).filter(memory => {
        const ranges = floorRanges(memory?.source?.floorRange);
        if (!ranges) {
            if (memory?.source?.type === 'manual') skippedManualWithoutSourceCount += 1;
            return false;
        }
        if (!rangeFitsBranch(ranges, branchPoint)) {
            skippedCrossingMemoryCount += 1;
            return false;
        }
        if (memory?.source?.batchId && !completedBatchIds.has(memory.source.batchId)) return false;
        return true;
    });
    return {
        inheritedMemoryCount: inheritedMemories.length,
        inheritedBatchCount: completedBatches.length,
        skippedManualWithoutSourceCount,
        skippedCrossingMemoryCount,
    };
}

export function inspectChatDataBinding(context) {
    if (!isRecord(context?.chatMetadata)) {
        throw new Error('SillyTavern chatMetadata 不可用。');
    }
    const chatId = getContextChatId(context);
    const current = context.chatMetadata[EXTENSION_KEY];
    const boundChatId = isRecord(current) && current.chatId ? String(current.chatId) : null;
    const { mainChatId, branchPoint } = inspectSillyTavernBranchContext(context);
    const isFreshOfficialBranch = Boolean(
        boundChatId
        && boundChatId !== chatId
        && mainChatId
        && boundChatId === mainChatId
    );
    if (isFreshOfficialBranch) {
        return {
            status: CHAT_BINDING_STATUS.branchPending,
            chatId,
            sourceChatId: boundChatId,
            mainChatId,
            branchPoint,
            ...branchPreview(current, branchPoint),
        };
    }
    return {
        status: CHAT_BINDING_STATUS.ready,
        chatId,
        renamed: Boolean(boundChatId && boundChatId !== chatId),
    };
}

export function createBranchedChatData(source, chatId, branchPoint, {
    now,
    idFactory = () => createStableId('chat-root'),
} = {}) {
    if (!isRecord(source)) throw new Error('原聊天记忆库不可用。');
    if (!Number.isSafeInteger(branchPoint) || branchPoint < -1) throw new Error('分支楼层不可用。');
    const at = isoNow(now);
    const data = migrateChatData(null, chatId, { now, idFactory }).data;
    const completedBatches = (source.summary?.batches ?? [])
        .filter(batch => batch?.status === 'completed' && !batch?.invalidatedAt && rangeFitsBranch(batch.floorRange, branchPoint))
        .map(batch => structuredClone(batch));
    const completedBatchIds = new Set(completedBatches.map(batch => batch.id).filter(Boolean));
    const inheritedMemories = (source.memories ?? [])
        .filter(memory => rangeFitsBranch(memory?.source?.floorRange, branchPoint))
        .filter(memory => !memory?.source?.batchId || completedBatchIds.has(memory.source.batchId))
        .map(memory => structuredClone(memory));
    const inheritedIds = new Set(inheritedMemories.map(memory => memory.id));
    data.memories = inheritedMemories
        .filter(memory => !memory.mergedFrom?.length || memory.mergedFrom.every(id => inheritedIds.has(id)))
        .map(memory => memory.supersededBy && !inheritedIds.has(memory.supersededBy)
            ? Object.fromEntries(Object.entries(memory).filter(([key]) => key !== 'supersededBy'))
            : memory);
    data.modules = normalizePromptModules(source.modules, 'chat').map(module => structuredClone(module));
    data.moduleResults = normalizeModuleResults(source.moduleResults)
        .filter(result => result.source.messageId <= branchPoint)
        .map(result => structuredClone(result));
    data.anniversaries = (source.anniversaries ?? [])
        .filter(item => item?.source?.type === 'summary'
            && item?.source?.batchId && completedBatchIds.has(item.source.batchId)
            && rangeFitsBranch(item.source.floorRange, branchPoint))
        .map(item => structuredClone(item));
    data.summary.batches = completedBatches;
    data.summary.nextBatchOrdinal = Math.max(0, ...completedBatches.map(batch => Number(batch.ordinal) || 0)) + 1;
    data.summary.progress.startFloor = 0;
    data.summary.progress.lastProcessedFloor = completedBatches.length
        ? Math.max(...completedBatches.flatMap(batch => floorRanges(batch.floorRange)?.map(([, end]) => end) ?? []))
        : null;
    data.summary.pendingManualReview = null;
    data.summary.pendingAuto = null;
    data.summary.excludedFloors = inheritSummaryExclusions(source.summary, branchPoint);
    data.summary.hiddenSegments = (source.summary?.hiddenSegments ?? [])
        .filter(segment => segment.status === 'active' && rangeFitsBranch(segment.floorRange, branchPoint)
            && (!segment.batchId || completedBatchIds.has(segment.batchId)))
        .map(segment => structuredClone(segment));
    data.summary.lastResult = null;
    data.summary.auto.enabled = false;
    data.summary.auto.initialized = false;
    data.summary.auto.lastCheckpointId = null;
    data.summary.lastSuccessfulInput = null;
    data.monitor = structuredClone(DEFAULT_CHAT_DATA.monitor);
    data.createdAt = at;
    data.updatedAt = at;
    return data;
}

export function readChatData(context, options) {
    const binding = inspectChatDataBinding(context);
    if (binding.status === CHAT_BINDING_STATUS.branchPending) {
        throw new ChatBranchDecisionRequiredError(binding);
    }
    const chatId = binding.chatId;
    const current = context.chatMetadata[EXTENSION_KEY];
    const result = migrateChatData(current, chatId, options);
    return {
        ...result,
        migrated: result.migrated || binding.renamed,
        renamed: binding.renamed,
    };
}
