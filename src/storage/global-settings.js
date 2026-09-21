import { DEFAULT_GLOBAL_SETTINGS, GLOBAL_SCHEMA_VERSION } from '../constants.js';
import { migrateLegacyPromptInstructions, normalizePromptOverrides } from '../prompts/prompt-customization.js';
import { normalizeEventLibraryOverride } from '../prompts/event-library.js';
import { normalizePromptProfiles } from '../prompts/prompt-profiles.js';
import { normalizePromptModules } from '../domain/prompt-module.js';
import { normalizeModuleResults } from '../domain/module-results.js';
import { normalizeCharacterModuleStores } from '../domain/character-module-store.js';
import { createStoryStatusBarPreset, STORY_STATUS_BAR_MODULE_ID } from '../domain/story-status-bar.js';
import { normalizeRecallExcludedTerms } from '../recall/excluded-terms.js';
import {
    createDefaultKeywordPromptScheme, createDefaultSummaryPromptScheme,
    DEFAULT_KEYWORD_PROMPT_SCHEME_ID, DEFAULT_SUMMARY_PROMPT_SCHEME_ID,
    keywordBlockFromLegacyScheme, summarySchemeWithoutLegacyKeywordBlock,
} from '../summary/prompt-scheme.js';
import { createStableId, isRecord, isoNow, mergePreservingUnknown } from './schema-utils.js';

function migrationEntry(fromVersion, at) {
    return { fromVersion, toVersion: GLOBAL_SCHEMA_VERSION, at };
}

