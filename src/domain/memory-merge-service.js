import { assemblePromptTask } from '../prompts/prompt-assembler.js';
import { effectiveEventLibrary } from '../prompts/event-library.js';
import { cloneJson, createStableId } from '../storage/schema-utils.js';
import { createMemory, isActiveMemory } from './memory.js';
import { normalizeAtomicTextList } from './text-list.js';
import { inspectMemoryDetailAliases } from './detail-aliases.js';

const SOURCE_MODES = new Set(['chat-original', 'memory-content']);

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function chatIdOf(service) {
    const state = service.inspectCurrent();
    if (state.status !== 'ready') throw new Error(state.message || '当前聊天不可用。');
    return state.chatId;
}

function rangesOf(value) {
    const input = Array.isArray(value?.[0]) ? value : [value];
    return input.flatMap(range => {
        if (!Array.isArray(range) || range.length < 1) return [];
        const start = Number(range[0]);
        const end = Number(range[1] ?? range[0]);
        return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start
            ? [[start, end]] : [];
    });
}

export function mergeMemoryFloorRanges(values) {
    const sorted = values.flatMap(rangesOf).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const result = [];
    for (const range of sorted) {
        const previous = result.at(-1);
        if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
        else result.push([...range]);
    }
    return result;
}

function memoryFacts(memory) {
    return {
        id: memory.id,
        title: memory.title ?? '',
        body: memory.body ?? '',
        storyTime: {
            start: memory.time?.start?.raw ?? '',
            end: memory.time?.end?.raw ?? memory.time?.start?.raw ?? '',
        },
        people: cloneJson(memory.people ?? []),
        locations: cloneJson(memory.locations ?? []),
        source: { floorRanges: cloneJson(rangesOf(memory.source?.floorRange)) },
    };
}

function sourceMessages(chat, ranges) {
    const segments = [];
    for (const [start, end] of ranges) {
        const floors = [];
        for (let floor = start; floor <= end; floor += 1) {
            const message = chat?.[floor];
            if (!message || message.is_system === true || typeof message.mes !== 'string'
                || (message.is_user !== true && message.is_user !== false)) return null;
            floors.push({ floor, speaker: message.is_user ? '用户' : 'AI', content: message.mes });
        }
        segments.push({ range: [start, end], floors });
    }
    return segments;
}

function sourceSnapshot(chat, ranges) {
    return ranges.map(([start, end]) => ({
        range: [start, end],
        messages: chat.slice(start, end + 1).map(item => ({
            is_user: item?.is_user,
            is_system: item?.is_system,
            mes: item?.mes,
            send_date: item?.send_date,
        })),
    }));
}

function stableUnion(memories, field) {
    return normalizeAtomicTextList(memories.flatMap(memory => memory?.[field] ?? []));
}

function timeBounds(memories) {
    const start = [...memories].sort((a, b) => String(a.time?.start?.sortKey || a.time?.start?.raw || '')
        .localeCompare(String(b.time?.start?.sortKey || b.time?.start?.raw || ''), 'zh-Hans-CN', { numeric: true }))[0];
    const end = [...memories].sort((a, b) => String(b.time?.end?.sortKey || b.time?.end?.raw || '')
        .localeCompare(String(a.time?.end?.sortKey || a.time?.end?.raw || ''), 'zh-Hans-CN', { numeric: true }))[0];
    return {
        start: start?.time?.start?.raw ?? '',
        end: end?.time?.end?.raw ?? end?.time?.start?.raw ?? '',
    };
}

function criticalSettings(settings) {
    return {
        aiProvider: cloneJson(settings?.aiProvider ?? null),
        mergePrompt: settings?.summary?.promptOverrides?.merge ?? null,
        keywordPrompt: settings?.summary?.promptOverrides?.qualityKeywords ?? null,
        customPrompts: cloneJson(settings?.summary?.promptOverrides?.customPrompts ?? []),
        eventLibraryOverride: cloneJson(settings?.summary?.eventLibraryOverride ?? null),
    };
}

function providerSource(provider) {
    return ({ main: 'sillytavern', secondary: 'plugin' })[provider?.source] ?? provider?.source ?? null;
}

export class MemoryMergeService {
    #active = null;
    #review = null;

