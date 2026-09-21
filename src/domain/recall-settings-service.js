import { normalizeRecallExcludedTerms } from '../recall/excluded-terms.js';

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        const range = max === Number.MAX_SAFE_INTEGER ? `不小于 ${min}` : `${min}–${max} 之间`;
        throw new Error(`${label}必须填写${range}的整数。`);
    }
    return number;
}

function optionalPositiveInteger(value, label) {
    if (value === '' || value === null || value === undefined) return null;
    return integer(value, label, { min: 1 });
}

export function normalizeRecallSettings(input = {}) {
    const countEnabled = input.countEnabled !== false;
    const tokenEnabled = Boolean(input.tokenEnabled);
    if (!countEnabled && !tokenEnabled) throw new Error('条数上限与 Token 上限至少开启一项。');
    return {
        recentFloorCount: integer(input.recentFloorCount, '最近楼层数 R', { min: 0 }),
        triggerLimits: {
            countEnabled,
            maxCount: countEnabled ? integer(input.maxCount, '最大召回条数', { min: 1 }) : (Number.isInteger(Number(input.maxCount)) ? Number(input.maxCount) : 5),
            tokenEnabled,
            maxTokens: tokenEnabled ? integer(input.maxTokens, 'Token 上限', { min: 1 }) : (Number.isInteger(Number(input.maxTokens)) && Number(input.maxTokens) > 0 ? Number(input.maxTokens) : null),
        },
        anniversaryPoolLimit: optionalPositiveInteger(input.anniversaryPoolLimit, '特殊召回最多条数'),
        automaticSameDayEnabled: input.automaticSameDayEnabled !== false,
        memoryInjectionDepth: integer(input.memoryInjectionDepth, '记忆注入深度', { min: 0, max: 10000 }),
        specialDateInjectionDepth: integer(input.specialDateInjectionDepth, '纪念日注入深度', { min: 0, max: 10000 }),
        storyTimeReminderEnabled: Boolean(input.storyTimeReminderEnabled),
        storyTimeInjectionDepth: integer(input.storyTimeInjectionDepth, '当前故事日期注入深度', { min: 0, max: 10000 }),
        holidayInjectionDepth: integer(input.holidayInjectionDepth, '当日节日提示注入深度', { min: 0, max: 10000 }),
        excludedTerms: normalizeRecallExcludedTerms(input.excludedTerms),
    };
}

export class RecallSettingsService {
    constructor({ chatDataService, getGlobalSettings, saveGlobalSettings } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (typeof getGlobalSettings !== 'function') throw new TypeError('getGlobalSettings 不可用。');
        if (typeof saveGlobalSettings !== 'function') throw new TypeError('saveGlobalSettings 不可用。');
        this.chatDataService = chatDataService;
        this.getGlobalSettings = getGlobalSettings;
        this.saveGlobalSettings = saveGlobalSettings;
    }

    ensureInitialized() {
        const settings = this.getGlobalSettings();
        settings.recall ??= {};
        if (settings.recall.initialized === true) return settings.recall;
        let legacy = {};
        try { legacy = this.chatDataService.readCurrent().recall ?? {}; } catch { /* No chat: initialize from global defaults. */ }
        settings.recall = {
            initialized: true,
            recentFloorCount: legacy.recentFloorCount ?? settings.recall.recentFloorCount ?? 6,
            automaticSameDayEnabled: legacy.automaticSameDayEnabled ?? settings.recall.automaticSameDayEnabled ?? true,
            triggerLimits: {
                countEnabled: legacy.triggerLimits?.countEnabled ?? settings.recall.triggerLimits?.countEnabled ?? true,
                maxCount: legacy.triggerLimits?.maxCount ?? settings.recall.triggerLimits?.maxCount ?? 5,
                tokenEnabled: legacy.triggerLimits?.tokenEnabled ?? settings.recall.triggerLimits?.tokenEnabled ?? false,
                maxTokens: legacy.triggerLimits?.maxTokens ?? settings.recall.triggerLimits?.maxTokens ?? null,
            },
            anniversaryPoolLimit: legacy.anniversaryPoolLimit ?? settings.recall.anniversaryPoolLimit ?? 2,
            memoryInjectionDepth: settings.recall.memoryInjectionDepth ?? 9999,
            specialDateInjectionDepth: settings.recall.specialDateInjectionDepth ?? 9999,
            storyTimeReminderEnabled: settings.recall.storyTimeReminderEnabled === true,
            storyTimeInjectionDepth: settings.recall.storyTimeInjectionDepth ?? 0,
            holidayInjectionDepth: settings.recall.holidayInjectionDepth ?? 0,
            excludedTerms: normalizeRecallExcludedTerms(settings.recall.excludedTerms),
        };
        this.saveGlobalSettings();
        return settings.recall;
    }

    read() {
        const recall = this.ensureInitialized();
        return {
            recentFloorCount: recall.recentFloorCount ?? 6,
            countEnabled: recall.triggerLimits?.countEnabled !== false,
            maxCount: recall.triggerLimits?.maxCount ?? 5,
            tokenEnabled: Boolean(recall.triggerLimits?.tokenEnabled),
            maxTokens: recall.triggerLimits?.maxTokens ?? '',
            anniversaryPoolLimit: recall.anniversaryPoolLimit ?? 2,
            automaticSameDayEnabled: recall.automaticSameDayEnabled !== false,
            memoryInjectionDepth: recall.memoryInjectionDepth ?? 9999,
            specialDateInjectionDepth: recall.specialDateInjectionDepth ?? 9999,
            storyTimeReminderEnabled: recall.storyTimeReminderEnabled === true,
            storyTimeInjectionDepth: recall.storyTimeInjectionDepth ?? 0,
            holidayInjectionDepth: recall.holidayInjectionDepth ?? 0,
            excludedTerms: normalizeRecallExcludedTerms(recall.excludedTerms),
        };
    }

    async save(input) {
        const normalized = normalizeRecallSettings(input);
        const settings = this.getGlobalSettings();
        const previous = structuredClone(settings.recall ?? {});
        settings.recall = { initialized: true, ...normalized };
        try {
            await this.saveGlobalSettings();
        } catch (error) {
            settings.recall = previous;
            throw error;
        }
        return structuredClone(settings.recall);
    }

    async addExcludedTerm(value) {
        const term = String(value ?? '').trim();
        if (!term) throw new Error('请输入排除词。');
        const current = this.read();
        if (current.excludedTerms.includes(term)) return current;
        await this.save({ ...current, excludedTerms: [...current.excludedTerms, term] });
        return this.read();
    }

    async removeExcludedTerm(value) {
        const term = String(value ?? '').trim();
        const current = this.read();
        if (!current.excludedTerms.includes(term)) return current;
        await this.save({ ...current, excludedTerms: current.excludedTerms.filter(item => item !== term) });
        return this.read();
    }
}
