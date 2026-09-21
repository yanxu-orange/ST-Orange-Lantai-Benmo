const CALENDAR_TYPES = new Set(['modern', 'fictional', 'custom']);
const TRADITIONAL_MONTH_NAMES = Object.freeze([
    '正月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '冬月', '腊月',
]);

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) throw new Error(`${label}必须是正整数。`);
    return number;
}

function normalizeMonth(item, index, { custom = false } = {}) {
    const name = text(item?.name);
    if (!name) throw new Error(`第 ${index + 1} 个月份需要名称。`);
    const days = positiveInteger(item?.days, `${name}的天数`);
    if (custom && days > 99) throw new Error('自定义历法的每月天数需在 1–99 之间。');
    if (!custom && ![29, 30].includes(days)) throw new Error('架空王朝历法的每月只能选择大月或小月。');
    return { id: text(item?.id) || `month-${index + 1}`, name, days };
}

function normalizeMonths(items, options) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('请至少配置一个月份。');
    if (options?.custom && items.length > 24) throw new Error('自定义历法一年最多包含 24 个月份。');
    const months = items.map((item, index) => normalizeMonth(item, index, options));
    const names = months.map(item => item.name.toLocaleLowerCase());
    if (new Set(names).size !== names.length) throw new Error('月份名称不能重复。');
    return months;
}

function normalizeHolidaySettings(type, input = {}) {
    return {
        reminderTemplateIds: [...new Set((Array.isArray(input?.reminderTemplateIds) ? input.reminderTemplateIds : [])
            .map(String).map(item => item.trim()).filter(Boolean))],
        showHolidays: input?.showHolidays !== false,
        showSolarTerms: input?.showSolarTerms !== false,
    };
}

function normalizeLeapMonth(input) {
    if (input === null || input === undefined || input === false) return null;
    const afterMonth = positiveInteger(input?.afterMonth, '闰月位置');
    if (afterMonth > 12) throw new Error('闰月只能放在正月至腊月之后。');
    const days = positiveInteger(input?.days, '闰月天数');
    if (![29, 30].includes(days)) throw new Error('闰月天数只能是 29 或 30。');
    return { afterMonth, days };
}

function normalizeSolarTerms(items, monthDays) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
        const name = text(item?.name);
        const monthId = text(item?.monthId);
        const day = positiveInteger(item?.day, `第 ${index + 1} 个节气日期`);
        if (!name) throw new Error(`第 ${index + 1} 个节气需要名称。`);
        if (!monthDays.has(monthId)) throw new Error(`${name}所在月份不存在。`);
        if (day > monthDays.get(monthId)) throw new Error(`${name}的日期超出所在月份。`);
        return { name, monthId, day };
    });
}

function normalizeFictionalScheme(item, index) {
    const id = text(item?.id) || `scheme-${index + 1}`;
    const months = normalizeMonths(item?.months, { custom: false });
    if (months.length !== 12) throw new Error('架空王朝历法的每套年份规则必须包含十二个月。');
    const leapMonth = normalizeLeapMonth(item?.leapMonth);
    const monthDays = new Map(months.map(month => [month.id, month.days]));
    if (leapMonth) monthDays.set(`leap-month-${leapMonth.afterMonth}`, leapMonth.days);
    return {
        id,
        name: text(item?.name),
        months,
        leapMonth,
        solarTerms: normalizeSolarTerms(item?.solarTerms, monthDays),
        sourceYear: Number.isInteger(Number(item?.sourceYear)) ? Number(item.sourceYear) : null,
    };
}

function normalizeFictionalConfig(config = {}) {
    const sourceSchemes = Array.isArray(config.schemes) && config.schemes.length
        ? config.schemes
        : [{ id: 'scheme-1', name: '默认方案', months: config.months, leapMonth: config.leapMonth, solarTerms: config.solarTerms }];
    const schemes = sourceSchemes.map(normalizeFictionalScheme);
    const ids = schemes.map(item => item.id);
    if (new Set(ids).size !== ids.length) throw new Error('年份规则 ID 不能重复。');
    const defaultSchemeId = ids.includes(text(config.defaultSchemeId)) ? text(config.defaultSchemeId) : ids[0];
    const requestedOrder = Array.isArray(config.cycle?.schemeIds) ? config.cycle.schemeIds.map(text) : ids;
    const schemeIds = requestedOrder.filter((id, index) => ids.includes(id) && requestedOrder.indexOf(id) === index);
    for (const id of ids) if (!schemeIds.includes(id)) schemeIds.push(id);
    return {
        schemes,
        months: schemes.find(item => item.id === defaultSchemeId)?.months ?? schemes[0].months,
        defaultSchemeId,
        cycle: {
            enabled: Boolean(config.cycle?.enabled),
            anchorYear: positiveInteger(config.cycle?.anchorYear ?? 1, '年份循环起点'),
            schemeIds,
        },
        weekColumns: 7,
    };
}

export function createTraditionalFictionalMonths(days = []) {
    return TRADITIONAL_MONTH_NAMES.map((name, index) => ({
        id: `month-${index + 1}`,
        name,
        days: days[index] ?? (index % 2 === 0 ? 30 : 29),
    }));
}