    constructor({ chatDataService, summaryChatAdapter, summaryProvider, getGlobalSettings,
        now = () => new Date(), idFactory = prefix => createStableId(prefix) } = {}) {
        if (!chatDataService || !summaryChatAdapter || !summaryProvider || typeof getGlobalSettings !== 'function') {
            throw new TypeError('记忆合并服务依赖不可用。');
        }
        this.chatDataService = chatDataService;
        this.summaryChatAdapter = summaryChatAdapter;
        this.summaryProvider = summaryProvider;
        this.getGlobalSettings = getGlobalSettings;
        this.now = now;
        this.idFactory = idFactory;
    }

    providerState() { return cloneJson(this.summaryProvider.describe?.() ?? { available: true }); }

    installChatIsolation() {
        return this.summaryChatAdapter.onChatChanged?.(() => this.cancel()) ?? false;
    }

    cancel() {
        this.#active?.controller.abort();
        this.#active = null;
        this.#review = null;
        return true;
    }

    currentReview() {
        if (!this.#review) return null;
        const { memorySnapshots, sourceSnapshot: _sourceSnapshot, settingsSnapshot, ...visible } = this.#review;
        return cloneJson(visible);
    }

    inspectSelection(ids) {
        const selected = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
        const root = this.chatDataService.readCurrent();
        const byId = new Map(root.memories.map(memory => [memory.id, memory]));
        const memories = selected.map(id => byId.get(id));
        let reason = '';
        if (selected.length < 2) reason = '请至少选择两条记忆。';
        else if (memories.some(memory => !memory || !isActiveMemory(memory))) reason = '所选记忆已不存在或已被替代。';
        else if (memories.some(memory => memory.source?.type === 'merge'
            || (Array.isArray(memory.mergedFrom) && memory.mergedFrom.length))) reason = '合并产生的记忆暂不支持再次合并。';
        const ranges = reason ? [] : mergeMemoryFloorRanges(memories.map(memory => memory.source?.floorRange));
        const chat = this.summaryChatAdapter.readCurrent();
        const originalAvailable = !reason && ranges.length > 0 && chat.chatId === root.chatId
            && Boolean(sourceMessages(chat.chat, ranges));
        return {
            canMerge: !reason,
            reason,
            selectedCount: selected.length,
            ranges,
            originalAvailable,
            originalReason: originalAvailable ? '' : '部分来源楼层已无法在当前聊天中安全读取，请使用记忆内容融合。',
        };
    }

    #assertLease(lease) {
        if (this.#active !== lease || lease.controller.signal.aborted || chatIdOf(this.chatDataService) !== lease.chatId) {
            const error = new Error('记忆合并已取消。');
            error.code = 'memory_merge_cancelled';
            throw error;
        }
    }

