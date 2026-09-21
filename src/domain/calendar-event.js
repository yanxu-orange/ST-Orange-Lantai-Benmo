import { compareCalendarDates, daysInCalendarMonth, monthsInCalendarYear, normalizeCalendarDate, resolveFictionalYearScheme } from './calendar.js';
import { modernCalendarOverlay } from './modern-calendar-overlay.js';

const EVENT_KINDS = new Set(['schedule', 'holiday']);
const EVENT_REPEATS = new Set(['once', 'yearly']);
const EVENT_STATUSES = new Set(['enabled', 'paused']);

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function nonNegativeInteger(value, label, fallback = 0) {
    const number = value === '' || value === null || value === undefined ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${label}必须是非负整数。`);
    return number;
}

function positiveInteger(value, label, fallback = 1) {
    const number = value === '' || value === null || value === undefined ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 1) throw new Error(`${label}必须是正整数。`);
    return number;
}

export function normalizeCalendarEvent(calendar, input, { idFactory, now = () => new Date().toISOString() } = {}) {
    if (!calendar?.id) throw new Error('事件所属历法不可用。');
    const kind = text(input?.kind) || 'schedule';
    if (!EVENT_KINDS.has(kind)) throw new Error('日历事件类型不可用。');
    const name = text(input?.name);
    if (!name) throw new Error(kind === 'holiday' ? '请填写节日名称。' : '请填写日程安排名称。');
    const id = text(input?.id) || idFactory?.();
    if (!id) throw new Error('日历事件 ID 不可用。');
    const repeat = kind === 'holiday' ? 'yearly' : (EVENT_REPEATS.has(input?.repeat) ? input.repeat : 'once');
    const status = EVENT_STATUSES.has(input?.status) ? input.status : 'enabled';
    const ruleType = ['fixed', 'lunar', 'lunar-year-end', 'solar-term'].includes(input?.dateRule?.type)
        ? input.dateRule.type : 'fixed';
    const dateRule = kind === 'holiday' ? normalizeHolidayRule(calendar, { ...input?.dateRule, type: ruleType }, input?.date) : null;
    const at = typeof now === 'function' ? now() : String(now);
    return {
        id,
        calendarId: calendar.id,
        kind,
        name,
        date: kind === 'holiday'
            ? (ruleType === 'fixed' ? normalizeHolidayFixedDate(calendar, dateRule) : null)
            : normalizeCalendarDate(calendar, input?.date),
        ...(kind === 'holiday' ? {
            dateRule,
            templateId: text(input?.templateId) || null,
            templatePack: text(input?.templatePack) || null,
        } : {}),
        repeat,
        advanceDays: nonNegativeInteger(input?.advanceDays, '提前提醒天数'),
        durationDays: positiveInteger(input?.durationDays, '持续天数'),
        fact: text(input?.fact),
        tellAi: false,
        status,
        createdAt: text(input?.createdAt) || at,
        updatedAt: at,
    };
}

function normalizeHolidayFixedDate(calendar, rule) {
    // The stored year is only a validation anchor: fixed holidays repeat yearly.
    // Use a leap year for modern calendars so a user can define February 29.
    return normalizeCalendarDate(calendar, {
        calendarId: calendar.id,
        year: calendar.type === 'modern' ? 2000 : 1,
        month: rule.month,
        day: rule.day,
    });
}

function normalizeHolidayRule(calendar, rule, fallbackDate) {
    if (rule.type === 'solar-term') {
        const name = text(rule.name);
        if (!name) throw new Error('请选择节气。');
        if (calendar.type === 'custom') throw new Error('自定义历法不支持跟随节气。');
        if (calendar.type === 'fictional') {
            const schemes = Array.isArray(calendar.config?.schemes) ? calendar.config.schemes : [];
            const configured = schemes.length > 0 && schemes.every(scheme =>
                scheme.solarTerms?.some(item => item.name === name));
            if (!configured) throw new Error(`需先为所有年份规则配置「${name}」节气。`);
        }
        return { type: 'solar-term', name };
    }
    if (rule.type === 'lunar-year-end') return { type: 'lunar-year-end' };
    const month = Number(rule.month ?? fallbackDate?.month);
    const day = Number(rule.day ?? fallbackDate?.day);
    const maxMonth = rule.type === 'lunar' || calendar.type === 'modern'
        ? 12
        : monthsInCalendarYear(calendar, 1).length;
    const maxDay = rule.type === 'lunar' ? 30 : (Number.isInteger(month) && month >= 1 && month <= maxMonth
        ? daysInCalendarMonth(calendar, calendar.type === 'modern' ? 2000 : 1, month)
        : 31);
    if (!Number.isInteger(month) || month < 1 || month > maxMonth || !Number.isInteger(day) || day < 1 || day > maxDay) {
        throw new Error('节日日期不合法。');
    }
    if (rule.type === 'lunar' && calendar.type === 'custom') throw new Error('自定义历法不支持现实农历日期。');
    return { type: rule.type, month, day, leap: Boolean(rule.leap) };
}

export function calendarEventMatchesDate(event, date, { calendar = null } = {}) {
    if (!event || !date || event.calendarId !== date.calendarId) return false;
    if (event.kind === 'holiday') return holidayMatchesDate(event, date, calendar);
    if (event.repeat === 'yearly') return event.date.month === date.month && event.date.day === date.day;
    return compareCalendarDates(event.date, date) === 0;
}

function nextModernDate(date) {
    const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function holidayMatchesDate(event, date, calendar) {
    const rule = event.dateRule ?? { type: 'fixed', month: event.date?.month, day: event.date?.day };
    if (rule.type === 'fixed') return Number(rule.month) === date.month && Number(rule.day) === date.day;
    if (!calendar) return false;
    if (rule.type === 'solar-term') {
        if (calendar.type === 'modern') return modernCalendarOverlay(date.year, date.month, date.day).solarTerm === rule.name;
        if (calendar.type !== 'fictional') return false;
        const month = monthsInCalendarYear(calendar, date.year)[date.month - 1];
        const scheme = resolveFictionalYearScheme(calendar, date.year);
        return scheme?.solarTerms?.some(item => item.name === rule.name && item.monthId === month?.id && Number(item.day) === date.day) ?? false;
    }
    if (rule.type === 'lunar-year-end') {
        if (calendar.type === 'modern') {
            const next = nextModernDate(date);
            const overlay = modernCalendarOverlay(next.year, next.month, next.day);
            return overlay.available && overlay.lunar?.monthNumber === 1 && overlay.lunar?.day === 1 && !overlay.lunar?.leap;
        }
        const months = monthsInCalendarYear(calendar, date.year);
        return date.month === months.length && date.day === months.at(-1)?.days;
    }
    if (rule.type === 'lunar') {
        if (calendar.type === 'modern') {
            const lunar = modernCalendarOverlay(date.year, date.month, date.day).lunar;
            return lunar?.monthNumber === Number(rule.month) && lunar.day === Number(rule.day) && lunar.leap === Boolean(rule.leap);
        }
        if (calendar.type !== 'fictional') return false;
        const month = monthsInCalendarYear(calendar, date.year)[date.month - 1];
        return month?.ordinal === Number(rule.month) && month.isLeap === Boolean(rule.leap) && date.day === Number(rule.day);
    }
    return false;
}

export function calendarEventOccursOn(event, date, options) {
    return event?.status === 'enabled' && calendarEventMatchesDate(event, date, options);
}

export function listCalendarEventsForDate(events, date, options) {
    return (Array.isArray(events) ? events : []).filter(event => calendarEventOccursOn(event, date, options));
}
