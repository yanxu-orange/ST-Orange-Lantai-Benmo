import { automaticSummaryState, planAutomaticSummaryBackfill, selectAutomaticSummaryRange } from './automatic-state.js';
import { createAnniversary } from '../domain/anniversary.js';
import { createMemory, isActiveMemory } from '../domain/memory.js';
import { parseStoryTimeValue } from '../domain/story-time.js';
import { cloneJson, createStableId, isoNow } from '../storage/schema-utils.js';
import { assemblePromptTask, renderPromptTemplate } from '../prompts/prompt-assembler.js';
import { effectiveEventLibrary } from '../prompts/event-library.js';
import { getDefaultPromptText } from '../prompts/prompt-customization.js';
import { getPromptModule, getPromptSchema } from '../prompts/prompt-registry.js';
import { normalizeSummaryCandidate, normalizeSummaryKeywordDraft } from './candidate-normalizer.js';
import { SummaryDomainError } from './errors.js';
import { cleanSummaryFloors } from './source-cleaning.js';
import { blockUnresolvedSummaryDeletion, invalidateSummaryDeletion } from './invalidation.js';
import { selectContinuousSummaryFloors } from './source-selection.js';
import { buildSummaryCoverage } from './coverage.js';
import { projectSummaryBatches } from './batch-projection.js';
import { planUncoveredRanges } from './uncovered-plan.js';
import {
    filterExcludedSummaryFloors,
    markSummaryFloorExcluded,
    sameSummaryExclusionPolicy,
    summaryExclusionPolicy,
    unmarkSummaryFloorExcluded,
} from './exclusions.js';

function sameRange(left, right) {
    return Array.isArray(left) && Array.isArray(right)
        && left.length === 2 && right.length === 2
        && left[0] === right[0] && left[1] === right[1];
}

function latestDuplicateBatch(summary, requestedRange) {
    return [...(summary?.batches ?? [])].reverse().find(batch => batch?.status === 'completed'
        && batch?.outcome === 'memories'
        && !batch?.invalidatedAt
        && !batch?.retiredAt
        && sameRange(batch.requestedRange, requestedRange)) ?? null;
}

function forProvider(assembled, outputKind, validationOptions = {}) {
    return { ...assembled, outputKind, validationOptions };
}

function eventKeywordValidationOptions(eventKeywords) {
    return { allowedEventKeywordNames: eventKeywords.map(item => item.name.trim()) };
}

function sourceForAssembler(cleanedFloors) {
    return cleanedFloors.map(floor => ({
        floor: floor.index,
        speaker: floor.role === 'user' ? '用户' : 'AI',
        content: floor.text,
    }));
}

const PROMPT_PREVIEW_NAMES = Object.freeze({
    'summary.a1.task_identity': '总结任务',
    'summary.a2.fact_boundary': '事实边界',
    'summary.a3.event_boundary': '事件划分',
    'summary.a4.memory_fields': '记忆字段',
    'index.b1.scope': '关键词任务',
    'index.b2.event_keywords': '事件词选择',
    'index.b3.detail_candidates': '细节候选',
    'index.b4.detail_selection': '细节筛选',
    'index.b5.cross_field': '字段校验',
    'prompt.quality_summary': '总结提示词',
    'prompt.quality_keywords': '关键词提示词',
    'prompt.fast': '一次生成提示词',
});

function promptPreviewParts(compiled) {
    if (compiled.previewParts) return cloneJson(compiled.previewParts);
    const messages = compiled.messages ?? [];
    const moduleIds = compiled.meta?.moduleIds ?? [];
    const sources = compiled.meta?.systemMessageSources ?? [];
    const parts = moduleIds.map((id, index) => ({
        id,
        name: PROMPT_PREVIEW_NAMES[id] ?? id,
        role: messages[index]?.role ?? 'system',
        content: messages[index]?.content ?? '',
        fixed: sources[index]?.source !== 'user',
    }));
    const contractIndex = messages.length - 1;
    if (contractIndex >= moduleIds.length) {
        parts.push({
            id: compiled.meta?.contractId ?? 'task-contract',
            name: '本次资料与输出格式',
            role: messages[contractIndex]?.role ?? 'user',
            content: messages[contractIndex]?.content ?? '',
            fixed: true,
        });
    }
    return parts;
}

function qualityStageBPreviewParts({ eventKeywords, promptOverrides, mode }) {
    return promptPreviewParts(assemblePromptTask({task: mode === 'enhanced' ? 'quality_keywords_only' : 'quality_stage_b',
        drafts: [{draftId:'preview',body:'第一次调用结果将在生成后自动填入。'}], eventKeywords, promptOverrides, generationMode: mode}));
}

function summaryMessageAt(chat, floor) {
    if (!Number.isSafeInteger(floor) || floor < 0 || !Array.isArray(chat) || floor >= chat.length) {
        throw new SummaryDomainError('floor_range_not_found', '所选楼层范围已不存在。');
    }
    const message = chat[floor];
    if (message?.is_system === true || typeof message?.mes !== 'string'
        || (message?.is_user !== true && message?.is_user !== false)) {
        throw new SummaryDomainError('invalid_summary_floor', '该楼层不是可参与总结的用户或 AI 消息。');
    }
    return message;
}

function factsForStageB(candidates) {
    return candidates.map(candidate => ({
        draftId: candidate.draftId,
        title: candidate.title,
        storyTime: cloneJson(candidate.storyTime),
        body: candidate.body,
        people: cloneJson(candidate.people),
        locations: cloneJson(candidate.locations),
        classificationTags: cloneJson(candidate.classificationTags),
        specialDateCandidates: cloneJson(candidate.specialDateCandidates),
    }));
}

function assembleStageB(candidates, promptOverrides = null, eventKeywords, mode = 'quality') {
    const drafts = factsForStageB(candidates);
    return forProvider(assemblePromptTask({
        task: mode === 'enhanced' ? 'quality_keywords_only' : 'quality_stage_b',
        drafts,
        eventKeywords,
        promptOverrides,
        generationMode: mode,
    }), 'keyword-index', {
        draftIds: drafts.map(item => item.draftId),
        ...eventKeywordValidationOptions(eventKeywords),
    });
}

function assembleStageC(candidates, promptOverrides = null) {
    const drafts = factsForStageB(candidates).map((item, index) => ({
        ...item, detailKeywords: cloneJson(candidates[index].detailKeywords),
    }));
    return forProvider(assemblePromptTask({ task: 'quality_stage_c', drafts, promptOverrides, generationMode: 'enhanced' }), 'alias-index', {
        draftIds: drafts.map(item => item.draftId), drafts,
    });
}

function sameProviderSource(left, right) {
    const normalize = value => ({ main: 'sillytavern', secondary: 'plugin' }[value] ?? value);
    return normalize(left?.source) === normalize(right?.source);
}

function mergeKeywordIndex(draft, index) {
    const merged = { ...draft, ...index };
    if (!Object.hasOwn(index ?? {}, 'detailAliases')) {
        delete merged.detailAliases;
        delete merged.detailAliasDiagnostics;
    }
    return merged;
}

function normalizeEditedCandidates(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) {
        throw new SummaryDomainError('empty_summary', '至少保留一条记忆候选。');
    }
    return candidates.map((candidate, index) => ({
        ...normalizeSummaryCandidate({
        title: candidate?.title ?? '',
        storyTime: candidate?.storyTime ?? { start: '', end: '' },
        body: candidate?.body ?? '',
        people: candidate?.people ?? [],
        locations: candidate?.locations ?? [],
        eventKeywords: candidate?.eventKeywords ?? [],
        detailKeywords: candidate?.detailKeywords ?? [],
        ...(Object.hasOwn(candidate ?? {}, 'detailAliases') ? { detailAliases: candidate.detailAliases } : {}),
        ...(Array.isArray(candidate?.detailAliasDiagnostics) ? { detailAliasDiagnostics: candidate.detailAliasDiagnostics } : {}),
        primaryKeywords: candidate?.primaryKeywords ?? [],
        auxiliaryKeywords: candidate?.auxiliaryKeywords ?? [],
        eventOrdinal: candidate?.eventOrdinal ?? null,
        classificationTags: candidate?.classificationTags ?? [],
            specialDateCandidates: candidate?.specialDateCandidates ?? [],
        }, index),
        ...(candidate?.draftId ? { draftId: String(candidate.draftId) } : {}),
    }));
}

function normalizeKeywordDraftCandidates(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) {
        throw new SummaryDomainError('empty_summary', '至少保留一条记忆候选。');
    }
    return candidates.map((candidate, index) => ({
        ...normalizeSummaryKeywordDraft({
            title: candidate?.title ?? '',
            storyTime: candidate?.storyTime ?? { start: '', end: '' },
            body: candidate?.body ?? '',
            people: candidate?.people ?? [],
            locations: candidate?.locations ?? [],
            eventKeywords: candidate?.eventKeywords ?? [],
            detailKeywords: candidate?.detailKeywords ?? [],
            ...(Object.hasOwn(candidate ?? {}, 'detailAliases') ? { detailAliases: candidate.detailAliases } : {}),
            ...(Array.isArray(candidate?.detailAliasDiagnostics) ? { detailAliasDiagnostics: candidate.detailAliasDiagnostics } : {}),
            primaryKeywords: candidate?.primaryKeywords ?? [],
            auxiliaryKeywords: candidate?.auxiliaryKeywords ?? [],
            eventOrdinal: candidate?.eventOrdinal ?? null,
            classificationTags: candidate?.classificationTags ?? [],
            specialDateCandidates: candidate?.specialDateCandidates ?? [],
        }, index),
        ...(candidate?.draftId ? { draftId: String(candidate.draftId) } : {}),
    }));
}

function specialDateFromCandidate(candidate, { batchId, floorRange, fictionalCalendar, now, idFactory }) {
    const parsed = parseStoryTimeValue(candidate.storyDate, { fictionalCalendar });
    if (!parsed?.month || !parsed?.day || parsed.month > 12) return null;
    const startYearRaw = parsed.calendar === 'gregorian'
        ? String(parsed.year)
        : `${parsed.era}${parsed.year}年`;
    try {
        const anniversary = createAnniversary({
            status: 'pending',
            month: parsed.month,
            day: parsed.day,
            names: [{ name: candidate.name, startYearRaw }],
            advance: { mode: 'inherit', days: null },
            templates: { day: '', advance: '' },
            source: { type: 'summary', batchId, floorRange },
        }, { now, idFactory, fictionalCalendar });
        anniversary.candidateReason = candidate.reason;
        anniversary.storyDateRaw = candidate.storyDate;
        return anniversary;
    } catch {
        return null;
    }
}