export function normalizeCalendarDefinition(input, { idFactory, now = () => new Date().toISOString() } = {}) {
    const type = text(input?.type);
    if (!CALENDAR_TYPES.has(type)) throw new Error('历法类型不可用。');
    const id = text(input?.id) || idFactory?.();
    if (!id) throw new Error('历法 ID 不可用。');
    const at = typeof now === 'function' ? now() : String(now);
    const common = {
        id,
        type,
        name: text(input?.name) || ({ modern: '现代日历', fictional: '架空王朝历法', custom: '自定义历法' }[type]),
        createdAt: text(input?.createdAt) || at,
        updatedAt: at,
    };
    if (type === 'modern') {
        return {
            ...common,
            config: {
                lunarOverlayEnabled: input?.config?.lunarOverlayEnabled !== false,
                offlineOverlayRange: { startYear: 1949, endYear: 2036 },
                holidaySettings: normalizeHolidaySettings(type, input?.config?.holidaySettings),
            },
        };
    }
    if (type === 'fictional') {
        return {
            ...common,
            config: {
                ...normalizeFictionalConfig(input?.config),
                holidaySettings: normalizeHolidaySettings(type, input?.config?.holidaySettings),
            },
        };
    }
    return {
        ...common,
        config: {
            months: normalizeMonths(input?.config?.months, { custom: true }),
            weekColumns: 7,
            holidaySettings: normalizeHolidaySettings(type, input?.config?.holidaySettings),
        },
    };
}

export function resolveFictionalYearScheme(calendar, year) {
    if (calendar?.type !== 'fictional') return null;
    const normalizedYear = positiveInteger(year, '年份');
    const schemes = calendar.config?.schemes ?? [];
    if (!schemes.length) throw new Error('架空王朝历法还没有年份规则。');
    if (!calendar.config?.cycle?.enabled) {
        return schemes.find(item => item.id === calendar.config.defaultSchemeId) ?? schemes[0];
    }
    const order = calendar.config.cycle.schemeIds
        .map(id => schemes.find(item => item.id === id))
        .filter(Boolean);
    if (!order.length) return schemes[0];
    const offset = ((normalizedYear - calendar.config.cycle.anchorYear) % order.length + order.length) % order.length;
    return order[offset];
}

export function monthsInCalendarYear(calendar, year) {
    if (calendar?.type !== 'fictional') return calendar?.config?.months ?? [];
    const scheme = resolveFictionalYearScheme(calendar, year);
    const months = scheme.months.map((month, index) => ({ ...month, ordinal: index + 1, isLeap: false }));
    if (!scheme.leapMonth) return months;
    const { afterMonth, days } = scheme.leapMonth;
    months.splice(afterMonth, 0, {
        id: `leap-month-${afterMonth}`,
        name: `闰${scheme.months[afterMonth - 1].name}`,
        days,
        ordinal: afterMonth,
        isLeap: true,
    });
    return months;
}

export function daysInCalendarMonth(calendar, year, month) {
    const normalizedYear = positiveInteger(year, '年份');
    const normalizedMonth = positiveInteger(month, '月份');
    if (calendar?.type === 'modern') {
        if (normalizedMonth > 12) throw new Error('月份超出范围。');
        return new Date(Date.UTC(normalizedYear, normalizedMonth, 0)).getUTCDate();
    }
    const months = monthsInCalendarYear(calendar, normalizedYear);
    if (normalizedMonth > months.length) throw new Error('月份超出范围。');
    return months[normalizedMonth - 1].days;
}

export function normalizeCalendarDate(calendar, input) {
    const year = positiveInteger(input?.year, '年份');
    const month = positiveInteger(input?.month, '月份');
    const day = positiveInteger(input?.day, '日期');
    if (day > daysInCalendarMonth(calendar, year, month)) throw new Error('日期超出当月范围。');
    return { calendarId: calendar.id, year, month, day };
}

export function shiftCalendarDays(calendar, input, amount) {
    if (!Number.isInteger(amount)) throw new Error('日期偏移量必须是整数。');
    const date = normalizeCalendarDate(calendar, input);
    if (calendar.type === 'modern') {
        const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
        if (shifted.getUTCFullYear() < 1) return null;
        return { calendarId: calendar.id, year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
    }
    let result = { ...date };
    let remaining = Math.abs(amount);
    const direction = Math.sign(amount);
    while (remaining > 0) {
        if (direction > 0) {
            const monthDays = daysInCalendarMonth(calendar, result.year, result.month);
            if (result.day < monthDays) result.day += 1;
            else if (result.month < monthsInCalendarYear(calendar, result.year).length) { result.month += 1; result.day = 1; }
            else { result.year += 1; result.month = 1; result.day = 1; }
        } else if (result.day > 1) result.day -= 1;
        else if (result.month > 1) { result.month -= 1; result.day = daysInCalendarMonth(calendar, result.year, result.month); }
        else {
            if (result.year === 1) return null;
            result.year -= 1; result.month = monthsInCalendarYear(calendar, result.year).length;
            result.day = daysInCalendarMonth(calendar, result.year, result.month);
        }
        remaining -= 1;
    }
    return result;
}

export function compareCalendarDates(left, right) {
    if (!left || !right || left.calendarId !== right.calendarId) return null;
    for (const key of ['year', 'month', 'day']) {
        if (left[key] !== right[key]) return left[key] - right[key];
    }
    return 0;
}

export function calendarDayDistance(calendar, from, to) {
    const start = normalizeCalendarDate(calendar, from);
    const end = normalizeCalendarDate(calendar, to);
    if (calendar.type === 'modern') {
        const startTime = Date.UTC(start.year, start.month - 1, start.day);
        const endTime = Date.UTC(end.year, end.month - 1, end.day);
        return Math.round((endTime - startTime) / 86400000);
    }
    const ordinal = date => {
        let total = 0;
        for (let year = 1; year < date.year; year += 1) {
            total += monthsInCalendarYear(calendar, year).reduce((sum, month) => sum + month.days, 0);
        }
        const months = monthsInCalendarYear(calendar, date.year);
        total += months.slice(0, date.month - 1).reduce((sum, month) => sum + month.days, 0);
        return total + date.day - 1;
    };
    return ordinal(end) - ordinal(start);
}
