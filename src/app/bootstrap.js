import { mountSettingsPanel } from './settings-panel.js';
import { mountPluginShell } from './plugin-shell.js';
import { installWandEntry } from './wand-entry.js';
import { ensureGlobalSettings, getSillyTavernContext, saveGlobalSettings } from '../st-adapter/context.js';
import { installChatViewLifecycle, installStoryTimeObservationLifecycle } from '../st-adapter/events.js';
import { ChatDataService } from '../storage/chat-data-service.js';
import { getContextChatId } from '../storage/chat-data.js';
import { MemoryLibraryService } from '../domain/memory-library-service.js';
import { MemoryKeywordRebuildService } from '../domain/memory-keyword-rebuild-service.js';
import { MemoryMergeService } from '../domain/memory-merge-service.js';
import { StoryTimeService } from '../domain/story-time-service.js';
import { AnniversaryService } from '../domain/anniversary-service.js';
import { CalendarService } from '../domain/calendar-service.js';
import { RecallSettingsService } from '../domain/recall-settings-service.js';
import { PromptModuleService } from '../domain/prompt-module-service.js';
import { ModuleResultService } from '../domain/module-result-service.js';
import { countTextTokens } from '../st-adapter/token-count.js';
import { clearRecallPrompts, installRecallPromptLifecycle, writeRecallPrompts } from '../st-adapter/recall-prompt.js';
import { PromptModuleInjectionAdapter } from '../st-adapter/prompt-modules.js';
import { excludeSummarizedPromptHistory } from '../st-adapter/prompt-history.js';
import { buildFormalRecall } from '../recall/formal-recall.js';
import { createRecallMonitorRecord } from '../recall/monitor-snapshot.js';
import { ManualSummaryService } from '../summary/summary-service.js';
import { createSummaryChatAdapter } from '../st-adapter/summary-chat.js';
import { createSummaryProviderAdapter } from '../st-adapter/summary-provider.js';
import { installAutoSummaryLifecycle } from '../st-adapter/summary-events.js';
import { createAutoSummaryNotifier } from '../st-adapter/summary-notifications.js';
import {
    createFeatureSnapshot,
    FEATURE_IDS,
    filterModulesByFeature,
    isFeatureEnabled,
    isModuleLifecycleEnabled,
} from '../domain/feature-policy.js';

const SUPPORTED_RECALL_GENERATION_TYPES = new Set(['normal', 'regenerate', 'swipe', 'continue']);
let formalRecallRuntime = null;

function runtimeFeatureSnapshot(runtime = formalRecallRuntime) {
    if (!runtime) return createFeatureSnapshot();
    let chatData = null;
    try { chatData = runtime.chatDataService?.readCurrent?.() ?? null; } catch { /* No resolved chat. */ }
    return createFeatureSnapshot(runtime.getGlobalSettings?.() ?? {}, chatData);
}

function enabledModuleGroups(groups, snapshot) {
    return {
        ...groups,
        global: filterModulesByFeature(snapshot, groups?.global),
        character: filterModulesByFeature(snapshot, groups?.character),
        chat: filterModulesByFeature(snapshot, groups?.chat),
    };
}

export function configureFormalRecallRuntime(runtime) {
    formalRecallRuntime = runtime ?? null;
}

export async function timeKeywordMemoryGenerateInterceptor(chat, _contextSize, _abort, type) {
    if (!formalRecallRuntime) return chat;
    let moduleContext = null;
    try {
        moduleContext = formalRecallRuntime.getContext();
        formalRecallRuntime.promptModuleInjector?.clear(moduleContext, 'next-generation');
        const snapshot = runtimeFeatureSnapshot();
        if (snapshot.pluginEnabled && SUPPORTED_RECALL_GENERATION_TYPES.has(type) && formalRecallRuntime.promptModuleService && formalRecallRuntime.promptModuleInjector) {
            formalRecallRuntime.promptModuleInjector.apply({
                ...enabledModuleGroups(formalRecallRuntime.promptModuleService.read(), snapshot),
                results: formalRecallRuntime.moduleResultService?.readActive(moduleContext) ?? [],
            }, moduleContext);
        }
    } catch {
        try { formalRecallRuntime.promptModuleInjector?.clear(moduleContext, 'write-failed'); } catch { /* Modules must never block chat generation. */ }
    }
    let context = null;
    let depths = { storyTime: 9999, memory: 9999, specialDate: 9999, holiday: 9999 };
    try {
        context = formalRecallRuntime.getContext();
        const globalSettings = formalRecallRuntime.getGlobalSettings();
        depths = {
            storyTime: globalSettings.recall?.storyTimeInjectionDepth ?? 0,
            memory: globalSettings.recall?.memoryInjectionDepth ?? 9999,
            specialDate: globalSettings.recall?.specialDateInjectionDepth ?? 9999,
            holiday: globalSettings.recall?.holidayInjectionDepth ?? 0,
        };
        clearRecallPrompts(context, depths);
        if (!SUPPORTED_RECALL_GENERATION_TYPES.has(type)) return chat;
        let data = formalRecallRuntime.chatDataService.readCurrent();
        const snapshot = createFeatureSnapshot(globalSettings, data);
        const eventMemoryEnabled = isFeatureEnabled(snapshot, FEATURE_IDS.eventMemory);
        const calendarEnabled = isFeatureEnabled(snapshot, FEATURE_IDS.calendar);
        if (!eventMemoryEnabled && !calendarEnabled) return chat;
        if (calendarEnabled && typeof formalRecallRuntime.storyTimeService?.synchronizeGenerationInput === 'function') {
            await formalRecallRuntime.storyTimeService.synchronizeGenerationInput(chat, { generationType: type });
            data = formalRecallRuntime.chatDataService.readCurrent();
        }
        const promptHistory = excludeSummarizedPromptHistory(chat, data, { originalChat: context.chat });
        const result = await buildFormalRecall({
            chat,
            data,
            globalSettings,
            countTokens: text => formalRecallRuntime.countTokens(text),
        });
        if (!eventMemoryEnabled) result.prompts.memory = '';
        if (!calendarEnabled) {
            result.prompts.storyTime = '';
            result.prompts.specialDate = '';
            result.prompts.holiday = '';
        }
        const channels = writeRecallPrompts(context, { ...result.prompts, depths });
        const at = new Date().toISOString();
        const monitor = createRecallMonitorRecord({ result, promptHistory, generationType: type, at, channels });
        await formalRecallRuntime.chatDataService.updateCurrent(root => {
            root.monitor = monitor;
        });
    } catch (error) {
        try { if (context) clearRecallPrompts(context, depths); } catch { /* Recall must never block the chat generation. */ }
    }
    return chat;
}

