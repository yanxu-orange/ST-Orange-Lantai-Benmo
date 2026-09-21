import { comparableYear, shiftStoryYears } from '../domain/story-time.js';

function pointValue(point) {
    return point?.value ?? point ?? null;
}

function sameCalendar(left, right) {
    return left?.calendar === right?.calendar;
}

export function storyYearDistance(currentPoint, pastPoint, fictionalCalendar = {}) {
    const current = pointValue(currentPoint);
    const past = pointValue(pastPoint);
    if (!current || !past || !sameCalendar(current, past)) return null;
    const currentYear = comparableYear(current, fictionalCalendar);
    const pastYear = comparableYear(past, fictionalCalendar);
    if (currentYear !== null && pastYear !== null) return currentYear - pastYear;
    if (current.calendar === 'era' && current.era === past.era) return current.year - past.year;
    return null;
}

export function daysUntilMonthDay(currentStoryTime, month, day) {
    const current = pointValue(currentStoryTime);
    if (!current?.month || !current?.day) return null;
    const baseYear = 2000;
    const from = Date.UTC(baseYear, current.month - 1, current.day);
    let to = Date.UTC(baseYear, month - 1, day);
    if (to < from) to = Date.UTC(baseYear + 1, month - 1, day);
    return Math.round((to - from) / 86400000);
}

function chineseNumber(value) {
    if (!Number.isInteger(value) || value < 1) return String(value);
    const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (value < 10) return digits[value];
    if (value < 20) return `十${digits[value - 10]}`;
    if (value < 100) return `${digits[Math.floor(value / 10)]}十${digits[value % 10]}`;
    return String(value);
}

function displayAnniversaryName(name, currentStoryTime, fictionalCalendar) {
    if (!name.startYear) return name.name;
    const years = storyYearDistance(currentStoryTime, name.startYear, fictionalCalendar);
    if (!Number.isInteger(years) || years < 1) return name.name;
    const base = name.name.replace(/纪念日$/u, '');
    return `${base}${chineseNumber(years)}周年纪念日`;
}

function occurrencePoint(current, month, day, fictionalCalendar) {
    const crossesYear = month < current.month || (month === current.month && day < current.day);
    const yearPoint = crossesYear ? shiftStoryYears(current, 1, fictionalCalendar) : current;
    return yearPoint ? { ...yearPoint, month, day } : { ...current, month, day };
}

function dateLabel(value) {
    const year = value.calendar === 'era' ? `${value.era}${value.year}年` : `${value.year}年`;
    return `${year}${value.month}月${value.day}日`;
}

export function evaluateAnniversaryOccurrences({
    anniversaries = [], currentStoryTime = null, defaultAdvanceDays = 3,
    fictionalCalendar = {},
} = {}) {
    const current = pointValue(currentStoryTime);
    if (!current?.month || !current?.day) return [];
    return anniversaries.filter(item => item.status === 'enabled').map(item => {
        const daysUntil = daysUntilMonthDay(current, item.month, item.day);
        const advanceDays = item.advance?.mode === 'off' ? 0
            : (item.advance?.mode === 'override' ? item.advance.days : defaultAdvanceDays);
        const kind = daysUntil === 0 ? 'day' : (daysUntil >= 1 && daysUntil <= advanceDays ? 'advance' : null);
        if (!kind) return null;
        const target = occurrencePoint(current, item.month, item.day, fictionalCalendar);
        const names = item.names.map(name => displayAnniversaryName(name, target, fictionalCalendar));
        const date = dateLabel(target);
        const eventNames = names.join('、');
        const fact = kind === 'day'
            ? `今天是 ${date}，纪念日为「${eventNames}」。`
            : `距离 ${date} 的「${eventNames}」还有 ${daysUntil} 天。`;
        const personalPrompts = item.names.map((name, index) => ({
            name: names[index] ?? name.name,
            text: String(name.personalPrompt ?? '').trim(),
        })).filter(entry => entry.text);
        return {
            anniversary: item, kind, daysUntil, names,
            facts: { date, eventNames, daysUntil, kind },
            prompt: fact,
            personalPrompts,
        };
    }).filter(Boolean).sort((a, b) => a.daysUntil - b.daysUntil
        || a.anniversary.month - b.anniversary.month
        || a.anniversary.day - b.anniversary.day
        || String(a.anniversary.id).localeCompare(String(b.anniversary.id)));
}
