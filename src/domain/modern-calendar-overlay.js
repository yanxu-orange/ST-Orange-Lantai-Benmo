const START_YEAR = 1949;
const END_YEAR = 2036;
const DAY_NAMES = Object.freeze(['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']);
const SOLAR_TERM_NAMES = Object.freeze(['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至']);
const SOLAR_TERM_MINUTES = Object.freeze([0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758]);
const LUNAR_MONTHS = Object.freeze({
    '正月': 1, '一月': 1, '二月': 2, '三月': 3, '四月': 4, '五月': 5, '六月': 6,
    '七月': 7, '八月': 8, '九月': 9, '十月': 10, '十一月': 11, '冬月': 11, '十二月': 12, '腊月': 12,
});

function available(year) {
    return Number.isInteger(year) && year >= START_YEAR && year <= END_YEAR;
}

function lunarParts(date) {
    try {
        const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
            month: 'long', day: 'numeric', timeZone: 'UTC',
        });
        const parts = Object.fromEntries(formatter.formatToParts(date).map(item => [item.type, item.value]));
        const day = Number(parts.day);
        if (!parts.month || !Number.isInteger(day) || day < 1 || day > 30) return null;
        const dayLabel = DAY_NAMES[day - 1];
        const leap = parts.month.startsWith('闰');
        const monthName = leap ? parts.month.slice(1) : parts.month;
        return {
            month: parts.month,
            monthNumber: LUNAR_MONTHS[monthName] ?? null,
            leap,
            day,
            label: day === 1 ? parts.month : dayLabel,
            fullLabel: `${parts.month}${dayLabel}`,
        };
    } catch {
        return null;
    }
}

export function solarTermsForYear(year) {
    if (!available(year)) return [];
    return SOLAR_TERM_MINUTES.map((minutes, index) => {
        const instant = new Date(31556925974.7 * (year - 1900) + minutes * 60000 + Date.UTC(1900, 0, 6, 2, 5));
        return { name: SOLAR_TERM_NAMES[index], month: instant.getUTCMonth() + 1, day: instant.getUTCDate() };
    });
}

export function modernCalendarOverlay(year, month, day) {
    if (!available(year)) return { available: false, lunar: null, solarTerm: null };
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
        throw new Error('公历日期不合法。');
    }
    const solarTerm = solarTermsForYear(year).find(item => item.month === month && item.day === day)?.name ?? null;
    return { available: true, lunar: lunarParts(date), solarTerm };
}

export const MODERN_CALENDAR_OVERLAY_RANGE = Object.freeze({ startYear: START_YEAR, endYear: END_YEAR });