export function installGenerateInterceptor(root = globalThis) {
    root.timeKeywordMemoryGenerateInterceptor = timeKeywordMemoryGenerateInterceptor;
}

export function bootstrap({ root = globalThis, documentRef = root.document } = {}) {
    installGenerateInterceptor(root);
    const context = getSillyTavernContext(root);
    ensureGlobalSettings(context);
    const getContext = () => getSillyTavernContext(root);
    const chatDataService = new ChatDataService({ getContext });
    const memoryLibraryService = new MemoryLibraryService({ chatDataService });
    const storyTimeService = new StoryTimeService({ chatDataService, getChat: () => getContext()?.chat ?? [] });
    const anniversaryService = new AnniversaryService({ chatDataService });
    const calendarService = new CalendarService({ chatDataService });
    const recallSettingsService = new RecallSettingsService({
        chatDataService,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
        saveGlobalSettings: () => saveGlobalSettings(getContext()),
    });
    const promptModuleService = new PromptModuleService({
        chatDataService,
        getContext,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
        saveGlobalSettings: () => saveGlobalSettings(getContext()),
    });
    const promptModuleInjector = new PromptModuleInjectionAdapter({ getContext });
    const moduleResultService = new ModuleResultService({
        chatDataService,
        promptModuleService,
        getContext,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
        saveGlobalSettings: () => saveGlobalSettings(getContext()),
        isLifecycleEnabled: lifecycle => isModuleLifecycleEnabled(currentFeatureSnapshot(), lifecycle),
    });
    let shell = null;
    const autoSummaryNotifier = createAutoSummaryNotifier({ root });
    let lastBackfillNotice = null;
    const summaryProvider = createSummaryProviderAdapter({ getContext });
    const manualSummaryService = new ManualSummaryService({
        chatDataService,
        summaryChatAdapter: createSummaryChatAdapter({ getContext }),
        summaryProvider,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
        onStateChanged: () => {
            Promise.resolve(shell?.refresh?.()).catch(() => {});
            const backfill = manualSummaryService.autoState().backfill;
            if (!backfill || backfill.chatId !== getContextChatId(getContext())) return;
            const signature = JSON.stringify([backfill.id, backfill.status, backfill.completedBatches, backfill.totalBatches, backfill.currentRange]);
            if (signature === lastBackfillNotice) return;
            lastBackfillNotice = signature;
            autoSummaryNotifier.backfill(backfill);
        },
    });
    const memoryKeywordRebuildService = new MemoryKeywordRebuildService({
        chatDataService,
        summaryProvider,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
    });
    const memoryMergeService = new MemoryMergeService({
        chatDataService,
        summaryChatAdapter: createSummaryChatAdapter({ getContext }),
        summaryProvider,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
    });
    const disposeSummaryIsolation = manualSummaryService.installChatIsolation();
    const disposeKeywordRebuildIsolation = memoryKeywordRebuildService.installChatIsolation(context);
    const disposeMemoryMergeIsolation = memoryMergeService.installChatIsolation();
    configureFormalRecallRuntime({
        getContext,
        chatDataService,
        storyTimeService,
        promptModuleService,
        promptModuleInjector,
        moduleResultService,
        getGlobalSettings: () => ensureGlobalSettings(getContext()),
        countTokens: text => countTextTokens(getContext(), text),
    });
    const currentFeatureSnapshot = () => {
        let chatData = null;
        try { chatData = chatDataService.readCurrent(); } catch { /* No resolved chat. */ }
        return createFeatureSnapshot(ensureGlobalSettings(getContext()), chatData);
    };
    installRecallPromptLifecycle(context);
    const promptModuleLifecycle = promptModuleInjector.installLifecycle(context);
    const moduleResultsEnabled = () => ['collect', 'sync'].some(lifecycle => isModuleLifecycleEnabled(currentFeatureSnapshot(), lifecycle));
    const moduleResultLifecycle = moduleResultService.installLifecycle(context, () => shell?.refresh?.(), moduleResultsEnabled);
    chatDataService.installLifecycle(context);
    const initialization = chatDataService.initializeCurrent();
    const autoSummaryLifecycle = installAutoSummaryLifecycle({
        context,
        getContext,
        isEnabled: () => isFeatureEnabled(currentFeatureSnapshot(), FEATURE_IDS.eventMemory),
        onCompleted: async ({ chatId, userMessageId, messageId }) => {
            try {
                const pending = manualSummaryService.processAutomaticTurn({
                    checkpointId: `${chatId}:${userMessageId}:${messageId}`,
                });
                shell?.refresh?.();
                const outcome = await pending;
                if (getContextChatId(getContext()) !== chatId) return;
                const state = manualSummaryService.autoState();
                if (['failed', 'keyword-failed'].includes(outcome?.status)) {
                    autoSummaryNotifier.error({ code: state.pendingAuto?.error?.code, floorRange: state.pendingAuto?.floorRange });
                } else if (outcome?.status === 'completed') {
                    autoSummaryNotifier.success({ floorRange: state.lastResult.floorRange });
                }
            } catch {
                try {
                    if (getContextChatId(getContext()) === chatId) autoSummaryNotifier.error({ code: 'auto_summary_failed' });
                } catch { /* A closed or unresolved chat has no notification target. */ }
            } finally {
                shell?.refresh?.();
            }
        },
        onError: error => autoSummaryNotifier.error(error),
        onObservation: observation => manualSummaryService.setAutomaticObservation(observation),
        onDeleted: async deletion => {
            const outcome = await manualSummaryService.handleChatDeletion(deletion);
            if (outcome.status === 'invalidated') autoSummaryNotifier.invalidated(outcome);
            else if (outcome.status === 'deletion-unresolved') autoSummaryNotifier.deletionUnresolved();
            shell?.refresh?.();
        },
    });
    const disposeSummaryProviderStatus = manualSummaryService.installProviderStatusLifecycle(() => shell?.refresh?.());
    const storyTimeObserver = installStoryTimeObservationLifecycle({
        context,
        getContext,
        storyTimeService,
        isEnabled: () => isFeatureEnabled(currentFeatureSnapshot(), FEATURE_IDS.calendar),
        onUpdated: () => shell?.refresh?.(),
    });
    initialization.then(async () => {
        await manualSummaryService.recoverAutomatic();
        recallSettingsService.read();
        if (moduleResultsEnabled()) await moduleResultService.reconcile(getContext());
        return storyTimeObserver?.reconcile('chat_open');
    }).catch(() => {});

    if (documentRef) {
        shell = mountPluginShell({
            documentRef,
            getContext,
            memoryLibraryService,
            storyTimeService,
            anniversaryService,
            calendarService,
            recallSettingsService,
            promptModuleService,
            moduleResultService,
            manualSummaryService,
            summaryNotifier: autoSummaryNotifier,
            memoryKeywordRebuildService,
            memoryMergeService,
            getGlobalSettings: () => ensureGlobalSettings(getContext()),
            saveGlobalSettings: () => saveGlobalSettings(getContext()),
        });
        installChatViewLifecycle(context, () => {
            autoSummaryNotifier.clear();
            manualSummaryService.recoverAutomatic().then(() => shell?.refresh?.()).catch(() => shell?.refresh?.());
        });
        installWandEntry({ root, documentRef, onOpen: shell.open });
        mountSettingsPanel({
            documentRef,
            openPanel: shell.open,
        });
        return {
            shell,
            dispose() {
                autoSummaryLifecycle?.dispose();
                autoSummaryNotifier.clear();
                if (typeof disposeSummaryIsolation === 'function') disposeSummaryIsolation();
                if (typeof disposeKeywordRebuildIsolation === 'function') disposeKeywordRebuildIsolation();
                if (typeof disposeMemoryMergeIsolation === 'function') disposeMemoryMergeIsolation();
                if (typeof disposeSummaryProviderStatus === 'function') disposeSummaryProviderStatus();
                promptModuleLifecycle?.dispose();
                moduleResultLifecycle?.dispose();
                shell?.destroy?.();
            },
        };
    }
    return {
        shell: null,
        dispose() {
            autoSummaryLifecycle?.dispose();
            autoSummaryNotifier.clear();
            if (typeof disposeSummaryIsolation === 'function') disposeSummaryIsolation();
            if (typeof disposeKeywordRebuildIsolation === 'function') disposeKeywordRebuildIsolation();
            if (typeof disposeMemoryMergeIsolation === 'function') disposeMemoryMergeIsolation();
            if (typeof disposeSummaryProviderStatus === 'function') disposeSummaryProviderStatus();
            promptModuleLifecycle?.dispose();
        },
    };
}
