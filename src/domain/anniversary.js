import { createStableId, isoNow } from '../storage/schema-utils.js';
import { parseStoryTimeValue } from './story-time.js';

export const ANNIVERSARY_STATUSES = Object.freeze(['enabled', 'pending', 'paused']);

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }

export function parseAnniversaryStartYear(raw, { fictionalCalendar = {} } = {}) {
    const text = clean(raw);
    if (!text) return null;
    if (/^\d{3,4}$/.test(text)) return { calendar: 'gregorian', era: null, year: Number(text) };
    const parsed = parseStoryTimeValue(text, { fictionalCalendar });
    return parsed ? { calendar: parsed.calendar, era: parsed.era, year: parsed.year } : null;
}

function normalizeNames(names, options) {
    const result = [];
    const seen = new Set();
    for (const item of names ?? []) {
        const name = clean(item?.name);
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        const startYearRaw = clean(item?.startYearRaw ?? item?.startYear);
        result.push({
            id: clean(item?.id) || createStableId('anniversary-name'),
            name,
            personalPrompt: clean(item?.personalPrompt),
            startYearRaw,
            startYear: parseAnniversaryStartYear(startYearRaw, options),
        });
    }
    return result;
}

export function validateAnniversaryInput(input, { fictionalCalendar = {} } = {}) {
    const errors = {};
    const month = Number(input?.month);
    const day = Number(input?.day);
    if (!Number.isInteger(month) || month < 1 || month > 12) errors.month = '请填写 1–12 月。';
    if (!Number.isInteger(day) || day < 1 || day > 31) errors.day = '请填写有效日期。';
    if (!errors.month && !errors.day) {
        const date = new Date(Date.UTC(2000, month - 1, day));
        if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) errors.day = '请填写有效日期。';
    }
    if (!(input?.names ?? []).some(item => clean(item?.name))) errors.names = '请至少填写一个纪念日名称。';
    if ((input?.names ?? []).some(item => {
        const raw = clean(item?.startYearRaw ?? item?.startYear);
        return raw && !parseAnniversaryStartYear(raw, { fictionalCalendar });
    })) errors.names = '起始年无法识别，请填写公历年份或已配置的故事年号。';
    if (!ANNIVERSARY_STATUSES.includes(input?.status ?? 'enabled')) errors.status = '纪念日状态无效。';
    const advanceMode = input?.advance?.mode ?? 'inherit';
    if (!['inherit', 'override', 'off'].includes(advanceMode)) errors.advance = '提前提醒设置无效。';
    if (advanceMode === 'override') {
        const days = Number(input?.advance?.days);
        if (!Number.isInteger(days) || days < 0) errors.advance = '提前天数必须是 0 或正整数。';
    }
    return errors;
}

export function createAnniversary(input, {
    now,
    idFactory = () => createStableId('anniversary'),
    fictionalCalendar = {},
} = {}) {
    const errors = validateAnniversaryInput(input, { fictionalCalendar });
    if (Object.keys(errors).length) {
        const error = new Error('纪念日内容尚未填写完整。');
        error.code = 'ANNIVERSARY_VALIDATION_FAILED';
        error.fields = errors;
        throw error;
    }
    const at = isoNow(now);
    const advanceMode = input?.advance?.mode ?? 'inherit';
    return {
        id: idFactory(),
        status: input.status ?? 'enabled',
        month: Number(input.month),
        day: Number(input.day),
        names: normalizeNames(input.names, { fictionalCalendar }),
        advance: {
            mode: advanceMode,
            days: advanceMode === 'override' ? Number(input.advance.days) : null,
        },
        templates: {
            day: clean(input?.templates?.day),
            advance: clean(input?.templates?.advance),
        },
        source: {
            type: input?.source?.type === 'summary' ? 'summary' : 'manual',
            batchId: input?.source?.batchId ?? null,
            floorRange: input?.source?.floorRange ?? null,
        },
        createdAt: at,
        updatedAt: at,
    };
}

export function updateAnniversary(existing, patch, options = {}) {
    if (!existing) throw new Error('找不到要编辑的纪念日。');
    const replacement = createAnniversary({ ...existing, ...patch }, {
        ...options,
        idFactory: () => existing.id,
    });
    replacement.createdAt = existing.createdAt;
    replacement.source = structuredClone(existing.source);
    return replacement;
}