export class ManualSummaryService {
    #active = new Map();
    #regenerationReviews = new Map();
    #automaticObservations = new Map();
    #automaticRuntime = new Map();
    #manualRuns = new Map();
    #nextReplyRequests = new Set();
    #backfillSession = null;
    #providerStatusDisposer = null;
    #lastAvailableChatId = null;

    constructor({
        chatDataService,
        summaryChatAdapter,
        summaryProvider,
        getGlobalSettings,
        onStateChanged = () => {},
        now = () => new Date(),
        idFactory = prefix => createStableId(prefix),
    } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (!summaryChatAdapter) throw new TypeError('summaryChatAdapter 不可用。');
        if (!summaryProvider) throw new TypeError('summaryProvider 不可用。');
        if (typeof getGlobalSettings !== 'function') throw new TypeError('getGlobalSettings 必须是函数。');
        this.chatDataService = chatDataService;
        this.summaryChatAdapter = summaryChatAdapter;
        this.summaryProvider = summaryProvider;
        this.getGlobalSettings = getGlobalSettings;
        this.onStateChanged = onStateChanged;
        this.now = now;
        this.idFactory = idFactory;
    }

    installChatIsolation() {
        this.#lastAvailableChatId = this.#currentChatIdOrNull();
        return this.summaryChatAdapter.onChatChanged?.(currentChatId => {
            const activeChatId = currentChatId ?? this.#currentChatIdOrNull();
            if (activeChatId === null) {
                this.#notifyStateChanged();
                return;
            }
            if (activeChatId === this.#lastAvailableChatId) {
                this.#notifyStateChanged();
                return;
            }
            this.#lastAvailableChatId = activeChatId;
            for (const lease of [...this.#active.values()]) {
                if (lease.chatId === activeChatId) continue;
                lease.controller.abort();
                if (lease.manual) this.#manualRuns.set(lease.chatId, {
                    status: 'interrupted', requestedRange: cloneJson(lease.requestedRange),
                    floorRange: cloneJson(lease.floorRange),
                    error: { code: 'summary_interrupted', message: '手动总结因切换聊天而中断，可返回原聊天后重试。' },
                });
                this.#active.delete(lease.chatId);
            }
            this.#regenerationReviews.clear();
            this.#nextReplyRequests.clear();
            if (['running', 'pause-requested'].includes(this.#backfillSession?.status)) {
                this.#backfillSession.status = 'interrupted';
                this.#backfillSession.currentRange = null;
                this.#backfillSession.lastError = { code: 'summary_interrupted', message: '补录因切换聊天而中断，请返回原聊天后手动继续。' };
            }
            this.#notifyStateChanged();
        }) ?? false;
    }