function maxCaptureSequence(prefix, modules = [], results = []) {
    return [...modules, ...results].reduce((max, item) => {
        const match = new RegExp(`^${prefix}([1-9][0-9]*)$`).exec(item?.captureTag ?? '');
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
}

function migrateCaptureTokens(values, prefix, initialCounter = 0) {
    const records = Array.isArray(values) ? values : [];
    let counter = Math.max(initialCounter, maxCaptureSequence(prefix, records));
    return {
        values: records.map(value => {
            if (!isRecord(value) || !['collect', 'sync'].includes(value.lifecycle)) return value;
            if (new RegExp(`^${prefix}[1-9][0-9]*$`).test(value.captureTag ?? '')) return value;
            counter += 1;
            return { ...value, captureTag: `${prefix}${counter}` };
        }),
        counter,
    };
}

export function migrateGlobalSettings(current, {
    now,
    idFactory = () => createStableId('global'),
} = {}) {
    if (isRecord(current) && Number(current.schemaVersion) > GLOBAL_SCHEMA_VERSION) {
        throw new Error(`全局设置版本 ${current.schemaVersion} 高于当前支持版本 ${GLOBAL_SCHEMA_VERSION}。`);
    }

    const fromVersion = isRecord(current) && Number.isInteger(current.schemaVersion)
        ? current.schemaVersion
        : 0;
    const hadLegacyPromptSettings = isRecord(current?.summary) && [
        'activePromptSchemeId',
        'promptSchemes',
        'activeSummaryPromptSchemeId',
        'summaryPromptSchemes',
        'activeKeywordPromptSchemeId',
        'keywordPromptSchemes',
        'sendFormatExample',
    ].some(key => Object.hasOwn(current.summary, key));
    const at = isoNow(now);
    const migrated = mergePreservingUnknown(DEFAULT_GLOBAL_SETTINGS, current);
    migrated.schemaVersion = GLOBAL_SCHEMA_VERSION;
    migrated.rootId = typeof migrated.rootId === 'string' && migrated.rootId
        ? migrated.rootId
        : idFactory();
    migrated.createdAt = typeof migrated.createdAt === 'string' && migrated.createdAt
        ? migrated.createdAt
        : at;
    migrated.updatedAt = typeof migrated.updatedAt === 'string' && migrated.updatedAt
        ? migrated.updatedAt
        : at;
    migrated.migrations = Array.isArray(migrated.migrations) ? migrated.migrations : [];
    if (fromVersion < 4 && isRecord(migrated.firstRun)) {
        delete migrated.firstRun.recallLimitsConfirmed;
        if (Object.keys(migrated.firstRun).length === 0) delete migrated.firstRun;
    }
    if (fromVersion < 7) {
        migrated.recall.memoryInjectionDepth = Number.isInteger(Number(current?.recall?.memoryInjectionDepth))
            ? Number(current.recall.memoryInjectionDepth)
            : (Number.isInteger(Number(current?.recall?.injectionDepth)) ? Number(current.recall.injectionDepth) : 9999);
        migrated.recall.specialDateInjectionDepth = Number.isInteger(Number(current?.recall?.specialDateInjectionDepth))
            ? Number(current.recall.specialDateInjectionDepth)
            : (Number.isInteger(Number(current?.recall?.injectionDepth)) ? Number(current.recall.injectionDepth) : 9999);
        delete migrated.recall.injectionDepth;
        delete migrated.templates.anniversaryDay;
        delete migrated.templates.anniversaryAdvance;
    }
    if (fromVersion < 8) {
        migrated.recall.storyTimeInjectionDepth = Number.isInteger(Number(current?.recall?.storyTimeInjectionDepth))
            ? Number(current.recall.storyTimeInjectionDepth)
            : 0;
        migrated.recall.holidayInjectionDepth = Number.isInteger(Number(current?.recall?.holidayInjectionDepth))
            ? Number(current.recall.holidayInjectionDepth)
            : 0;
    }
    if (fromVersion < 9) {
        const savedSchemes = current?.summary?.promptSchemes;
        migrated.summary.promptSchemes = Array.isArray(savedSchemes) && savedSchemes.length
            ? savedSchemes
            : [];
        let availableIds = migrated.summary.promptSchemes
            .map(scheme => typeof scheme?.id === 'string' ? scheme.id.trim() : '')
            .filter(Boolean);
        if (availableIds.length === 0) {
            availableIds = [];
        }
        const requestedActiveId = typeof current?.summary?.activePromptSchemeId === 'string'
            ? current.summary.activePromptSchemeId.trim()
            : '';
        migrated.summary.activePromptSchemeId = availableIds.includes(requestedActiveId)
            ? requestedActiveId
            : (availableIds.includes(DEFAULT_SUMMARY_PROMPT_SCHEME_ID)
                ? DEFAULT_SUMMARY_PROMPT_SCHEME_ID
                : (availableIds[0] ?? ''));
        migrated.summary.sendFormatExample = current?.summary?.sendFormatExample !== false;
        migrated.summary.manualReviewEnabled = current?.summary?.manualReviewEnabled !== false;
    }
    if (fromVersion < 10) {
        const legacySchemes = Array.isArray(current?.summary?.promptSchemes) && current.summary.promptSchemes.length
            ? current.summary.promptSchemes
            : [];
        const migratedSummaries = legacySchemes.map(summarySchemeWithoutLegacyKeywordBlock);
        migrated.summary.summaryPromptSchemes = migratedSummaries.length
            ? migratedSummaries
            : [createDefaultSummaryPromptScheme({ now: () => new Date(at) })];
        const migratedKeywords = legacySchemes.map(keywordBlockFromLegacyScheme).filter(Boolean);
        migrated.summary.keywordPromptSchemes = migratedKeywords.length
            ? migratedKeywords
            : [createDefaultKeywordPromptScheme({ now: () => new Date(at) })];
        const oldActive = typeof current?.summary?.activePromptSchemeId === 'string' ? current.summary.activePromptSchemeId.trim() : '';
        const summaryIds = migrated.summary.summaryPromptSchemes.map(item => item?.id).filter(Boolean);
        migrated.summary.activeSummaryPromptSchemeId = summaryIds.includes(oldActive)
            ? oldActive
            : (summaryIds.includes(DEFAULT_SUMMARY_PROMPT_SCHEME_ID) ? DEFAULT_SUMMARY_PROMPT_SCHEME_ID : summaryIds[0]);
        const preferredKeywordId = oldActive === DEFAULT_SUMMARY_PROMPT_SCHEME_ID ? DEFAULT_KEYWORD_PROMPT_SCHEME_ID : `keyword-${oldActive}`;
        const keywordIds = migrated.summary.keywordPromptSchemes.map(item => item?.id).filter(Boolean);
        migrated.summary.activeKeywordPromptSchemeId = keywordIds.includes(preferredKeywordId)
            ? preferredKeywordId
            : (keywordIds.includes(DEFAULT_KEYWORD_PROMPT_SCHEME_ID) ? DEFAULT_KEYWORD_PROMPT_SCHEME_ID : keywordIds[0]);
        migrated.summary.generationMode = current?.summary?.generationMode === 'fast' ? 'fast' : 'quality';
        delete migrated.summary.promptSchemes;
        delete migrated.summary.activePromptSchemeId;
    }
    if (fromVersion < 11) {
        const existingArchive = isRecord(current?.summary?.legacyPromptArchive)
            ? current.summary.legacyPromptArchive
            : null;
        if (existingArchive) {
            migrated.summary.legacyPromptArchive = existingArchive;
        } else if (hadLegacyPromptSettings) {
            migrated.summary.legacyPromptArchive = {
                activeSummaryPromptSchemeId: migrated.summary.activeSummaryPromptSchemeId,
                summaryPromptSchemes: migrated.summary.summaryPromptSchemes,
                activeKeywordPromptSchemeId: migrated.summary.activeKeywordPromptSchemeId,
                keywordPromptSchemes: migrated.summary.keywordPromptSchemes,
                sendFormatExample: migrated.summary.sendFormatExample,
            };
        } else {
            delete migrated.summary.legacyPromptArchive;
        }
        migrated.summary.summaryUserInstructions = typeof current?.summary?.summaryUserInstructions === 'string'
            ? current.summary.summaryUserInstructions
            : '';
        migrated.summary.keywordUserInstructions = typeof current?.summary?.keywordUserInstructions === 'string'
            ? current.summary.keywordUserInstructions
            : '';
        migrated.summary.fastModeWarningAcknowledged = current?.summary?.generationMode === 'fast'
            || current?.summary?.fastModeWarningAcknowledged === true;
        delete migrated.summary.activeSummaryPromptSchemeId;
        delete migrated.summary.summaryPromptSchemes;
        delete migrated.summary.activeKeywordPromptSchemeId;
        delete migrated.summary.keywordPromptSchemes;
        delete migrated.summary.sendFormatExample;
        delete migrated.summary.activePromptSchemeId;
        delete migrated.summary.promptSchemes;
    }
    if (fromVersion < 12) {
        migrateLegacyPromptInstructions(migrated.summary);
    } else {
        migrated.summary.promptOverrides = normalizePromptOverrides(migrated.summary.promptOverrides);
        delete migrated.summary.summaryUserInstructions;
        delete migrated.summary.keywordUserInstructions;
    }
    if (fromVersion < 13) {
        migrated.summary.eventLibraryOverride = normalizeEventLibraryOverride(current?.summary?.eventLibraryOverride);
    } else {
        migrated.summary.eventLibraryOverride = normalizeEventLibraryOverride(migrated.summary.eventLibraryOverride);
    }
    migrated.templates = isRecord(migrated.templates) ? migrated.templates : {};
    migrated.summary.promptProfiles = normalizePromptProfiles(migrated.summary.promptProfiles);
    if (!migrated.summary.promptProfiles.some(p => p.id === migrated.summary.activePromptProfileId)) migrated.summary.activePromptProfileId = null;
    migrated.templates.storyTimeInstruction = typeof migrated.templates.storyTimeInstruction === 'string'
        ? migrated.templates.storyTimeInstruction
        : '';
    migrated.templates.holidayInstruction = typeof migrated.templates.holidayInstruction === 'string'
        ? migrated.templates.holidayInstruction
        : '';
    migrated.defaults.holidayAdvanceDays = Number.isInteger(Number(migrated.defaults?.holidayAdvanceDays))
        && Number(migrated.defaults.holidayAdvanceDays) >= 0
        ? Number(migrated.defaults.holidayAdvanceDays)
        : 0;
    migrated.recall.excludedTerms = normalizeRecallExcludedTerms(migrated.recall.excludedTerms);
    if (fromVersion < 19) {
        const globalMigration = migrateCaptureTokens(migrated.modules, 'g', Number(migrated.moduleCaptureCounters?.global) || 0);
        migrated.modules = globalMigration.values;
        let characterCounter = Number(migrated.moduleCaptureCounters?.character) || 0;
        migrated.characterModuleStores = (Array.isArray(migrated.characterModuleStores) ? migrated.characterModuleStores : []).map(store => {
            if (!isRecord(store)) return store;
            const characterMigration = migrateCaptureTokens(store.modules, 'c', characterCounter);
            characterCounter = characterMigration.counter;
            return { ...store, modules: characterMigration.values };
        });
        migrated.moduleCaptureCounters = { global: globalMigration.counter, character: characterCounter };
    }
    migrated.modules = normalizePromptModules(migrated.modules, 'global');
    if (fromVersion < 18 && !migrated.modules.some(module => module.id === STORY_STATUS_BAR_MODULE_ID)) {
        migrated.modules.push(createStoryStatusBarPreset());
    }
    migrated.moduleResults = normalizeModuleResults(migrated.moduleResults);
    migrated.characterModuleStores = normalizeCharacterModuleStores(migrated.characterModuleStores);
    const storedGlobalCounter = Number(migrated.moduleCaptureCounters?.global);
    const storedCharacterCounter = Number(migrated.moduleCaptureCounters?.character);
    migrated.moduleCaptureCounters = {
        global: Math.max(Number.isSafeInteger(storedGlobalCounter) ? storedGlobalCounter : 0, maxCaptureSequence('g', migrated.modules, migrated.moduleResults)),
        character: Math.max(Number.isSafeInteger(storedCharacterCounter) ? storedCharacterCounter : 0, ...migrated.characterModuleStores.map(store => maxCaptureSequence('c', store.modules, store.moduleResults))),
    };
    if (fromVersion < GLOBAL_SCHEMA_VERSION) {
        migrated.migrations = [...migrated.migrations, migrationEntry(fromVersion, at)];
        migrated.updatedAt = at;
    }
    return { data: migrated, migrated: fromVersion < GLOBAL_SCHEMA_VERSION, fromVersion };
}