    #assertStable(review, { checkSource = true } = {}) {
        if (chatIdOf(this.chatDataService) !== review.chatId) throw new Error('聊天已切换，本次合并没有写入。');
        const root = this.chatDataService.readCurrent();
        for (const snapshot of review.memorySnapshots) {
            const current = root.memories.find(memory => memory.id === snapshot.id);
            if (!current || !same(current, snapshot.memory) || !isActiveMemory(current)) {
                throw new Error('所选记忆已发生变化，本次合并没有写入。');
            }
        }
        if (!same(criticalSettings(this.getGlobalSettings()), review.settingsSnapshot)) {
            throw new Error('AI 来源、提示词或事件词库已变化，请重新开始合并。');
        }
        if (checkSource && review.sourceMode === 'chat-original') {
            const chat = this.summaryChatAdapter.readCurrent();
            if (chat.chatId !== review.chatId || !same(sourceSnapshot(chat.chat, review.ranges), review.sourceSnapshot)) {
                throw new Error('来源原文已发生变化，本次合并没有写入。');
            }
        }
        return root;
    }

    async start(ids, sourceMode) {
        if (this.#active) throw new Error('已有记忆合并正在进行。');
        if (this.#review) throw new Error('已有待检查的合并结果，请先确认或取消。');
        if (!SOURCE_MODES.has(sourceMode)) throw new Error('请选择正文来源。');
        const inspected = this.inspectSelection(ids);
        if (!inspected.canMerge) throw new Error(inspected.reason);
        if (sourceMode === 'chat-original' && !inspected.originalAvailable) throw new Error(inspected.originalReason);
        const chatId = chatIdOf(this.chatDataService);
        const root = this.chatDataService.readCurrent();
        const selectedIds = [...new Set(ids.map(String))];
        const byId = new Map(root.memories.map(memory => [memory.id, memory]));
        const memories = selectedIds.map(id => byId.get(id));
        const memorySnapshots = memories.map(memory => ({ id: memory.id, memory: cloneJson(memory) }));
        const chat = this.summaryChatAdapter.readCurrent();
        const settings = this.getGlobalSettings();
        const mergeSource = sourceMode === 'chat-original' ? {
            sourceMode,
            ranges: cloneJson(inspected.ranges),
            chatSegments: sourceMessages(chat.chat, inspected.ranges),
            memoryReferences: memories.map(memoryFacts),
        } : {
            sourceMode,
            memories: memories.map(memoryFacts),
        };
        const compiled = assemblePromptTask({
            task: 'merge', source: mergeSource,
            promptOverrides: settings?.summary?.promptOverrides ?? null,
        });
        compiled.outputKind = 'memory-merge';
        const prepared = this.summaryProvider.prepare(compiled);
        if (!prepared.provider?.available) throw new Error('当前选择的 AI 来源不可用。');
        const lease = { id: this.idFactory('memory-merge-review'), chatId, controller: new AbortController() };
        this.#active = lease;
        try {
            const result = await this.summaryProvider.generate(prepared, { signal: lease.controller.signal });
            this.#assertLease(lease);
            const base = {
                id: lease.id,
                stage: 'body-review',
                chatId,
                sourceMode,
                selectedIds,
                ranges: cloneJson(inspected.ranges),
                memorySnapshots,
                sourceSnapshot: sourceMode === 'chat-original' ? sourceSnapshot(chat.chat, inspected.ranges) : null,
                settingsSnapshot: criticalSettings(settings),
                providerSource: providerSource(prepared.provider),
                candidate: {
                    title: result.data.title,
                    body: result.data.body,
                    coherenceWarning: result.data.coherenceWarning,
                    people: stableUnion(memories, 'people'),
                    locations: stableUnion(memories, 'locations'),
                    storyTime: timeBounds(memories),
                    mode: memories.every(memory => memory.mode === 'resident') ? 'resident' : 'trigger',
                },
            };
            this.#assertStable(base);
            this.#review = base;
            return this.currentReview();
        } finally {
            if (this.#active === lease) this.#active = null;
        }
    }

    async confirmBody(reviewId, edited = {}) {
        const review = this.#review;
        if (!review || review.id !== reviewId || review.stage !== 'body-review') throw new Error('找不到待检查的融合正文。');
        if (this.#active) throw new Error('已有记忆合并正在进行。');
        this.#assertStable(review);
        const title = typeof edited.title === 'string' ? edited.title.trim() : review.candidate.title;
        const body = typeof edited.body === 'string' ? edited.body.trim() : review.candidate.body;
        if (!title) throw new Error('请填写融合后的记忆标题。');
        if (!body) throw new Error('请填写融合后的记忆正文。');
        const people = edited.people === undefined ? review.candidate.people : normalizeAtomicTextList(edited.people);
        const locations = edited.locations === undefined ? review.candidate.locations : normalizeAtomicTextList(edited.locations);
        const candidate = { ...review.candidate, title, body, people, locations };
        const settings = this.getGlobalSettings();
        const eventLibrary = effectiveEventLibrary(settings?.summary);
        const draftId = this.idFactory('merged-memory-draft');
        const drafts = [{
            draftId, title, body, storyTime: cloneJson(candidate.storyTime), people: cloneJson(people),
            locations: cloneJson(locations), classificationTags: [], specialDateCandidates: [],
        }];
        const compiled = assemblePromptTask({
            task: 'quality_stage_b', drafts, eventKeywords: eventLibrary,
            promptOverrides: settings?.summary?.promptOverrides ?? null, generationMode: 'quality',
        });
        compiled.outputKind = 'keyword-index';
        compiled.validationOptions = { draftIds: [draftId], allowedEventKeywordNames: eventLibrary.map(item => item.name) };
        const prepared = this.summaryProvider.prepare(compiled);
        if (!prepared.provider?.available || providerSource(prepared.provider) !== review.providerSource) {
            throw new Error('AI 来源已变化，请恢复原来源后重新开始合并。');
        }
        const lease = { id: review.id, chatId: review.chatId, controller: new AbortController() };
        this.#active = lease;
        try {
            const result = await this.summaryProvider.generate(prepared, { signal: lease.controller.signal });
            this.#assertLease(lease);
            this.#assertStable(review);
            const index = result.data.indexes.find(item => item.draftId === draftId);
            if (!index || !Object.hasOwn(index, 'detailAliases')) throw new Error('关键词结果缺少检索简称，合并结果没有写入。');
            const aliases = inspectMemoryDetailAliases(index.detailAliases, index.detailKeywords);
            const aliasDiagnostics = [...(index.detailAliasDiagnostics ?? []), ...aliases.diagnostics];
            this.#review = {
                ...review,
                stage: 'final-review',
                candidate: {
                    ...candidate,
                    ...(aliasDiagnostics.length ? {
                        aliasWarning: '部分检索简称不符合规则，已忽略；关键词和其他有效简称仍会保存。',
                    } : {}),
                    keywords: {
                        event: cloneJson(index.eventKeywords),
                        detail: cloneJson(index.detailKeywords),
                        detailAliases: cloneJson(aliases.value),
                    },
                },
            };
            return this.currentReview();
        } finally {
            if (this.#active === lease) this.#active = null;
        }
    }

    async confirm(reviewId) {
        const review = this.#review;
        if (!review || review.id !== reviewId || review.stage !== 'final-review') throw new Error('找不到待确认的合并结果。');
        this.#assertStable(review);
        let merged = null;
        await this.chatDataService.updateCurrent(root => {
            this.#assertStable(review);
            const memories = review.selectedIds.map(id => root.memories.find(memory => memory.id === id));
            if (memories.some(memory => !memory || !isActiveMemory(memory)
                || memory.source?.type === 'merge' || memory.mergedFrom?.length)) {
                throw new Error('所选记忆已变化，本次合并没有写入。');
            }
            const mergedId = this.idFactory('memory');
            merged = createMemory({
                mode: review.candidate.mode,
                title: review.candidate.title,
                startTime: review.candidate.storyTime.start,
                endTime: review.candidate.storyTime.end,
                body: review.candidate.body,
                people: review.candidate.people,
                locations: review.candidate.locations,
                keywords: {
                    ...review.candidate.keywords,
                    primary: [], auxiliary: [],
                },
                source: { type: 'merge', batchId: null, floorRange: review.ranges, externalId: null },
                mergedFrom: review.selectedIds,
            }, { now: this.now, idFactory: () => mergedId, fictionalCalendar: root.storyTime?.fictionalCalendar ?? {} });
            root.memories = root.memories.map(memory => review.selectedIds.includes(memory.id)
                ? { ...memory, supersededBy: mergedId }
                : memory);
            root.memories.push(merged);
        });
        this.#review = null;
        return cloneJson(merged);
    }

    async undo(mergedId) {
        let restored = 0;
        await this.chatDataService.updateCurrent(root => {
            const merged = root.memories.find(memory => memory.id === mergedId);
            if (!merged || !isActiveMemory(merged) || !Array.isArray(merged.mergedFrom) || merged.mergedFrom.length < 2) {
                throw new Error('找不到可撤销的合并记录。');
            }
            const sourceIds = new Set(merged.mergedFrom);
            const sources = root.memories.filter(memory => sourceIds.has(memory.id));
            if (sources.length !== sourceIds.size || sources.some(memory => memory.supersededBy !== mergedId)) {
                throw new Error('合并来源已发生变化，不能安全撤销。');
            }
            root.memories = root.memories.filter(memory => memory.id !== mergedId).map(memory => sourceIds.has(memory.id)
                ? Object.fromEntries(Object.entries(memory).filter(([key]) => key !== 'supersededBy'))
                : memory);
            restored = sources.length;
        });
        return { status: 'completed', restored };
    }
}