    installProviderStatusLifecycle(onChanged) {
        if (typeof onChanged !== 'function') throw new TypeError('onChanged 必须是函数。');
        if (typeof this.#providerStatusDisposer === 'function') this.#providerStatusDisposer();
        const dispose = this.summaryProvider.onStatusChanged?.(() => onChanged(this.providerState()));
        this.#providerStatusDisposer = typeof dispose === 'function' ? dispose : null;
        return () => {
            if (this.#providerStatusDisposer !== dispose) return;
            dispose?.();
            this.#providerStatusDisposer = null;
        };
    }

    runtimeState() {
        const chatId = this.summaryChatAdapter.currentChatId();
        const lease = this.#active.get(chatId);
        return lease ? { status: 'running', taskId: lease.taskId, attemptId: lease.attemptId } : { status: 'idle' };
    }

    providerState() {
        return cloneJson(this.summaryProvider.describe());
    }

    pendingReview() {
        const chatId = this.summaryChatAdapter.currentChatId();
        return cloneJson(this.#regenerationReviews.get(chatId)
            ?? this.chatDataService.readCurrent().summary?.pendingManualReview ?? null);
    }

    regenerationBatchOptions() {
        const snapshot = this.summaryChatAdapter.readCurrent();
        const root = this.chatDataService.readCurrent();
        return cloneJson(projectSummaryBatches({
            chatLength: snapshot.chat.length,
            summary: root.summary,
            memories: root.memories,
        }).filter(batch => batch?.outcome === 'memories' && !batch.retired));
    }

    async regenerateBatch({ batchId, signal, request = null } = {}) {
        const snapshot = this.summaryChatAdapter.readCurrent();
        const root = this.chatDataService.readCurrent();
        const batch = (root.summary?.batches ?? []).find(item => item?.id === batchId);
        if (!batch || batch.status !== 'completed' || batch.outcome !== 'memories' || batch.invalidatedAt || batch.retiredAt) {
            throw new SummaryDomainError('summary_batch_not_regenerable', '这个总结批次已失效或不是可重新生成的批次。');
        }
        const batchMemories = root.memories.filter(item => item?.source?.batchId === batchId);
        if (batchMemories.some(memory => typeof memory?.supersededBy === 'string' && memory.supersededBy.trim())) {
            throw new SummaryDomainError('summary_batch_merge_chain', '这个批次的派生记忆已参与合并，不能破坏现有撤销关系。');
        }
        const activeMemories = batchMemories.filter(isActiveMemory);
        const memoryIds = activeMemories.map(item => item.id);
        if (!Array.isArray(batch.floorRange) || batch.floorRange.length !== 2
            || !batch.floorRange.every(value => Number.isSafeInteger(value) && value >= 0)
            || batch.floorRange[1] >= snapshot.chat.length) {
            throw new SummaryDomainError('summary_batch_source_unavailable', '这个批次的原始楼层已不可用，不能安全重新生成。');
        }
        return this.start({
            ...(request ?? {}),
            startFloor: batch.requestedRange?.[0] ?? batch.floorRange[0],
            endFloor: batch.requestedRange?.[1] ?? batch.floorRange[1],
        }, {
            signal,
            regeneration: {
                batchId,
                sourceType: batch.sourceType,
                batchSnapshot: cloneJson(batch),
                memoryIds,
                memorySnapshot: activeMemories.map(item => cloneJson(item)),
                anniversaryIds: root.anniversaries.filter(item => item?.source?.batchId === batchId).map(item => item.id),
                anniversarySnapshot: root.anniversaries.filter(item => item?.source?.batchId === batchId).map(item => cloneJson(item)),
                sourceSnapshot: cloneJson(snapshot.chat.slice(batch.floorRange[0], batch.floorRange[1] + 1)
                    .map(item => ({ is_user: item?.is_user, is_system: item?.is_system, mes: item?.mes, send_date: item?.send_date }))),
            },
        });
    }

    coverage() {
        const chat = this.summaryChatAdapter.readCurrent().chat;
        const root = this.chatDataService.readCurrent();
        return buildSummaryCoverage(chat, root.summary, root.memories);
    }

    async excludeFloor(floor) {
        const snapshot = this.summaryChatAdapter.readCurrent();
        const message = summaryMessageAt(snapshot.chat, floor);
        let result = null;
        await this.chatDataService.updateCurrent(root => {
            result = markSummaryFloorExcluded(root.summary, {
                id: this.idFactory('summary-exclusion'),
                floor,
                markedAt: isoNow(this.now),
                identity: {
                    role: message.is_user ? 'user' : 'assistant',
                    ...(typeof message.send_date === 'string' || Number.isSafeInteger(message.send_date)
                        ? { sendDate: message.send_date } : {}),
                },
            });
        });
        this.#notifyStateChanged();
        return cloneJson(result);
    }

    async includeFloor(floor) {
        const snapshot = this.summaryChatAdapter.readCurrent();
        summaryMessageAt(snapshot.chat, floor);
        let result = null;
        await this.chatDataService.updateCurrent(root => {
            result = unmarkSummaryFloorExcluded(root.summary, floor);
        });
        this.#notifyStateChanged();
        return cloneJson(result);
    }

    #notifyStateChanged() {
        try { Promise.resolve(this.onStateChanged()).catch(() => {}); } catch { /* UI feedback cannot change a committed result. */ }
    }

    autoState() {
        const chatId = this.summaryChatAdapter.currentChatId();
        const chat = this.summaryChatAdapter.readCurrent().chat;
        const summary = this.chatDataService.readCurrent().summary;
        const state = automaticSummaryState(chat, summary);
        const nextStart = state.progress.lastProcessedFloor === null
            ? state.progress.startFloor : state.progress.lastProcessedFloor + 1;
        const plannedRange = [nextStart, nextStart + state.auto.batchSize - 1];
        const runtime = this.#automaticRuntime.get(chatId);
        const persistedBackfill = state.pendingAuto?.origin === 'backfill' && state.pendingAuto.backfill
            ? { ...state.pendingAuto.backfill, chatId: state.pendingAuto.chatId,
                status: state.pendingAuto.status === 'running' ? 'running'
                    : state.pendingAuto.status === 'interrupted' ? 'interrupted' : 'failed',
                currentRange: cloneJson(state.pendingAuto.floorRange), lastError: cloneJson(state.pendingAuto.error ?? null) }
            : null;
        return {
            chatId,
            ...state,
            nextReplyRequested: this.#nextReplyRequests.has(chatId),
            plannedRange: summary.auto.uncoveredOnly ? selectAutomaticSummaryRange(chat, summary)?.floorRange ?? null : plannedRange,
            recentObservation: cloneJson(this.#automaticObservations.get(chatId) ?? null),
            pendingAuto: state.pendingAuto ? { ...state.pendingAuto, ...(runtime ? { stage: runtime.stage } : {}) } : null,
            backfillPlan: planAutomaticSummaryBackfill(chat, summary),
            backfill: cloneJson(this.#backfillSession?.chatId === chatId ? this.#backfillSession : persistedBackfill),
        };
    }

    setAutomaticObservation({ chatId, code, messageId = null, metadata = {} } = {}) {
        const allowedCodes = new Set([
            'generation_started', 'ignored_regenerate', 'ignored_swipe', 'ignored_continue', 'ignored_generation',
            'stopped', 'awaiting_completion', 'checking', 'invalid_round', 'disabled', 'not_enough_floors',
            'source_unavailable', 'busy', 'duplicate', 'interrupted', 'queued', 'succeeded', 'failed', 'skipped', 'excluded',
            'source_deleted', 'deletion_unresolved',
        ]);
        if (typeof chatId !== 'string' || !chatId.trim()) throw new TypeError('chatId 不可用。');
        if (!allowedCodes.has(code)) throw new TypeError('自动总结观察代码无效。');
        if (messageId !== null && typeof messageId !== 'string') throw new TypeError('messageId 必须是字符串或 null。');
        const safeMetadata = {};
        if (typeof metadata?.receivedReply === 'boolean') safeMetadata.receivedReply = metadata.receivedReply;
        for (const key of ['startFloor', 'endFloor', 'eligibleEndFloor', 'retainedStartFloor', 'itemCount']) {
            if (Number.isSafeInteger(metadata?.[key]) && metadata[key] >= 0) safeMetadata[key] = metadata[key];
        }
        if (['preparing', 'body', 'keywords', 'storing'].includes(metadata?.stage)) safeMetadata.stage = metadata.stage;
        if (typeof metadata?.errorCode === 'string' && metadata.errorCode.length <= 80) safeMetadata.errorCode = metadata.errorCode;
        const observation = { code, at: isoNow(this.now), messageId, metadata: safeMetadata };
        this.#automaticObservations.set(chatId, observation);
        if (chatId === this.summaryChatAdapter.currentChatId()) this.#notifyStateChanged();
        return cloneJson(observation);
    }

    #observe(code, metadata = {}, chatId = this.summaryChatAdapter.currentChatId()) {
        return this.setAutomaticObservation({ chatId, code, metadata });
    }

    #setAutomaticStage(chatId, stage, floorRange) {
        this.#automaticRuntime.set(chatId, { stage, floorRange: cloneJson(floorRange) });
        this.#observe('queued', {
            receivedReply: true,
            stage,
            startFloor: floorRange?.[0],
            endFloor: floorRange?.[1],
        }, chatId);
    }

    async configureAuto(options = {}) {
        if (this.#backfillSession?.chatId === this.summaryChatAdapter.currentChatId()
            && ['running', 'pause-requested'].includes(this.#backfillSession.status)) {
            throw new SummaryDomainError('summary_busy', '补录进行中，批次和保留楼层参数已锁定。');
        }
        const current = this.chatDataService.readCurrent().summary;
        const auto = { ...current.auto };
        for (const key of ['enabled', 'hideSummarizedFloors']) if (key in options) auto[key] = options[key] === true;
        for (const [key, fallback, minimum] of [['batchSize', 15, 1], ['retainedFloors', 6, 0]]) {
            const value = Number(options[key] ?? auto[key] ?? fallback);
            if (!Number.isSafeInteger(value) || value < minimum) throw new SummaryDomainError('invalid_auto_settings', '请填写有效的批次和保留楼层数。');
            auto[key] = value;
        }
        const chat = this.summaryChatAdapter.readCurrent().chat;
        let startFloor = current.progress.startFloor;
        if (!auto.initialized && current.progress.lastProcessedFloor === null) {
            if (options.startFromRecent === true) startFloor = Math.max(0, chat.length - auto.retainedFloors);
            else if (options.startFloor !== undefined) startFloor = Number(options.startFloor);
            if (!Number.isSafeInteger(startFloor) || startFloor < 0 || startFloor > chat.length) throw new SummaryDomainError('invalid_floor_range', '起始楼层无效。');
            if (auto.enabled && !options.startFromRecent && options.startBackfill !== true && selectAutomaticSummaryRange(chat, { ...current, auto, progress: { ...current.progress, startFloor } })) {
                throw new SummaryDomainError('auto_backlog_choice_required', '已有旧楼层可总结。请选择立即补录，或从最近保留区开始。');
            }
        }
        await this.chatDataService.updateCurrent(root => {
            root.summary.auto = { ...root.summary.auto, enabled: auto.enabled, batchSize: auto.batchSize,
                retainedFloors: auto.retainedFloors, hideSummarizedFloors: auto.hideSummarizedFloors };
            if (!root.summary.auto.initialized && root.summary.progress.lastProcessedFloor === null) root.summary.progress.startFloor = startFloor;
        });
        return this.autoState();
    }

    async resetAutomaticStart(startFloor) {
        const chatId = this.summaryChatAdapter.currentChatId();
        const floor = Number(startFloor);
        if (String(startFloor ?? '').trim() === '' || !Number.isSafeInteger(floor) || floor < 0 || floor > this.summaryChatAdapter.readCurrent().chat.length) throw new SummaryDomainError('invalid_floor_range', '起始楼层无效。');
        const lease = this.#active.get(chatId);
        if (lease && !lease.automatic) throw new SummaryDomainError('summary_busy', '请先处理当前手动总结任务。');
        lease?.controller.abort();
        await this.chatDataService.updateCurrent(root => {
            if (this.summaryChatAdapter.currentChatId() !== chatId) throw new SummaryDomainError('summary_interrupted', '聊天已切换。');
            if (root.summary.pendingManualReview) throw new SummaryDomainError('summary_busy', '请先处理当前手动总结任务。');
            const resetAt = isoNow(this.now);
            root.summary.progress.startFloor = floor;
            root.summary.progress.lastProcessedFloor = null;
            const automaticBatchIds = new Set((root.summary.batches ?? [])
                .filter(batch => batch?.sourceType === 'auto-summary').map(batch => batch.id));
            root.summary.hiddenSegments = (root.summary.hiddenSegments ?? []).map(segment => {
                if (segment.status !== 'active' || !automaticBatchIds.has(segment.batchId)
                    || !Array.isArray(segment.floorRange) || segment.floorRange.length !== 2
                    || segment.floorRange[1] < floor) return segment;
                if (segment.floorRange[0] < floor) return { ...segment, floorRange: [segment.floorRange[0], floor - 1] };
                return { ...segment, status: 'invalidated', invalidatedAt: resetAt, invalidationReason: 'automatic_run_reset' };
            });
            root.summary.batches = (root.summary.batches ?? []).map(batch => ({
                ...batch,
                retiredAt: resetAt,
                retirementReason: 'automatic_run_reset',
            }));
            const referencedBatchIds = new Set([
                ...(root.memories ?? []).map(memory => memory?.source?.batchId),
                ...(root.anniversaries ?? []).map(item => item?.source?.batchId),
                ...(root.summary.hiddenSegments ?? [])
                    .filter(segment => segment?.status === 'active')
                    .map(segment => segment?.batchId),
            ].filter(Boolean));
            root.summary.batches = root.summary.batches.filter(batch => referencedBatchIds.has(batch.id));
            root.summary.nextBatchOrdinal = 1;
            root.summary.pendingAuto = null;
            root.summary.lastResult = null;
            root.summary.lastSuccessfulInput = null;
            root.summary.auto.uncoveredOnly = false;
            root.summary.auto.initialized = true;
            root.summary.auto.lastCheckpointId = null;
        });
        if (this.#active.get(chatId) === lease) this.#active.delete(chatId);
        if (this.#backfillSession?.chatId === chatId) this.#backfillSession = null;
        this.#automaticRuntime.delete(chatId);
        this.#automaticObservations.delete(chatId);
        this.#nextReplyRequests.delete(chatId);
        this.#notifyStateChanged();
        return this.autoState();
    }

    manualState() {
        return cloneJson(this.#manualRuns.get(this.summaryChatAdapter.currentChatId()) ?? { status: 'idle' });
    }

    uncoveredPlan(batchCount) {
        return planUncoveredRanges(this.coverage(), batchCount);
    }

    #assertUncovered(range, summary, taskId = null) {
        const clean = { ...summary, pendingAuto: summary.pendingAuto?.taskId === taskId ? null : summary.pendingAuto,
            pendingManualReview: summary.pendingManualReview?.taskId === taskId ? null : summary.pendingManualReview };
        const free = buildSummaryCoverage(this.summaryChatAdapter.readCurrent().chat, clean).summarizable;
        if (!free.some(([a, b]) => range[0] >= a && range[1] <= b)) throw new SummaryDomainError('summary_range_protected', '范围已变化或包含已处理／跳过／排除／最近保留楼层，请重新查看总结范围。');
    }

    async recoverAutomatic() {
        if (this.#active.has(this.summaryChatAdapter.currentChatId())) return this.autoState();
        if (this.chatDataService.readCurrent().summary.pendingAuto?.status === 'running') {
            await this.chatDataService.updateCurrent(root => {
                if (root.summary.pendingAuto?.status !== 'running') return;
                root.summary.pendingAuto.status = 'interrupted';
                root.summary.pendingAuto.error = { code: 'summary_interrupted', message: '总结因切换聊天或重载中断，请手动继续。' };
            });
            this.#observe('interrupted', { receivedReply: false });
        }
        return this.autoState();
    }

    requestNextReplySummary({ cancel = false } = {}) {
        const chatId = this.summaryChatAdapter.currentChatId();
        if (cancel) { this.#nextReplyRequests.delete(chatId); return this.autoState(); }
        const summary = this.chatDataService.readCurrent().summary;
        if (this.#active.has(chatId) || summary.pendingAuto || summary.pendingManualReview
            || ['running', 'pause-requested', 'paused', 'failed', 'interrupted'].includes(this.#backfillSession?.chatId === chatId ? this.#backfillSession.status : null)) {
            throw new SummaryDomainError('summary_busy', '请先处理当前总结任务。');
        }
        this.#nextReplyRequests.add(chatId);
        return this.autoState();
    }

    async processAutomaticTurn({ checkpointId } = {}) {
        const summary = this.chatDataService.readCurrent().summary;
        const chatId = this.summaryChatAdapter.currentChatId();
        const oneShot = this.#nextReplyRequests.has(chatId);
        const receivedReply = Boolean(checkpointId);
        if (!summary.auto.enabled && !oneShot) { this.#observe('disabled', { receivedReply }, chatId); return { status: 'idle' }; }
        if (!checkpointId) { this.#observe('invalid_round', { receivedReply: false }, chatId); return { status: 'idle' }; }
        if (summary.auto.lastCheckpointId === checkpointId) { this.#observe('duplicate', { receivedReply: true }, chatId); return { status: 'idle' }; }
        // Consume only a new normal reply; this never enables ongoing automatic scheduling.
        if (oneShot) this.#nextReplyRequests.delete(chatId);
        if (oneShot && summary.pendingManualReview) { this.#observe('busy', { receivedReply: true }, chatId); return { status: 'idle' }; }
        if (summary.pendingAuto?.origin === 'backfill'
            || (this.#backfillSession?.chatId === chatId && ['running', 'pause-requested', 'paused', 'failed', 'interrupted'].includes(this.#backfillSession.status))) {
            this.#observe('busy', { receivedReply: true }, chatId);
            return { status: 'idle' };
        }
        if (this.#active.has(chatId)) { this.#observe('busy', { receivedReply: true }, chatId); return { status: 'idle' }; }
        if (summary.pendingAuto?.status === 'interrupted') { this.#observe('interrupted', { receivedReply: true }, chatId); return { status: 'idle' }; }
        this.#observe('checking', { receivedReply: true }, chatId);
        let selection;
        if (!summary.pendingAuto) selection = selectAutomaticSummaryRange(this.summaryChatAdapter.readCurrent().chat,
            oneShot ? { ...summary, auto: { ...summary.auto, uncoveredOnly: true } } : summary);
        if (!summary.pendingAuto && !selection) {
            const startFloor = summary.progress.lastProcessedFloor === null ? summary.progress.startFloor : summary.progress.lastProcessedFloor + 1;
            this.#observe('not_enough_floors', {
                receivedReply: true,
                startFloor,
                endFloor: startFloor + (summary.auto.batchSize ?? 15) - 1,
                eligibleEndFloor: Math.max(0, this.summaryChatAdapter.readCurrent().chat.length - 1 - (summary.auto.retainedFloors ?? 6)),
                retainedStartFloor: Math.max(0, this.summaryChatAdapter.readCurrent().chat.length - (summary.auto.retainedFloors ?? 6)),
            }, chatId);
            return { status: 'idle' };
        }
        let effectiveSelection = selection;
        if (!effectiveSelection && summary.pendingAuto) {
            try {
                effectiveSelection = selectContinuousSummaryFloors(this.summaryChatAdapter.readCurrent().chat, {
                    startFloor: summary.pendingAuto.requestedRange?.[0],
                    endFloor: summary.pendingAuto.requestedRange?.[1],
                });
            } catch { /* The normal retry path records an invalid source range. */ }
        }
        const fullyExcluded = effectiveSelection
            ? !filterExcludedSummaryFloors(effectiveSelection.floors,
                summaryExclusionPolicy(summary, effectiveSelection.floorRange)).length
            : false;
        if (this.providerState().available === false && !fullyExcluded) {
            this.#observe('source_unavailable', { receivedReply: true }, chatId);
            return { status: 'idle' };
        }
        // Persist checkpoint and task before starting network work. The queue checks again for racing events.
        let claimed = false;
        await this.chatDataService.updateCurrent(root => {
            if ((!root.summary.auto.enabled && !oneShot) || root.summary.auto.lastCheckpointId === checkpointId || root.summary.pendingAuto?.status === 'running') return;
            root.summary.auto.lastCheckpointId = checkpointId;
            root.summary.auto.initialized = true;
            root.summary.pendingAuto ??= { taskId: this.idFactory('auto-summary-task'), chatId: root.chatId,
                uncoveredOnly: oneShot || root.summary.auto.uncoveredOnly === true,
                sourceType: 'auto-summary', status: 'ready', requestedRange: selection.requestedRange, floorRange: selection.floorRange,
                batchSize: root.summary.auto.batchSize ?? 15, retainedFloors: root.summary.auto.retainedFloors ?? 6, attempts: 0, createdAt: isoNow(this.now) };
            claimed = true;
        });
        if (!claimed) { this.#observe('duplicate', { receivedReply: true }, chatId); return { status: 'idle' }; }
        this.#setAutomaticStage(chatId, 'preparing', selection?.floorRange ?? summary.pendingAuto?.floorRange);
        return this.retryAutomatic();
    }

    async retryAutomatic() {
        const pending = this.chatDataService.readCurrent().summary.pendingAuto;
        if (!pending) { this.#observe('invalid_round', { receivedReply: false }); return { status: 'idle' }; }
        const chatId = this.summaryChatAdapter.currentChatId();
        try {
            return await this.start({ startFloor: pending.requestedRange[0], endFloor: pending.requestedRange[1],
                ...(pending.generationMode ? { mode: pending.generationMode } : {}) }, { automaticTask: pending });
        } catch (error) {
            if (error.code === 'summary_busy') throw error;
            const safeError = { code: error.code ?? 'summary_failed', message: '自动总结未入库，请检查范围、清洗或 API 设置后重试。' };
            if (this.summaryChatAdapter.currentChatId() === chatId) {
                let retained = false;
                await this.chatDataService.updateCurrent(root => {
                    if (root.summary.pendingAuto?.taskId !== pending.taskId) return;
                    root.summary.pendingAuto.status = error.code === 'summary_interrupted' ? 'interrupted' : 'failed';
                    root.summary.pendingAuto.error = safeError;
                    root.summary.lastResult = { status: 'failed', taskId: pending.taskId, floorRange: pending.floorRange, error: safeError };
                    retained = true;
                });
                if (retained) {
                    this.#observe(error.code === 'summary_interrupted' ? 'interrupted' : 'failed', {
                        receivedReply: true, startFloor: pending.floorRange?.[0], endFloor: pending.floorRange?.[1], errorCode: safeError.code,
                    }, chatId);
                }
            }
            return { status: error.code === 'summary_interrupted' ? 'interrupted' : 'failed', error: safeError };
        }
    }

    async startBackfill({ maxBatches = null } = {}) {
        const chatId = this.summaryChatAdapter.currentChatId();
        if (this.#active.has(chatId) || ['running', 'pause-requested'].includes(this.#backfillSession?.status)) {
            throw new SummaryDomainError('summary_busy', '当前聊天已有总结任务。');
        }
        const initial = this.chatDataService.readCurrent().summary;
        const currentChat = this.summaryChatAdapter.readCurrent().chat;
        const plan = planAutomaticSummaryBackfill(currentChat, initial);
        const pending = initial.pendingAuto;
        if (this.providerState().available === false) {
            let firstSelection = null;
            try {
                firstSelection = pending
                    ? selectContinuousSummaryFloors(currentChat, {
                        startFloor: pending.requestedRange?.[0], endFloor: pending.requestedRange?.[1],
                    })
                    : selectAutomaticSummaryRange(currentChat, initial);
            } catch { /* The normal task path reports an invalid range. */ }
            const fullyExcluded = firstSelection
                ? !filterExcludedSummaryFloors(firstSelection.floors,
                    summaryExclusionPolicy(initial, firstSelection.floorRange)).length
                : false;
            if (!fullyExcluded) throw new SummaryDomainError('summary_provider_unavailable', '当前 AI 来源不可用。');
        }
        if (pending?.status === 'running') throw new SummaryDomainError('summary_busy', '当前聊天已有总结任务。');
        const availableBatches = Math.max(plan.fullBatchCount, pending ? 1 : 0);
        if (!availableBatches) throw new SummaryDomainError('backfill_incomplete_batch', '当前不足一个完整批次，已保留待以后自动处理。');
        const requestedLimit = maxBatches == null ? availableBatches : Number(maxBatches);
        if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) throw new SummaryDomainError('invalid_backfill_limit', '补录批次数无效。');
        const totalBatches = Math.min(availableBatches, requestedLimit);
        const session = { id: this.idFactory('summary-backfill'), chatId, status: 'running', completedBatches: 0,
            totalBatches, currentRange: null, targetEnd: plan.eligibleEnd, remainder: plan.remainder, lastError: null };
        this.#backfillSession = session;
        this.#notifyStateChanged();
        try {
            while (session.completedBatches < session.totalBatches) {
                if (this.summaryChatAdapter.currentChatId() !== chatId) throw new SummaryDomainError('summary_interrupted', '补录因切换聊天而中断。');
                if (session.status === 'interrupted') return cloneJson(session);
                if (session.status === 'pause-requested') {
                    session.status = 'paused'; session.currentRange = null; this.#notifyStateChanged();
                    return cloneJson(session);
                }
                let task = this.chatDataService.readCurrent().summary.pendingAuto;
                if (!task) {
                    const root = this.chatDataService.readCurrent();
                    const selection = selectAutomaticSummaryRange(this.summaryChatAdapter.readCurrent().chat, root.summary);
                    if (!selection || selection.requestedRange[1] > session.targetEnd) break;
                    await this.chatDataService.updateCurrent(next => {
                        if (session.status === 'interrupted' || this.summaryChatAdapter.currentChatId() !== chatId) return;
                        if (next.summary.pendingAuto) return;
                        next.summary.auto.initialized = true;
                        next.summary.pendingAuto = { taskId: this.idFactory('auto-summary-task'), chatId: next.chatId,
                            uncoveredOnly: next.summary.auto.uncoveredOnly === true,
                            sourceType: 'auto-summary', origin: 'backfill', backfill: { id: session.id, targetEnd: session.targetEnd,
                                totalBatches: session.totalBatches, completedBatches: session.completedBatches, remainder: session.remainder },
                            status: 'ready', requestedRange: selection.requestedRange, floorRange: selection.floorRange,
                            batchSize: next.summary.auto.batchSize ?? 15, retainedFloors: next.summary.auto.retainedFloors ?? 6,
                            attempts: 0, createdAt: isoNow(this.now) };
                    });
                    if (session.status === 'interrupted' || this.summaryChatAdapter.currentChatId() !== chatId) {
                        throw new SummaryDomainError('summary_interrupted', '补录因切换聊天而中断。');
                    }
                    task = this.chatDataService.readCurrent().summary.pendingAuto;
                } else {
                    await this.chatDataService.updateCurrent(root => {
                        if (session.status === 'interrupted' || this.summaryChatAdapter.currentChatId() !== chatId) return;
                        if (root.summary.pendingAuto?.taskId !== task.taskId) return;
                        root.summary.pendingAuto.origin = 'backfill';
                        root.summary.pendingAuto.backfill = { id: session.id, targetEnd: session.targetEnd,
                            totalBatches: session.totalBatches, completedBatches: session.completedBatches, remainder: session.remainder };
                    });
                    if (session.status === 'interrupted' || this.summaryChatAdapter.currentChatId() !== chatId) {
                        throw new SummaryDomainError('summary_interrupted', '补录因切换聊天而中断。');
                    }
                    task = this.chatDataService.readCurrent().summary.pendingAuto;
                }
                if (!task) break;
                session.currentRange = cloneJson(task.floorRange);
                this.#setAutomaticStage(chatId, 'preparing', task.floorRange);
                this.#notifyStateChanged();
                const result = await this.retryAutomatic();
                if (session.status === 'interrupted') return cloneJson(session);
                if (result.status !== 'completed') {
                    session.status = result.status === 'interrupted' ? 'interrupted' : 'failed';
                    session.lastError = cloneJson(result.error ?? this.chatDataService.readCurrent().summary.pendingAuto?.error ?? null);
                    this.#notifyStateChanged();
                    return cloneJson(session);
                }
                session.completedBatches += 1; session.currentRange = null; this.#notifyStateChanged();
            }
            session.status = session.completedBatches >= session.totalBatches ? 'completed'
                : session.status === 'pause-requested' ? 'paused' : 'completed';
            session.currentRange = null; this.#notifyStateChanged();
            return cloneJson(session);
        } catch (error) {
            session.status = error.code === 'summary_interrupted' ? 'interrupted' : 'failed';
            session.currentRange = null;
            session.lastError = { code: error.code ?? 'summary_failed', message: error.message ?? '补录失败。' };
            this.#notifyStateChanged();
            return cloneJson(session);
        }
    }

    requestBackfillPause() {
        if (this.#backfillSession?.chatId !== this.summaryChatAdapter.currentChatId()
            || this.#backfillSession.status !== 'running') return this.autoState();
        this.#backfillSession.status = 'pause-requested';
        this.#notifyStateChanged();
        return this.autoState();
    }

    async skipAutomatic({ confirmed = false } = {}) {
        if (!confirmed) throw new SummaryDomainError('confirmation_required', '跳过需要明确确认。');
        if (this.#active.has(this.summaryChatAdapter.currentChatId())) throw new SummaryDomainError('summary_busy', '请等待当前总结结束后再跳过。');
        await this.chatDataService.updateCurrent(root => {
            const task = root.summary.pendingAuto;
            if (!task) return;
            const id = this.idFactory('summary-batch');
            const hideApplied = root.summary.auto.hideSummarizedFloors !== false;
            root.summary.batches.push({ id, taskId: task.taskId, ordinal: null, sourceType: 'auto-summary', outcome: 'skipped', status: 'completed', requestedRange: task.requestedRange, floorRange: task.floorRange, itemCount: 0, hideApplied, completedAt: isoNow(this.now) });
            if (hideApplied) (root.summary.hiddenSegments ??= []).push({ id: this.idFactory('hidden-segment'), batchId: id, floorRange: task.floorRange, status: 'active' });
            root.summary.progress.lastProcessedFloor = Math.max(root.summary.progress.lastProcessedFloor ?? -1, task.floorRange[1]);
            root.summary.pendingAuto = null;
            root.summary.lastResult = { status: 'skipped', taskId: task.taskId, floorRange: task.floorRange };
        });
        this.#observe('skipped', { receivedReply: false });
        return this.autoState();
    }

    #build(request, { allowFullyExcluded = false } = {}) {
        const snapshot = this.summaryChatAdapter.readCurrent();
        const selection = selectContinuousSummaryFloors(snapshot.chat, request);
        const root = this.chatDataService.readCurrent();
        const exclusionPolicy = summaryExclusionPolicy(root.summary, selection.floorRange);
        const selectedFloors = filterExcludedSummaryFloors(selection.floors, exclusionPolicy);
        if (!selectedFloors.length) {
            if (allowFullyExcluded) {
                return { chatId: snapshot.chatId, selection, exclusionPolicy, fullyExcluded: true };
            }
            throw new SummaryDomainError('summary_all_floors_excluded', '所选楼层均已标记为不参与总结，请先撤销至少一楼。');
        }
        const settings = this.getGlobalSettings();
        const mode = ['fast', 'quality', 'enhanced'].includes(request?.mode)
            ? request.mode
            : (['fast', 'quality', 'enhanced'].includes(settings?.summary?.generationMode) ? settings.summary.generationMode : 'quality');
        const skipUserMessages = request?.skipUserMessages
            ?? settings?.defaults?.summary?.skipUserMessages
            ?? false;
        const cleanedFloors = cleanSummaryFloors(selectedFloors, {
            rules: settings?.summary?.cleaning?.rules,
            skipUserMessages,
        });
        if (!cleanedFloors.length) {
            throw new SummaryDomainError('empty_summary_source', '总结清洗后没有可发送的有效正文。');
        }
        const source = sourceForAssembler(cleanedFloors);
        const promptOverrides = settings?.summary?.promptOverrides ?? null;
        const eventKeywords = effectiveEventLibrary(settings?.summary);
        const compiled = mode === 'fast'
            ? forProvider(assemblePromptTask({
                task: 'fast', source, eventKeywords,
                promptOverrides, generationMode: mode,
            }), 'combined', eventKeywordValidationOptions(eventKeywords))
            : forProvider(assemblePromptTask({
                task: 'quality_stage_a', source,
                promptOverrides, generationMode: mode,
            }), 'summary-draft');
        const prepared = this.summaryProvider.prepare(compiled);
        const duplicateBatch = latestDuplicateBatch(root.summary, selection.requestedRange);
        const warnings = duplicateBatch
            ? [{
                code: 'duplicate_floor_range',
                batchId: duplicateBatch.id,
                requestedRange: cloneJson(selection.requestedRange),
                floorRange: cloneJson(selection.floorRange),
            }]
            : [];
        return {
            chatId: snapshot.chatId,
            selection,
            exclusionPolicy,
            cleanedFloors,
            compiled,
            prepared,
            warnings,
            provider: prepared.provider,
            manualReviewEnabled: settings?.summary?.manualReviewEnabled !== false,
            promptOverrides,
            eventKeywords,
            customEventLibrary: settings?.summary?.eventLibraryOverride !== null
                && settings?.summary?.eventLibraryOverride !== undefined,
            mode,
        };
    }

    preview(request) {
        const built = this.#build(request);
        return cloneJson({
            requestedRange: built.selection.requestedRange,
            floorRange: built.selection.floorRange,
            endAdjusted: built.selection.endAdjusted,
            exclusionPolicy: built.exclusionPolicy,
            messages: built.prepared.messages,
            sourceFloors: sourceForAssembler(built.cleanedFloors),
            promptParts: promptPreviewParts(built.compiled),
            secondPromptParts: built.mode !== 'fast' ? qualityStageBPreviewParts(built) : null,
            thirdPromptParts: built.mode === 'enhanced' ? promptPreviewParts(assemblePromptTask({task:'quality_stage_c',
                drafts:[{draftId:'preview',body:'前两次生成的正文和关键词将在生成后填入。',detailKeywords:[]}],promptOverrides:built.promptOverrides,generationMode:'enhanced'})) : null,
            promptTransportMode: built.provider.roleMode,
            jsonSchema: built.compiled.jsonSchema,
            provider: built.provider,
            warnings: built.warnings,
            mode: built.mode,
            stages: built.mode === 'enhanced' ? 3 : built.mode === 'quality' ? 2 : 1,
        });
    }

    async start(request, { signal, automaticTask = null, regeneration = null } = {}) {
        const built = this.#build(request, { allowFullyExcluded: Boolean(automaticTask) });
        const duplicateBatchId = !automaticTask && !regeneration
            ? built.warnings.find(item => item.code === 'duplicate_floor_range')?.batchId
            : null;
        if (duplicateBatchId) {
            return this.regenerateBatch({ batchId: duplicateBatchId, signal, request });
        }
        built.uncoveredOnly = request?.uncoveredOnly === true || automaticTask?.uncoveredOnly === true;
        if (built.uncoveredOnly && (this.pendingReview() || (!automaticTask && this.chatDataService.readCurrent().summary.pendingAuto))) throw new SummaryDomainError('summary_busy', '请先处理当前总结任务。');
        if (built.uncoveredOnly) this.#assertUncovered(built.selection.requestedRange, this.chatDataService.readCurrent().summary, automaticTask?.taskId);
        if (this.#active.has(built.chatId)) {
            throw new SummaryDomainError('summary_busy', '当前聊天已有手动总结正在调用 AI。');
        }
        if (built.fullyExcluded) return this.#completeExcludedAutomatic(built, automaticTask);
        const retainedAliases = automaticTask?.generationMode === 'enhanced'
            && automaticTask?.keywordState === 'fresh'
            && ['pending', 'failed'].includes(automaticTask?.aliasState);
        const retainedDrafts = retainedAliases || automaticTask?.keywordState === 'failed'
            ? automaticTask.candidates : null;
        if (retainedDrafts
            && !sameSummaryExclusionPolicy(automaticTask.exclusionPolicy, built.exclusionPolicy)) {
            throw new SummaryDomainError('summary_source_changed', '本次总结的不参与楼层设置已变更，请重新开始。');
        }
        const taskId = automaticTask?.taskId ?? this.idFactory('summary-task');
        const attemptId = this.idFactory('summary-attempt');
        const controller = new AbortController();
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        const manual = !automaticTask && !regeneration;
        const lease = {
            chatId: built.chatId, taskId, attemptId, controller, automatic: Boolean(automaticTask), manual,
            requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange),
        };
        this.#active.set(built.chatId, lease);
        if (manual) {
            this.#manualRuns.set(built.chatId, { status: 'running', taskId,
                requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange) });
            this.#notifyStateChanged();
        }
        try {
            if (!regeneration) await this.chatDataService.updateCurrent(root => {
                this.#assertLease(lease);
                if (built.uncoveredOnly) {
                    if (root.summary.pendingManualReview || (!automaticTask && root.summary.pendingAuto)) throw new SummaryDomainError('summary_busy', '请先处理当前总结任务。');
                    this.#assertUncovered(built.selection.requestedRange, root.summary, automaticTask?.taskId);
                }
                if (automaticTask) {
                    root.summary.pendingAuto = { ...root.summary.pendingAuto, status: 'running', attemptId,
                        attempts: (root.summary.pendingAuto.attempts ?? 0) + 1,
                        applicationMessages: cloneJson(built.prepared.messages),
                        exclusionPolicy: cloneJson(built.exclusionPolicy), error: null };
                } else root.summary.pendingManualReview = null;
            });
            if (automaticTask) this.#setAutomaticStage(built.chatId, retainedAliases ? 'aliases' : retainedDrafts ? 'keywords' : 'body', built.selection.floorRange);
            if (retainedDrafts) {
                const source = value => ({ main: 'sillytavern', secondary: 'plugin' }[value] ?? value);
                if (source(automaticTask.provider?.source) !== source(built.prepared.provider?.source)) {
                    throw new SummaryDomainError('summary_provider_changed', 'AI 来源已改变，请恢复原来源后再重试关键词。');
                }
            }
            const result = retainedDrafts ? { data: { memories: retainedDrafts }, rawText: automaticTask.rawResponse, provider: automaticTask.provider }
                : await this.summaryProvider.generate(built.prepared, { signal: controller.signal });
            await this.#waitForLeaseChat(lease);
            this.#assertLease(lease);
            let candidates;
            let keywordResult = null;
            let keywordMessages = [];
            if (retainedAliases) {
                candidates = normalizeEditedCandidates(automaticTask.candidates);
                keywordResult = { rawText: automaticTask.keywordRawResponse, provider: automaticTask.keywordProvider };
            } else if (built.mode !== 'fast') {
                const drafts = result.data.memories.map((item, index) => ({
                    ...cloneJson(item),
                    draftId: retainedDrafts ? item.draftId : this.idFactory('summary-draft'),
                    eventOrdinal: index + 1,
                    eventKeywords: [], detailKeywords: [], primaryKeywords: [], auxiliaryKeywords: [],
                }));
                const keywordCompiled = assembleStageB(drafts, built.promptOverrides, built.eventKeywords, built.mode);
                const keywordPrepared = this.summaryProvider.prepare(keywordCompiled);
                try {
                    if (automaticTask) this.#setAutomaticStage(built.chatId, 'keywords', built.selection.floorRange);
                    if (keywordPrepared.provider?.source !== built.prepared.provider?.source) {
                        throw new SummaryDomainError('summary_provider_changed', '两阶段总结期间 AI 来源发生变化；正文草稿已保留，请重试关键词。');
                    }
                    keywordResult = await this.summaryProvider.generate(keywordPrepared, { signal: controller.signal });
                    await this.#waitForLeaseChat(lease);
                    this.#assertLease(lease);
                    const byId = new Map(keywordResult.data.indexes.map(item => [item.draftId, item]));
                    candidates = normalizeEditedCandidates(drafts.map(draft => mergeKeywordIndex(draft, byId.get(draft.draftId))));
                    keywordMessages = keywordPrepared.messages;
                } catch (error) {
                    this.#assertLease(lease);
                    const pending = this.#taskFrom({ built, taskId, attemptId, result, candidates: drafts.map(item => ({
                        ...item,
                        eventKeywords: [], detailKeywords: [], primaryKeywords: [], auxiliaryKeywords: [],
                    })), status: 'keyword-failed', keywordError: error });
                    this.#assertSource(pending);
                    if (regeneration) throw error;
                    await this.chatDataService.updateCurrent(root => { this.#assertLease(lease); if (automaticTask) root.summary.pendingAuto = { ...root.summary.pendingAuto, ...cloneJson(pending), sourceType: 'auto-summary', origin: automaticTask.origin, backfill: cloneJson(automaticTask.backfill ?? null), error: { code: error.code ?? 'summary_failed', message: '关键词生成失败，正文已保留。' } }; else root.summary.pendingManualReview = cloneJson(pending); });
                    if (automaticTask) this.#observe('failed', { receivedReply: true, startFloor: built.selection.floorRange[0], endFloor: built.selection.floorRange[1], stage: 'keywords', errorCode: error.code ?? 'summary_failed' }, built.chatId);
                    if (manual) this.#manualRuns.set(built.chatId, { status: 'review', taskId,
                        requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange) });
                    return { status: 'keyword-failed', pending: cloneJson(pending), warnings: built.warnings, error };
                }
            } else {
                candidates = normalizeEditedCandidates(result.data?.memories?.map((item, index) => ({
                    ...item,
                    draftId: this.idFactory('summary-draft'),
                    eventOrdinal: index + 1,
                    primaryKeywords: [], auxiliaryKeywords: [],
                })));
            }
            let task = {
                taskId,
                attemptId,
                status: 'awaiting-review',
                uncoveredOnly: built.uncoveredOnly,
                sourceType: regeneration?.sourceType ?? (automaticTask ? 'auto-summary' : 'manual-summary'),
                requestedRange: cloneJson(built.selection.requestedRange),
                floorRange: cloneJson(built.selection.floorRange),
                exclusionPolicy: cloneJson(built.exclusionPolicy),
                warnings: cloneJson(built.warnings),
                applicationMessages: cloneJson(retainedAliases ? automaticTask.applicationMessages : [...built.prepared.messages, ...keywordMessages]),
                jsonSchema: cloneJson(built.compiled.jsonSchema),
                rawResponse: result.rawText,
                keywordRawResponse: keywordResult?.rawText ?? null,
                candidates: cloneJson(candidates),
                provider: cloneJson(result.provider),
                keywordProvider: cloneJson(keywordResult?.provider ?? null),
                generationMode: built.mode,
                keywordState: 'fresh',
                createdAt: isoNow(this.now),
                promptOverrides: cloneJson(built.promptOverrides),
                ...(regeneration ? { regeneration: cloneJson(regeneration) } : {}),
            };
            if (built.mode === 'enhanced') {
                const completion = await this.#generateAliases(task, { lease, automaticTask, ephemeral: Boolean(regeneration) });
                task = completion.task;
                candidates = task.candidates;
                if (completion.error) {
                    if (automaticTask) this.#observe('failed', { receivedReply: true, startFloor: task.floorRange[0], endFloor: task.floorRange[1], stage: 'aliases', errorCode: completion.error.code ?? 'summary_failed' }, built.chatId);
                    if (manual) this.#manualRuns.set(built.chatId, { status: 'review', taskId,
                        requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange) });
                    return { status: 'alias-failed', pending: cloneJson(task), warnings: built.warnings, error: completion.error };
                }
            }
            if ((built.manualReviewEnabled || regeneration) && !automaticTask) {
                this.#assertSource(task);
                if (regeneration) this.#regenerationReviews.set(built.chatId, cloneJson(task));
                else await this.chatDataService.updateCurrent(root => {
                    this.#assertLease(lease);
                    if (task.uncoveredOnly) {
                        if (root.summary.pendingManualReview) throw new SummaryDomainError('summary_busy', '待检查候选已变化，不能覆盖。');
                        this.#assertUncovered(task.requestedRange, root.summary, task.taskId);
                    }
                    root.summary.pendingManualReview = cloneJson(task);
                });
                if (manual) this.#manualRuns.set(built.chatId, { status: 'review', taskId,
                    requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange) });
                return { status: 'awaiting-review', pending: cloneJson(task), warnings: built.warnings };
            }
            if (automaticTask) this.#setAutomaticStage(built.chatId, 'storing', built.selection.floorRange);
            const committed = await this.#commit({ task, candidates, requirePending: false, lease });
            if (automaticTask) this.#observe('succeeded', { receivedReply: true, startFloor: built.selection.floorRange[0], endFloor: built.selection.floorRange[1], itemCount: committed.memories?.length ?? 0 }, built.chatId);
            if (manual) this.#manualRuns.set(built.chatId, { status: 'completed', taskId,
                requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange) });
            return { status: 'completed', ...committed, warnings: built.warnings };
        } catch (error) {
            if (manual) this.#manualRuns.set(built.chatId, {
                status: error?.code === 'summary_interrupted' ? 'interrupted' : 'failed', taskId,
                requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange),
                error: { code: error?.code ?? 'summary_failed', message: error?.message ?? '手动总结未完成。' },
            });
            if (automaticTask && this.summaryChatAdapter.currentChatId() === built.chatId && this.#active.get(built.chatId) === lease) {
                let retained = false;
                await this.chatDataService.updateCurrent(root => {
                    if (root.summary.pendingAuto?.taskId !== taskId) return;
                    root.summary.pendingAuto.status = controller.signal.aborted ? 'interrupted' : 'failed';
                    root.summary.pendingAuto.error = { code: error.code ?? 'summary_failed', message: '自动总结未入库，进度和隐藏范围未改变。可重试。' };
                    root.summary.lastResult = { status: 'failed', taskId, floorRange: cloneJson(automaticTask.floorRange), error: root.summary.pendingAuto.error };
                    retained = true;
                });
                if (retained) {
                    this.#observe(controller.signal.aborted ? 'interrupted' : 'failed', { receivedReply: true, startFloor: automaticTask.floorRange?.[0], endFloor: automaticTask.floorRange?.[1], errorCode: error.code ?? 'summary_failed' }, built.chatId);
                }
            }
            throw error;
        } finally {
            if (this.#active.get(built.chatId) === lease) this.#active.delete(built.chatId);
            if (manual) this.#notifyStateChanged();
            if (automaticTask) {
                this.#automaticRuntime.delete(built.chatId);
                this.#notifyStateChanged();
            }
        }
    }

    #taskFrom({ built, taskId, attemptId, result, candidates, status, keywordError = null }) {
        return {
            taskId, attemptId, status, sourceType: 'manual-summary', generationMode: built.mode,
            uncoveredOnly: built.uncoveredOnly,
            requestedRange: cloneJson(built.selection.requestedRange), floorRange: cloneJson(built.selection.floorRange), warnings: cloneJson(built.warnings),
            exclusionPolicy: cloneJson(built.exclusionPolicy),
            applicationMessages: cloneJson(built.prepared.messages), jsonSchema: cloneJson(built.compiled.jsonSchema), rawResponse: result.rawText,
            candidates: cloneJson(candidates), provider: cloneJson(result.provider), keywordProvider: null,
            keywordState: 'failed', keywordError: keywordError ? { code: keywordError.code ?? 'unknown', message: keywordError.message ?? '关键词生成失败。' } : null,
            createdAt: isoNow(this.now),
        };
    }

    async retryKeywords(request = {}) {
        const chatId = this.summaryChatAdapter.currentChatId();
        if (this.#active.has(chatId)) throw new SummaryDomainError('summary_busy', '当前聊天已有总结任务正在运行。');
        const lease = { chatId, taskId: request.taskId, controller: new AbortController(), automatic: false };
        this.#active.set(chatId, lease);
        try { return await this.#retryKeywords(request, lease); }
        finally { if (this.#active.get(chatId) === lease) this.#active.delete(chatId); }
    }

    async #retryKeywords({ taskId, candidates: editedCandidates } = {}, lease) {
        const pending = this.pendingReview();
        if (!pending || pending.taskId !== taskId || !['keyword-failed', 'awaiting-review', 'alias-failed', 'alias-pending'].includes(pending.status)) throw new SummaryDomainError('keyword_retry_not_found', '找不到可重试的关键词草稿。');
        this.#assertSource(pending);
        const drafts = Array.isArray(editedCandidates) ? editedCandidates : pending.candidates;
        const normalizedDrafts = normalizeKeywordDraftCandidates(drafts);
        const settings = this.getGlobalSettings();
        const eventKeywords = effectiveEventLibrary(settings?.summary);
        const compiled = assembleStageB(normalizedDrafts, settings?.summary?.promptOverrides ?? null, eventKeywords, pending.generationMode);
        const prepared = this.summaryProvider.prepare(compiled);
        if (prepared.provider?.source !== pending.provider?.source && !(pending.provider?.source === 'main' && prepared.provider?.source === 'sillytavern') && !(pending.provider?.source === 'secondary' && prepared.provider?.source === 'plugin')) {
            throw new SummaryDomainError('summary_provider_changed', 'AI 来源已改变；请恢复原来源后再重试关键词。');
        }
        let result;
        try {
            result = await this.summaryProvider.generate(prepared, { signal: lease.controller.signal });
            await this.#waitForLeaseChat(lease);
            this.#assertLease(lease);
            this.#assertSource(pending);
        } catch (error) {
            this.#assertLease(lease);
            this.#assertSource(pending);
            const preserved = {
                ...pending,
                candidates: cloneJson(normalizedDrafts),
                keywordState: pending.keywordState === 'failed' ? 'failed' : 'stale',
                keywordError: { code: error?.code ?? 'unknown', message: error?.message ?? '关键词生成失败。' },
            };
            await this.chatDataService.updateCurrent(root => {
                if (root.summary.pendingManualReview?.taskId !== taskId) throw new SummaryDomainError('manual_review_not_found', '待确认候选已变更。');
                root.summary.pendingManualReview = cloneJson(preserved);
            });
            throw error;
        }
        const byId = new Map(result.data.indexes.map(item => [item.draftId, item]));
        const candidates = normalizeEditedCandidates(normalizedDrafts.map(item => mergeKeywordIndex(item, byId.get(item.draftId))));
        const updated = { ...pending, status: 'awaiting-review', candidates, keywordState: 'fresh', keywordError: null, keywordRawResponse: result.rawText ?? null, keywordProvider: cloneJson(result.provider), applicationMessages: [...(pending.applicationMessages ?? []), ...cloneJson(prepared.messages)] };
        await this.chatDataService.updateCurrent(root => { if (root.summary.pendingManualReview?.taskId !== taskId) throw new SummaryDomainError('manual_review_not_found', '待确认候选已变更。'); root.summary.pendingManualReview = cloneJson(updated); });
        if (pending.generationMode === 'enhanced') {
            const completion = await this.#generateAliases(updated, { lease });
            return { status: completion.error ? 'alias-failed' : 'awaiting-review', pending: cloneJson(completion.task), ...(completion.error ? { error: completion.error } : {}) };
        }
        return { status: 'awaiting-review', pending: cloneJson(updated) };
    }

    async #generateAliases(task, { lease, automaticTask = null, ephemeral = false } = {}) {
        this.#assertSource(task);
        const checkpoint = { ...cloneJson(task), status: 'alias-pending', aliasState: 'pending', aliasError: null };
        const save = async value => this.chatDataService.updateCurrent(root => {
            if (lease) this.#assertLease(lease);
            if (automaticTask) root.summary.pendingAuto = { ...root.summary.pendingAuto, ...cloneJson(value),
                sourceType: 'auto-summary', origin: automaticTask.origin, backfill: cloneJson(automaticTask.backfill ?? null) };
            else root.summary.pendingManualReview = cloneJson(value);
        });
        if (!ephemeral) await save(checkpoint);
        try {
            if (automaticTask) this.#setAutomaticStage(lease.chatId, 'aliases', task.floorRange);
            const prepared = this.summaryProvider.prepare(assembleStageC(checkpoint.candidates, task.promptOverrides ?? this.getGlobalSettings()?.summary?.promptOverrides));
            if (!sameProviderSource(prepared.provider, task.provider)) throw new SummaryDomainError('summary_provider_changed', 'AI 来源已改变，正文和关键词已保留，请恢复原来源后重试检索简称。');
            const result = await this.summaryProvider.generate(prepared, { signal: lease?.controller.signal });
            if (lease) await this.#waitForLeaseChat(lease);
            if (lease) this.#assertLease(lease);
            this.#assertSource(task);
            const byId = new Map(result.data.indexes.map(item => [item.draftId, item]));
            const completed = { ...checkpoint, status: 'awaiting-review', aliasState: 'fresh', aliasError: null,
                aliasRawResponse: result.rawText ?? null, aliasProvider: cloneJson(result.provider),
                applicationMessages: [...(checkpoint.applicationMessages ?? []), ...cloneJson(prepared.messages)],
                candidates: normalizeEditedCandidates(checkpoint.candidates.map(item => ({ ...item,
                    detailAliases: byId.get(item.draftId)?.detailAliases ?? [],
                    detailAliasDiagnostics: byId.get(item.draftId)?.detailAliasDiagnostics ?? [],
                }))),
            };
            if (!ephemeral) await save(completed);
            return { task: completed };
        } catch (error) {
            if (lease) this.#assertLease(lease);
            this.#assertSource(task);
            const failed = { ...checkpoint, status: 'alias-failed', aliasState: 'failed',
                aliasError: { code: error.code ?? 'summary_failed', message: '检索简称生成失败，正文和关键词已保留。可以只重试检索简称。' } };
            if (!ephemeral) await save(failed);
            return { task: failed, error };
        }
    }

    async retryAliases({ taskId, candidates: editedCandidates } = {}) {
        const pending = this.pendingReview();
        if (!pending || pending.taskId !== taskId || pending.generationMode !== 'enhanced'
            || pending.keywordState !== 'fresh') throw new SummaryDomainError('alias_retry_not_found', '找不到可重试的检索简称任务。');
        if (editedCandidates && JSON.stringify(normalizeEditedCandidates(editedCandidates).map(item => ({ ...item, detailAliases: [], detailAliasDiagnostics: [] })))
            !== JSON.stringify(normalizeEditedCandidates(pending.candidates).map(item => ({ ...item, detailAliases: [], detailAliasDiagnostics: [] })))) {
            throw new SummaryDomainError('alias_frozen_changed', '正文或关键词已修改，请重新生成关键词后再生成检索简称。');
        }
        const chatId = this.summaryChatAdapter.currentChatId();
        if (this.#active.has(chatId)) throw new SummaryDomainError('summary_busy', '当前聊天已有总结任务正在运行。');
        const lease = { chatId, taskId, attemptId: this.idFactory('summary-attempt'), controller: new AbortController(), automatic: false };
        this.#active.set(chatId, lease);
        try {
            const result = await this.#generateAliases(pending, { lease });
            return { status: result.error ? 'alias-failed' : 'awaiting-review', pending: cloneJson(result.task), ...(result.error ? { error: result.error } : {}) };
        } finally { if (this.#active.get(chatId) === lease) this.#active.delete(chatId); }
    }

    async confirm({ taskId, candidates } = {}) {
        const pending = this.pendingReview();
        if (!pending || pending.taskId !== taskId) {
            throw new SummaryDomainError('manual_review_not_found', '找不到待确认的手动总结候选。');
        }
        if (pending.keywordState === 'failed' || ['pending', 'failed'].includes(pending.aliasState)) {
            throw new SummaryDomainError('summary_stage_incomplete', '请先完成失败的生成步骤，再确认入库。');
        }
        const outcome = await this.#commit({
            task: pending,
            candidates: normalizeEditedCandidates(candidates ?? pending.candidates),
            requirePending: true,
        });
        if (pending.regeneration) this.#regenerationReviews.delete(this.summaryChatAdapter.currentChatId());
        return outcome;
    }

    async cancel({ taskId } = {}) {
        const chatId = this.summaryChatAdapter.currentChatId();
        const regeneration = this.#regenerationReviews.get(chatId);
        if (regeneration && (!taskId || regeneration.taskId === taskId)) {
            this.#regenerationReviews.delete(chatId);
            return true;
        }
        let cleared = false;
        await this.chatDataService.updateCurrent(root => {
            const pending = root.summary?.pendingManualReview;
            if (!pending) return;
            if (taskId && pending.taskId !== taskId) {
                throw new SummaryDomainError('manual_review_not_found', '待确认候选已变更。');
            }
            const active = this.#active.get(this.summaryChatAdapter.currentChatId());
            if (active?.taskId === pending.taskId) active.controller.abort();
            root.summary.pendingManualReview = null;
            cleared = true;
        });
        return cleared;
    }

    async #completeExcludedAutomatic(built, automaticTask) {
        if (!automaticTask?.taskId) throw new SummaryDomainError('auto_task_resolved', '自动任务已解决或本次尝试已失效。');
        let outcome = null;
        await this.chatDataService.updateCurrent(root => {
            if (this.summaryChatAdapter.currentChatId() !== built.chatId
                || root.summary.pendingAuto?.taskId !== automaticTask.taskId) {
                throw new SummaryDomainError('auto_task_resolved', '自动任务已解决或本次尝试已失效。');
            }
            const current = selectContinuousSummaryFloors(this.summaryChatAdapter.readCurrent().chat, {
                startFloor: built.selection.requestedRange[0], endFloor: built.selection.requestedRange[1],
            });
            const policy = summaryExclusionPolicy(root.summary, current.floorRange);
            if (!sameRange(current.floorRange, built.selection.floorRange)
                || !sameSummaryExclusionPolicy(policy, built.exclusionPolicy)
                || filterExcludedSummaryFloors(current.floors, policy).length) {
                throw new SummaryDomainError('summary_source_changed', '本次总结的不参与楼层设置已变更，请重新开始。');
            }
            const batchId = this.idFactory('summary-batch');
            root.summary.batches.push({
                id: batchId,
                taskId: automaticTask.taskId,
                ordinal: null,
                sourceType: 'auto-summary',
                outcome: 'excluded',
                status: 'completed',
                requestedRange: cloneJson(built.selection.requestedRange),
                floorRange: cloneJson(built.selection.floorRange),
                exclusionPolicy: cloneJson(built.exclusionPolicy),
                itemCount: 0,
                hideApplied: false,
                completedAt: isoNow(this.now),
                invalidatedAt: null,
                invalidationReason: null,
            });
            root.summary.progress.lastProcessedFloor = Math.max(
                root.summary.progress.lastProcessedFloor ?? -1,
                built.selection.floorRange[1],
            );
            root.summary.pendingAuto = null;
            root.summary.lastResult = {
                status: 'excluded', taskId: automaticTask.taskId,
                floorRange: cloneJson(built.selection.floorRange), itemCount: 0,
            };
            outcome = { status: 'completed', outcome: 'excluded', batchId, ordinal: null,
                memories: [], anniversaries: [] };
        });
        this.#observe('excluded', {
            receivedReply: true,
            startFloor: built.selection.floorRange[0],
            endFloor: built.selection.floorRange[1],
        }, built.chatId);
        return cloneJson(outcome);
    }

    async handleChatDeletion({ chatId, deletionRange, previousLength, currentLength } = {}) {
        const currentChatId = this.summaryChatAdapter.currentChatId();
        if (!chatId || chatId !== currentChatId) return { status: 'ignored' };
        const active = this.#active.get(chatId);
        this.#nextReplyRequests.delete(chatId);
        if (active) active.controller.abort();
        this.#automaticRuntime.delete(chatId);
        if (this.#backfillSession?.chatId === chatId && ['running', 'pause-requested'].includes(this.#backfillSession.status)) {
            this.#backfillSession.status = 'interrupted';
            this.#backfillSession.currentRange = null;
            this.#backfillSession.lastError = { code: 'summary_interrupted', message: '补录因聊天楼层删除而中断，请检查总结状态。' };
        }
        let outcome = null;
        await this.chatDataService.updateCurrent(root => {
            outcome = deletionRange
                ? invalidateSummaryDeletion(root, { deletionRange, at: isoNow(this.now) })
                : blockUnresolvedSummaryDeletion(root, { previousLength, currentLength, at: isoNow(this.now) });
        });
        if (outcome.status !== 'unaffected') {
            this.#observe(outcome.status === 'invalidated' ? 'source_deleted' : 'deletion_unresolved', {
                startFloor: outcome.deletionRange?.[0], endFloor: outcome.deletionRange?.[1],
                itemCount: outcome.removedMemoryCount,
            }, chatId);
        }
        this.#notifyStateChanged();
        return cloneJson(outcome);
    }

    #assertLease(lease) {
        const currentChatId = this.#currentChatIdOrNull();
        if (lease.controller.signal.aborted
            || this.#active.get(lease.chatId) !== lease
            || (currentChatId !== null && currentChatId !== lease.chatId)
            || (lease.automatic && currentChatId === lease.chatId
                && this.chatDataService.readCurrent().summary.pendingAuto?.taskId !== lease.taskId)) {
            throw new SummaryDomainError('summary_interrupted', '聊天已切换或本次总结已中断。');
        }
    }

    #currentChatIdOrNull() {
        if (typeof this.summaryChatAdapter.currentChatIdOrNull === 'function') {
            return this.summaryChatAdapter.currentChatIdOrNull();
        }
        try { return this.summaryChatAdapter.currentChatId(); }
        catch { return null; }
    }

    async #waitForLeaseChat(lease) {
        this.#assertLease(lease);
        const current = this.#currentChatIdOrNull();
        if (current === lease.chatId) return;
        if (current !== null) throw new SummaryDomainError('summary_interrupted', '聊天已切换或本次总结已中断。');
        if (typeof this.summaryChatAdapter.onChatChanged !== 'function') {
            throw new SummaryDomainError('summary_interrupted', '当前聊天暂时不可用，本次总结已中断。');
        }
        await new Promise((resolve, reject) => {
            let dispose = null;
            let settled = false;
            const finish = error => {
                if (settled) return;
                settled = true;
                if (typeof dispose === 'function') dispose();
                lease.controller.signal.removeEventListener('abort', onAbort);
                if (error) reject(error);
                else resolve();
            };
            const onAbort = () => finish(new SummaryDomainError('summary_interrupted', '聊天已切换或本次总结已中断。'));
            dispose = this.summaryChatAdapter.onChatChanged(() => {
                const next = this.#currentChatIdOrNull();
                if (next === lease.chatId) finish();
                else if (next !== null) finish(new SummaryDomainError('summary_interrupted', '聊天已切换或本次总结已中断。'));
            });
            lease.controller.signal.addEventListener('abort', onAbort, { once: true });
            if (lease.controller.signal.aborted) onAbort();
        });
        this.#assertLease(lease);
    }

    #assertSource(task) {
        const snapshot = this.summaryChatAdapter.readCurrent();
        const current = selectContinuousSummaryFloors(snapshot.chat, {
            startFloor: task.requestedRange[0], endFloor: task.requestedRange[1],
        });
        if (!sameRange(current.floorRange, task.floorRange)) {
            throw new SummaryDomainError('summary_source_changed', '本次总结的来源楼层已变更。');
        }
        const policy = summaryExclusionPolicy(this.chatDataService.readCurrent().summary, current.floorRange);
        if (!sameSummaryExclusionPolicy(policy, task.exclusionPolicy)) {
            throw new SummaryDomainError('summary_source_changed', '本次总结的不参与楼层设置已变更，请重新开始。');
        }
        if (task.regeneration) {
            const root = this.chatDataService.readCurrent();
            const batch = (root.summary?.batches ?? []).find(item => item?.id === task.regeneration.batchId);
            if (JSON.stringify(batch) !== JSON.stringify(task.regeneration.batchSnapshot)) {
                throw new SummaryDomainError('summary_batch_changed', '目标总结批次已发生变化，旧结果保留，请重新开始。');
            }
            const sourceSnapshot = snapshot.chat.slice(batch.floorRange[0], batch.floorRange[1] + 1)
                .map(item => ({ is_user: item?.is_user, is_system: item?.is_system, mes: item?.mes, send_date: item?.send_date }));
            if (JSON.stringify(sourceSnapshot) !== JSON.stringify(task.regeneration.sourceSnapshot)) {
                throw new SummaryDomainError('summary_source_changed', '这个批次的原始楼层已发生变化，旧结果保留，请重新开始。');
            }
            const memoryIds = root.memories.filter(item => isActiveMemory(item) && item?.source?.batchId === batch.id).map(item => item.id);
            if (JSON.stringify(memoryIds) !== JSON.stringify(task.regeneration.memoryIds)) {
                throw new SummaryDomainError('summary_batch_changed', '这个批次的派生记忆已发生变化，旧结果保留，请重新开始。');
            }
            const memories = root.memories.filter(item => isActiveMemory(item) && item?.source?.batchId === batch.id);
            const anniversaries = root.anniversaries.filter(item => item?.source?.batchId === batch.id);
            if (JSON.stringify(memories) !== JSON.stringify(task.regeneration.memorySnapshot)
                || JSON.stringify(anniversaries) !== JSON.stringify(task.regeneration.anniversarySnapshot)) {
                throw new SummaryDomainError('summary_batch_changed', '这个批次的旧结果已被修改，旧结果保留，请重新开始。');
            }
        }
    }

    async #commit({ task, candidates, requirePending, lease = null }) {
        this.#assertSource(task);
        let outcome = null;
        await this.chatDataService.updateCurrent(root => {
            if (lease) this.#assertLease(lease);
            this.#assertSource(task);
            if (task.uncoveredOnly) this.#assertUncovered(task.requestedRange, root.summary, task.taskId);
            if (!task.regeneration && task.sourceType === 'auto-summary' && (root.summary.pendingAuto?.taskId !== task.taskId
                || root.summary.pendingAuto?.attemptId !== task.attemptId)) {
                throw new SummaryDomainError('auto_task_resolved', '自动任务已解决或本次尝试已失效。');
            }
            if (!task.regeneration && root.summary.batches.some(batch => batch.taskId === task.taskId && batch.status === 'completed')) {
                throw new SummaryDomainError('summary_already_committed', '本次总结已经入库。');
            }
            if (requirePending && !task.regeneration && root.summary?.pendingManualReview?.taskId !== task.taskId) {
                throw new SummaryDomainError('manual_review_not_found', '待确认候选已变更。');
            }
            const ordinal = root.summary.nextBatchOrdinal;
            const batchId = task.regeneration?.batchId ?? this.idFactory('summary-batch');
            const effectiveOrdinal = task.regeneration?.batchSnapshot?.ordinal ?? ordinal;
            const fictionalCalendar = root.storyTime?.fictionalCalendar ?? {};
            const memories = candidates.map((candidate, index) => createMemory({
                mode: 'trigger',
                title: candidate.title,
                startTime: candidate.storyTime.start,
                endTime: candidate.storyTime.end,
                body: candidate.body,
                people: candidate.people,
                locations: candidate.locations,
                keywords: {
                    event: candidate.eventKeywords,
                    detail: candidate.detailKeywords,
                    ...(Object.hasOwn(candidate, 'detailAliases') ? { detailAliases: candidate.detailAliases } : {}),
                    primary: candidate.primaryKeywords,
                    auxiliary: candidate.auxiliaryKeywords,
                },
                source: {
                    type: task.sourceType ?? 'manual-summary', batchId, floorRange: task.floorRange,
                    batchOrdinal: effectiveOrdinal, itemOrdinal: index + 1,
                    eventOrdinal: candidate.eventOrdinal,
                    matchedResidentTags: [],
                },
            }, { now: this.now, idFactory: () => this.idFactory('memory'), fictionalCalendar }));
            const anniversaries = candidates.flatMap(candidate => candidate.specialDateCandidates
                .map(item => specialDateFromCandidate(item, {
                    batchId, floorRange: task.floorRange, fictionalCalendar, now: this.now,
                    idFactory: () => this.idFactory('anniversary'),
                }))
                .filter(Boolean));
            if (task.regeneration) {
                const oldMemoryIds = new Set(task.regeneration.memoryIds);
                const oldAnniversaryIds = new Set(task.regeneration.anniversaryIds);
                root.memories = root.memories.filter(item => !oldMemoryIds.has(item.id));
                root.anniversaries = root.anniversaries.filter(item => !oldAnniversaryIds.has(item.id));
            }
            root.memories.push(...memories);
            root.anniversaries.push(...anniversaries);
            if (task.regeneration) {
                const index = root.summary.batches.findIndex(item => item.id === batchId);
                root.summary.batches[index] = { ...root.summary.batches[index], taskId: task.taskId,
                    requestedRange: cloneJson(task.requestedRange), floorRange: cloneJson(task.floorRange),
                    exclusionPolicy: cloneJson(task.exclusionPolicy ?? { excludedFloors: [] }),
                    itemCount: memories.length, completedAt: isoNow(this.now) };
                outcome = { batchId, ordinal: effectiveOrdinal, memories: cloneJson(memories), anniversaries: cloneJson(anniversaries) };
                return;
            }
            root.summary.batches.push({
                id: batchId, taskId: task.taskId, ordinal,
                sourceType: task.sourceType ?? 'manual-summary', outcome: 'memories', status: 'completed',
                requestedRange: cloneJson(task.requestedRange), floorRange: cloneJson(task.floorRange),
                exclusionPolicy: cloneJson(task.exclusionPolicy ?? { excludedFloors: [] }),
                itemCount: memories.length, hideApplied: root.summary.auto?.hideSummarizedFloors !== false,
                completedAt: isoNow(this.now), invalidatedAt: null, invalidationReason: null,
            });
            const previous = root.summary.progress.lastProcessedFloor;
            root.summary.progress.lastProcessedFloor = previous === null
                ? task.floorRange[1]
                : Math.max(previous, task.floorRange[1]);
            root.summary.nextBatchOrdinal = ordinal + 1;
            root.summary.lastSuccessfulInput = {
                taskId: task.taskId,
                requestedRange: cloneJson(task.requestedRange),
                floorRange: cloneJson(task.floorRange),
                exclusionPolicy: cloneJson(task.exclusionPolicy ?? { excludedFloors: [] }),
                applicationMessages: cloneJson(task.applicationMessages),
                completedAt: isoNow(this.now),
            };
            if (root.summary.auto?.hideSummarizedFloors !== false) {
                root.summary.hiddenSegments ??= [];
                root.summary.hiddenSegments.push({ id: this.idFactory('hidden-segment'), batchId, floorRange: cloneJson(task.floorRange), status: 'active' });
            }
            if (task.sourceType === 'auto-summary' || sameRange(root.summary.pendingAuto?.floorRange, task.floorRange)) root.summary.pendingAuto = null;
            if (task.sourceType !== 'auto-summary') root.summary.pendingManualReview = null;
            root.summary.lastResult = { status: 'completed', taskId: task.taskId, floorRange: cloneJson(task.floorRange), ordinal, itemCount: memories.length };
            outcome = { batchId, ordinal, memories: cloneJson(memories), anniversaries: cloneJson(anniversaries) };
        });
        return outcome;
    }
}
