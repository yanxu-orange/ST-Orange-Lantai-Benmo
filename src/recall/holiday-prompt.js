import { monthsInCalendarYear, normalizeCalendarDate, shiftCalendarDays } from '../domain/calendar.js';
import { calendarEventMatchesDate, calendarEventOccursOn } from '../domain/calendar-event.js';
import { holidayTemplatePacks, holidayTemplates } from '../domain/holiday-templates.js';
import { comparableYear } from '../domain/story-time.js';

function activeCalendar(data) {
    const calendar = data?.calendar ?? {};
    return (calendar.definitions ?? []).find(item => item.id === calendar.activeCalendarId) ?? null;
}

export function currentStoryCalendarDate(data, calendar = activeCalendar(data)) {
    const value = data?.storyTime?.current?.value;
    if (!calendar || !value || !Number.isInteger(value.month) || !Number.isInteger(value.day)) return null;
    try {
        if (calendar.type === 'modern') {
            if (value.calendar !== 'gregorian' || !Number.isInteger(value.year)) return null;
            return normalizeCalendarDate(calendar, { year: value.year, month: value.month, day: value.day });
        }
        const year = comparableYear(value, data?.storyTime?.fictionalCalendar) ?? value.year;
        if (!Number.isInteger(year) || year < 1) return null;
        if (calendar.type === 'fictional') {
            if (value.calendar !== 'era') return null;
            const months = monthsInCalendarYear(calendar, year);
            const month = months.findIndex(item => item.ordinal === value.month && item.isLeap === Boolean(value.isLeapMonth)) + 1;
            if (month < 1) return null;
            return normalizeCalendarDate(calendar, { year, month, day: value.day });
        }
        return normalizeCalendarDate(calendar, { year, month: value.month, day: value.day });
    } catch {
        return null;
    }
}

export const DEFAULT_HOLIDAY_INSTRUCTION = '仅在与正在发生的剧情自然相关时参考，不要机械复述，也不要把习俗视为所有地区与角色都必须遵循的规则。';

function selectedTemplateEntries(data, calendar, date) {
    const selected = new Set(calendar.config?.holidaySettings?.reminderTemplateIds ?? []);
    if (!selected.size) return [];
    const overrides = new Map((data?.calendar?.events ?? [])
        .filter(item => item?.kind === 'holiday' && item.calendarId === calendar.id && item.templateId)
        .map(item => [item.templateId, item]));
    return holidayTemplatePacks(calendar.type)
        .flatMap(pack => holidayTemplates(pack.id, calendar.type))
        .filter(template => selected.has(template.id))
        .map(template => overrides.get(template.id) ?? {
            calendarId: calendar.id,
            kind: 'holiday',
            name: template.name,
            fact: template.fact,
            dateRule: template.rule,
            templateId: template.id,
            templatePack: template.packId,
        })
        .filter(item => calendarEventMatchesDate(item, date, { calendar }));
}

export function holidayPromptContext(data, { userInstruction = '', advanceDays = 0 } = {}) {
    const calendar = activeCalendar(data);
    if (!calendar) return { prompt: '', items: [], date: null };
    const date = currentStoryCalendarDate(data, calendar);
    if (!date) return { prompt: '', items: [], date: null };
    const items = new Map();
    const limit = Number.isInteger(Number(advanceDays)) && Number(advanceDays) > 0 ? Number(advanceDays) : 0;
    for (let offset = 0; offset <= limit; offset += 1) {
        const candidate = offset === 0 ? date : shiftCalendarDays(calendar, date, offset);
        if (!candidate) continue;
        for (const template of selectedTemplateEntries(data, calendar, candidate)) {
            items.set(`${template.name}:${offset}`, { name: template.name, fact: template.fact ?? '', source: 'template', daysUntil: offset });
        }
        for (const event of data?.calendar?.events ?? []) {
            if (event?.kind !== 'holiday' || event.templateId) continue;
            if (!calendarEventOccursOn(event, candidate, { calendar })) continue;
            items.set(`${event.name}:${offset}`, { name: event.name, fact: event.fact ?? '', source: 'custom', daysUntil: offset });
        }
    }
    const resolved = [...items.values()];
    if (!resolved.length) return { prompt: '', items: [], date };
    const lines = resolved.map(item => {
        const prefix = item.daysUntil > 0 ? `距离${item.name}还有 ${item.daysUntil} 天` : item.name;
        return item.fact ? `${prefix}：${item.fact}` : prefix;
    });
    return {
        prompt: [
            '<time_keyword_holiday>',
            '当前故事日期对应以下节日。',
            DEFAULT_HOLIDAY_INSTRUCTION,
            ...(String(userInstruction ?? '').trim() ? [String(userInstruction).trim()] : []),
            ...lines,
            '</time_keyword_holiday>',
        ].join('\n\n'),
        items: resolved,
        date,
    };
}
