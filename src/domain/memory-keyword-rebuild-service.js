import { cloneJson, createStableId } from '../storage/schema-utils.js';
import { assemblePromptTask } from '../prompts/prompt-assembler.js';
import { effectiveEventLibrary } from '../prompts/event-library.js';
import { inspectMemoryDetailAliases } from './detail-aliases.js';

function chatIdOf(service) {
    const state = service.inspectCurrent();
    if (state.status !== 'ready') throw new Error(state.message || '当前聊天不可用。');
    return state.chatId;
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function frozenFacts(memory) {
    return {
        draftId: memory.id,
        title: memory.title ?? '',
        storyTime: {
            start: memory.time?.start?.raw ?? '',
            end: memory.time?.end?.raw ?? memory.time?.start?.raw ?? '',
        },
        body: memory.body ?? '',
        people: cloneJson(memory.people ?? []),
        locations: cloneJson(memory.locations ?? []),
        classificationTags: [],
        specialDateCandidates: [],
    };
}

function modernKeywords(memory) {
    return {
        event: cloneJson(memory.keywords?.event ?? []),
        detail: cloneJson(memory.keywords?.detail ?? []),
        detailAliases: cloneJson(memory.keywords?.detailAliases ?? []),
    };
}

export class MemoryKeywordRebuildService {
    #active = null;
    #review = null;

    constructor({ chatDataService, summaryProvider, getGlobalSettings, idFactory = prefix => createStableId(prefix) } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (!summaryProvider) throw new TypeError('summaryProvider 不可用。');
        if (typeof getGlobalSettings !== 'function') throw new TypeError('getGlobalSettings 必须是函数。');
        this.chatDataService = chatDataService;
        this.summaryProvider = summaryProvider;
        this.getGlobalSettings = getGlobalSettings;
        this.idFactory = idFactory;
    }

    providerState() {
        return this.summaryProvider.describe?.() ?? { available: true };
    }

    currentReview() {
        return this.#review ? cloneJson(this.#review) : null;
    }

    installChatIsolation(context) {
        if (!context?.eventSource || typeof context.eventSource.on !== 'function') return false;
        const handlers = [];
        for (const name of ['CHAT_CHANGED', 'CHAT_CREATED']) {
            const eventType = context.eventTypes?.[name];
            if (!eventType) continue;
            const handler = () => this.cancel();
            context.eventSource.on(eventType, handler);
            handlers.push([eventType, handler]);
        }
        return () => handlers.forEach(([type, handler]) => context.eventSource?.off?.(type, handler));
    }

    cancel() {
        this.#active?.controller.abort();
        this.#active = null;
        this.#review = null;
        return true;
    }

    #assertLease(lease) {
        if (this.#active !== lease || lease.controller.signal.aborted || chatIdOf(this.chatDataService) !== lease.chatId) {
            const error = new Error('关键词重建已取消。');
            error.code = 'keyword_rebuild_cancelled';
            throw error;
        }
    }

    #assertSnapshots(root, snapshots) {
        for (const snapshot of snapshots) {
            const current = root.memories.find(memory => memory.id === snapshot.id);
            if (!current || !sameValue(current, snapshot.memory)) {
                const error = new Error('所选记忆已发生变化，本次结果没有写入。');
                error.code = 'keyword_rebuild_target_changed';
                throw error;
            }
        }
    }

    async start(ids) {
        if (this.#active) throw new Error('已有关键词重建正在进行。');
        const selected = [...new Set(Array.isArray(ids) ? ids.filter(Boolean).map(String) : [])];
        if (!selected.length) throw new Error('请先选择要重建关键词的记忆。');
        const chatId = chatIdOf(this.chatDataService);
        const root = this.chatDataService.readCurrent();
        const byId = new Map(root.memories.map(memory => [memory.id, memory]));
        const memories = selected.map(id => byId.get(id));
        if (memories.some(memory => !memory)) throw new Error('所选记忆已不存在。');
        const snapshots = memories.map(memory => ({ id: memory.id, memory: cloneJson(memory) }));
        const settings = this.getGlobalSettings();
        const eventLibrary = effectiveEventLibrary(settings?.summary);
        const drafts = memories.map(frozenFacts);
        const compiled = assemblePromptTask({
            task: 'quality_stage_b',
            drafts,
            eventKeywords: eventLibrary,
            promptOverrides: settings?.summary?.promptOverrides ?? null,
            generationMode: 'quality',
        });
        compiled.outputKind = 'keyword-index';
        compiled.validationOptions = {
            draftIds: drafts.map(item => item.draftId),
            allowedEventKeywordNames: eventLibrary.map(item => item.name),
        };
        const prepared = this.summaryProvider.prepare(compiled);
        if (!prepared.provider?.available) throw new Error('当前选择的 AI 来源不可用。');
        const lease = { id: this.idFactory('keyword-rebuild'), chatId, controller: new AbortController() };
        this.#active = lease;
        this.#review = null;
        try {
            const result = await this.summaryProvider.generate(prepared, { signal: lease.controller.signal });
            this.#assertLease(lease);
            this.#assertSnapshots(this.chatDataService.readCurrent(), snapshots);
            const indexes = new Map(result.data.indexes.map(item => [item.draftId, item]));
            const candidates = memories.map(memory => {
                const next = indexes.get(memory.id);
                if (!next) throw new Error('关键词结果没有覆盖全部所选记忆。');
                if (!Object.hasOwn(next, 'detailAliases')) throw new Error('关键词结果缺少检索简称，旧内容保持不变。');
                const inspectedAliases = inspectMemoryDetailAliases(next.detailAliases, next.detailKeywords);
                if ((next.detailAliasDiagnostics?.length ?? 0) || inspectedAliases.diagnostics.length) {
                    throw new Error('检索简称结果无效，旧内容保持不变。');
                }
                return {
                    memoryId: memory.id,
                    title: memory.title ?? '',
                    current: modernKeywords(memory),
                    next: {
                        event: cloneJson(next.eventKeywords),
                        detail: cloneJson(next.detailKeywords),
                        detailAliases: inspectedAliases.value,
                    },
                };
            });
            this.#review = {
                id: lease.id,
                chatId,
                snapshots,
                candidates,
                eventLibrary: cloneJson(eventLibrary),
                provider: cloneJson(result.provider ?? prepared.provider),
            };
            return cloneJson(this.#review);
        } finally {
            if (this.#active === lease) this.#active = null;
        }
    }

    async confirm(reviewId) {
        const review = this.#review;
        if (!review || review.id !== reviewId) throw new Error('找不到待确认的关键词结果。');
        if (chatIdOf(this.chatDataService) !== review.chatId) throw new Error('聊天已切换，本次结果没有写入。');
        try {
            await this.chatDataService.updateCurrent(root => {
                this.#assertSnapshots(root, review.snapshots);
                const nextById = new Map(review.candidates.map(candidate => [candidate.memoryId, candidate.next]));
                root.memories = root.memories.map(memory => {
                    const next = nextById.get(memory.id);
                    if (!next) return memory;
                    return {
                        ...memory,
                        keywords: {
                            ...(memory.keywords ?? {}),
                            event: cloneJson(next.event),
                            detail: cloneJson(next.detail),
                            detailAliases: cloneJson(next.detailAliases),
                        },
                    };
                });
            });
            this.#review = null;
            return { status: 'completed', count: review.candidates.length };
        } catch (error) {
            throw error;
        }
    }
}
