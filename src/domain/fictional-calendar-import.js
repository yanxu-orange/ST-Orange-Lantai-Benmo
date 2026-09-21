import { createTraditionalFictionalMonths } from './calendar.js';
import { MODERN_CALENDAR_OVERLAY_RANGE, solarTermsForYear } from './modern-calendar-overlay.js';

const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

function canonicalMonthName(value) {
    const leap = value.startsWith('闰');
    const raw = leap ? value.slice(1) : value;
    const name = raw === '十一月' ? '冬月' : (raw === '十二月' ? '腊月' : raw);
    return leap ? `闰${name}` : name;
}

function lunarParts(date) {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(item => [item.type, item.value]));
    return {
        relatedYear: Number(parts.relatedYear),
        month: canonicalMonthName(String(parts.month ?? '')),
        day: Number(parts.day),
    };
}

function assertImportYear(year) {
    const value = Number(year);
    if (!Number.isInteger(value) || value < MODERN_CALENDAR_OVERLAY_RANGE.startYear || value > MODERN_CALENDAR_OVERLAY_RANGE.endYear) {
        throw new Error(`可导入的现实农历年份为 ${MODERN_CALENDAR_OVERLAY_RANGE.startYear}–${MODERN_CALENDAR_OVERLAY_RANGE.endYear}。`);
    }
    return value;
}

function scanLunarMonths(year) {
    const order = [];
    const lengths = new Map();
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 2, 1);
    for (let time = start; time < end; time += 86400000) {
        const parts = lunarParts(new Date(time));
        if (parts.relatedYear !== year || !parts.month || !Number.isInteger(parts.day)) continue;
        if (!lengths.has(parts.month)) order.push(parts.month);
        lengths.set(parts.month, Math.max(lengths.get(parts.month) ?? 0, parts.day));
    }
    return { order, lengths };
}

function importedSolarTerms(year, schemeMonths, leapMonth) {
    const monthIds = new Map(schemeMonths.map(month => [month.name, month.id]));
    if (leapMonth) monthIds.set(`闰${schemeMonths[leapMonth.afterMonth - 1].name}`, `leap-month-${leapMonth.afterMonth}`);
    const result = [];
    for (const sourceYear of [year, year + 1]) {
        for (const term of solarTermsForYear(sourceYear)) {
            const parts = lunarParts(new Date(Date.UTC(sourceYear, term.month - 1, term.day)));
            if (parts.relatedYear !== year) continue;
            const monthId = monthIds.get(parts.month);
            if (monthId) result.push({ name: term.name, monthId, day: parts.day });
        }
    }
    return result;
}

export function importRealLunarYear(year, { includeSolarTerms = false } = {}) {
    const sourceYear = assertImportYear(year);
    const { order, lengths } = scanLunarMonths(sourceYear);
    const regularNames = order.filter(name => !name.startsWith('闰'));
    const template = createTraditionalFictionalMonths();
    if (regularNames.length !== 12 || template.some(month => !lengths.has(month.name))) {
        throw new Error(`${sourceYear} 年的农历大小月数据不完整。`);
    }
    const months = template.map(month => ({ ...month, days: lengths.get(month.name) }));
    const leapName = order.find(name => name.startsWith('闰')) ?? null;
    const leapBaseName = leapName?.slice(1) ?? null;
    const afterMonth = leapBaseName ? template.findIndex(month => month.name === leapBaseName) + 1 : 0;
    const leapMonth = leapName && afterMonth > 0 ? { afterMonth, days: lengths.get(leapName) } : null;
    return {
        id: `real-${sourceYear}`,
        name: `参考 ${sourceYear} 年农历`,
        months,
        leapMonth,
        solarTerms: includeSolarTerms ? importedSolarTerms(sourceYear, months, leapMonth) : [],
        sourceYear,
    };
}

export function importRealLunarYearRange(startYear, endYear, options) {
    const start = assertImportYear(startYear);
    const end = assertImportYear(endYear);
    if (end < start) throw new Error('导入结束年份不能早于起始年份。');
    if (end - start > 19) throw new Error('一次最多导入 20 个现实年份。');
    return Array.from({ length: end - start + 1 }, (_, index) => importRealLunarYear(start + index, options));
}
