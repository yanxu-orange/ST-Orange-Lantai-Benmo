import { DEFAULT_SUMMARY_CLEANING_RULES } from './summary/source-cleaning.js';
import { createStoryStatusBarPreset } from './domain/story-status-bar.js';

export const EXTENSION_KEY = 'timeKeywordMemory';
export const SECRET_KEY_CUSTOM = 'api_key_custom';
export const GLOBAL_SCHEMA_VERSION = 21;
export const CHAT_SCHEMA_VERSION = 22;

export const API_ROUTES = Object.freeze({
    writeSecret: '/api/secrets/write',
    deleteSecret: '/api/secrets/delete',
    readSecretState: '/api/secrets/read',
    customChatStatus: '/api/backends/chat-completions/status',
    customChatGenerate: '/api/backends/chat-completions/generate',
});

export const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
    schemaVersion: GLOBAL_SCHEMA_VERSION,
    rootId: null,
    createdAt: null,
    updatedAt: null,
    migrations: [],
    plugin: {
        enabled: true,
        features: {
            eventMemory: true,
            calendar: true,
            promptModules: true,
            contentCollection: true,
            longTermTracking: true,
        },
    },
    modules: [createStoryStatusBarPreset()],
    moduleCaptureCounters: { global: 0, character: 0 },
    moduleResults: [],
    characterModuleStores: [],
    aiProvider: {
        source: null,
        secondary: {
            enabled: false,
            endpoint: '',
            model: '',
            secretId: null,
            activePresetId: null,
            presets: [],
        },
        autoFallbackToMain: false,
    },
    recall: {
        initialized: false,
        recentFloorCount: 6,
        automaticSameDayEnabled: true,
        triggerLimits: {
            countEnabled: true,
            maxCount: 5,
            tokenEnabled: false,
            maxTokens: null,
        },
        anniversaryPoolLimit: 2,
        memoryInjectionDepth: 9999,
        specialDateInjectionDepth: 9999,
        storyTimeReminderEnabled: false,
        storyTimeInjectionDepth: 0,
        holidayInjectionDepth: 0,
        excludedTerms: [],
    },
    regexRules: [],
    regexShortcuts: [],
    summary: {
        generationMode: 'quality',
        promptProfiles: [],
        activePromptProfileId: null,
        manualReviewEnabled: true,
        promptOverrides: {
            fast: null,
            qualitySummary: null,
            qualityKeywords: null,
            enhancedSummary: null,
            enhancedKeywords: null,
            aliases: null,
            merge: null,
            customPrompts: [],
        },
        eventLibraryOverride: null,
        fastModeWarningAcknowledged: false,
        cleaning: {
            rules: DEFAULT_SUMMARY_CLEANING_RULES,
            shortcuts: [],
        },
    },
    templates: {
        specialDateReminder: '请结合当前纪念日、角色关系、相关记忆与正在发生的剧情自然回应，不要机械复述提醒。',
        storyTimeInstruction: '<time_keyword_story_time>\n当前故事日期：{当前故事日期}\n请以此维持当前剧情的日期连续性，不要被前文中的旧日期、回忆、梦境、档案或计划日期覆盖。\n</time_keyword_story_time>',
        holidayInstruction: '',
    },
    defaults: {
        anniversaryAdvanceDays: 3,
        holidayAdvanceDays: 0,
        summary: {
            skipUserMessages: false,
            autoMemoryMode: 'trigger',
            manualMemoryMode: null,
        },
    },
    ui: {},
    diagnostics: {
        lastRuntimeProbeAt: null,
        lastRuntimeProbePassed: null,
    },
});

export const DEFAULT_CHAT_DATA = Object.freeze({
    schemaVersion: CHAT_SCHEMA_VERSION,
    rootId: null,
    chatId: null,
    createdAt: null,
    updatedAt: null,
    migrations: [],
    plugin: { enabled: true },
    modules: [],
    moduleCaptureCounter: 0,
    moduleResults: [],
    memories: [],
    anniversaries: [],
    calendar: {
        activeCalendarId: null,
        definitions: [],
        events: [],
    },
    storyTime: {
        current: null,
        manualAnchor: null,
        lastObservation: null,
        extractionRule: {
            enabled: false,
            mode: 'markers',
            markers: [],
            pattern: '',
            flags: 'su',
        },
        fictionalCalendar: {
            enabled: false,
            eras: [],
        },
    },
    summary: {
        nextBatchOrdinal: 1,
        progress: {
            startFloor: 0,
            lastProcessedFloor: null,
        },
        batches: [],
        pendingManualReview: null,
        pendingAuto: null,
        excludedFloors: [],
        hiddenSegments: [],
        lastResult: null,
        lastSuccessfulInput: null,
        auto: {
            enabled: false,
            initialized: false,
            lastCheckpointId: null,
            batchSize: null,
            retainedFloors: null,
            hideSummarizedFloors: true,
        },
    },
    recall: {
        recentFloorCount: 6,
        automaticSameDayEnabled: true,
        triggerLimits: {
            countEnabled: true,
            maxCount: 5,
            tokenEnabled: false,
            maxTokens: null,
        },
        anniversaryPoolLimit: 2,
    },
    monitor: {
        matching: null,
        estimated: null,
        actual: null,
    },
});
