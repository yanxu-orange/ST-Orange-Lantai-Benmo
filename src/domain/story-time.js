const PRECISION_RANK = Object.freeze({ year: 1, month: 2, day: 3, shichen: 4, hour: 4, minute: 5 });

const SHICHEN_HOURS = Object.freeze({
    子: 23, 丑: 1, 寅: 3, 卯: 5, 辰: 7, 巳: 9,
    午: 11, 未: 13, 申: 15, 酉: 17, 戌: 19, 亥: 21,
});

const CHINESE_DIGITS = Object.freeze({
    零: 0, 〇: 0, 元: 1, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
});

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function parseNumeral(value) {
    const text = cleanText(String(value ?? ''));
    if (!text) return null;
    if (/^\d+$/.test(text)) return Number(text);
    if ([...text].every(char => Object.hasOwn(CHINESE_DIGITS, char))) {
        return Number([...text].map(char => CHINESE_DIGITS[char]).join(''));
    }
    const tenAt = text.indexOf('十');
    if (tenAt >= 0) {
        const tens = tenAt === 0 ? 1 : CHINESE_DIGITS[text[tenAt - 1]];
        const units = tenAt === text.length - 1 ? 0 : CHINESE_DIGITS[text[tenAt + 1]];
        return Number.isInteger(tens) && Number.isInteger(units) ? (tens * 10) + units : null;
    }
    return null;
}

function parseTraditionalMonth(value) {
    const token = cleanText(value);
    if (!token) return { month: null, isLeapMonth: false };
    const isLeapMonth = token.startsWith('闰');
    const raw = isLeapMonth ? token.slice(1) : token;
    const named = { 正: 1, 冬: 11, 腊: 12 }[raw];
    return { month: named ?? parseNumeral(raw), isLeapMonth };
}

function parseTraditionalDay(value) {
    const token = cleanText(value);
    if (!token) return null;
    if (token.startsWith('初')) return parseNumeral(token.slice(1));
    if (token.startsWith('廿')) {
        const unit = parseNumeral(token.slice(1));
        return Number.isInteger(unit) ? 20 + unit : 20;
    }
    return parseNumeral(token);
}

function precisionFor(value, explicitTimePrecision) {
    if (explicitTimePrecision) return explicitTimePrecision;
    if (value.day !== null) return 'day';
    if (value.month !== null) return 'month';
    return 'year';
}

function parseClock(text) {
    const clock = text.match(/(?:^|\s)(\d{1,2})(?::|\uff1a)(\d{1,2})(?:\s|$)/);
    if (clock) {
        const hour = Number(clock[1]);
        const minute = Number(clock[2]);
        if (hour <= 23 && minute <= 59) return { hour, minute, precision: 'minute' };
    }
    const hourOnly = text.match(/(?:^|\s)(\d{1,2})\s*时(?:\s|$)/);
    if (hourOnly && Number(hourOnly[1]) <= 23) return { hour: Number(hourOnly[1]), minute: null, precision: 'hour' };
    const shichen = text.match(/([子丑寅卯辰巳午未申酉戌亥])(?:时|初刻|正刻)/);
    if (shichen) return { hour: SHICHEN_HOURS[shichen[1]], minute: null, precision: 'shichen', shichen: shichen[1] };
    return { hour: null, minute: null, precision: null };
}

function validParts(value) {
    if (!Number.isInteger(value.year) || value.year < 1) return false;
    if (value.month !== null && (!Number.isInteger(value.month) || value.month < 1 || value.month > 12)) return false;
    if (value.day !== null && (!Number.isInteger(value.day) || value.day < 1 || value.day > 31)) return false;
    if (value.calendar === 'gregorian' && value.month !== null && value.day !== null) {
        const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
        if (date.getUTCFullYear() !== value.year || date.getUTCMonth() + 1 !== value.month || date.getUTCDate() !== value.day) return false;
    }
    return true;
}

export function eraYearOffset(eraName, eras = []) {
    let offset = 0;
    for (const era of eras) {
        if (era?.name === eraName) return offset;
        if (!Number.isInteger(era?.endYear) || era.endYear < 1) return null;
        offset += era.endYear;
    }
    return null;
}

export function comparableYear(value, fictionalCalendar = {}) {
    if (!value || !Number.isInteger(value.year)) return null;
    if (value.calendar === 'gregorian') return value.year;
    if (value.calendar !== 'era') return null;
    const offset = eraYearOffset(value.era, fictionalCalendar?.eras);
    return offset === null ? null : offset + value.year;
}

export function shiftStoryYears(value, amount, fictionalCalendar = {}) {
    if (!value || !Number.isInteger(amount)) return null;
    if (value.calendar === 'gregorian') {
        const year = value.year + amount;
        if (year < 1) return null;
        if (value.month === null || value.day === null) return { ...value, year };
        const maxDay = new Date(Date.UTC(year, value.month, 0)).getUTCDate();
        return { ...value, year, day: Math.min(value.day, maxDay) };
    }
    if (value.calendar !== 'era') return null;
    const eras = fictionalCalendar?.eras ?? [];
    const ordinal = comparableYear(value, fictionalCalendar);
    if (ordinal === null) {
        const year = value.year + amount;
        return year >= 1 ? { ...value, year } : null;
    }
    const target = ordinal + amount;
    if (target < 1) return null;
    let offset = 0;
    for (let index = 0; index < eras.length; index += 1) {
        const era = eras[index];
        const isCurrent = index === eras.length - 1;
        if (isCurrent || target <= offset + era.endYear) {
            return { ...value, era: era.name, year: target - offset };
        }
        offset += era.endYear;
    }
    return null;
}

export function shiftStoryMonths(value, amount, fictionalCalendar = {}) {
    if (!value || !Number.isInteger(amount) || value.month === null) return null;
    const zeroBased = (value.month - 1) + amount;
    const yearDelta = Math.floor(zeroBased / 12);
    const month = ((zeroBased % 12) + 12) % 12 + 1;
    const shiftedYear = shiftStoryYears(value, yearDelta, fictionalCalendar);
    if (!shiftedYear) return null;
    if (value.calendar !== 'gregorian' || value.day === null) return { ...shiftedYear, month };
    const maxDay = new Date(Date.UTC(shiftedYear.year, month, 0)).getUTCDate();
    return { ...shiftedYear, month, day: Math.min(value.day, maxDay) };
}

export function shiftStoryDays(value, amount, fictionalCalendar = {}) {
    if (!value || !Number.isInteger(amount) || value.month === null || value.day === null) return null;
    if (value.calendar === 'gregorian') {
        const date = new Date(Date.UTC(value.year, value.month - 1, value.day + amount));
        if (date.getUTCFullYear() < 1) return null;
        return {
            ...value,
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
        };
    }
    if (value.calendar !== 'era') return null;
    const anchorYear = 2000;
    const date = new Date(Date.UTC(anchorYear, value.month - 1, value.day + amount));
    const shiftedYear = shiftStoryYears(value, date.getUTCFullYear() - anchorYear, fictionalCalendar);
    return shiftedYear ? {
        ...shiftedYear,
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    } : null;
}

export function timeSortKey(value, fictionalCalendar = {}) {
    if (!value) return null;
    const year = comparableYear(value, fictionalCalendar);
    const prefix = value.calendar === 'gregorian' ? 'G' : (year === null ? `E:${value.era ?? ''}` : 'F');
    const yearPart = year ?? value.year;
    const monthPart = value.month === null ? 0 : (value.calendar === 'era' ? (value.month * 2) + (value.isLeapMonth ? 1 : 0) : value.month);
    return `${prefix}:${String(yearPart).padStart(8, '0')}-${String(monthPart).padStart(2, '0')}-${String(value.day ?? 0).padStart(2, '0')}T${String(value.hour ?? 0).padStart(2, '0')}:${String(value.minute ?? 0).padStart(2, '0')}`;
}

export function parseStoryTimeValue(raw, { fictionalCalendar = {} } = {}) {
    const text = cleanText(raw);
    if (!text) return null;
    const clock = parseClock(text);
    const gregorian = text.match(/(?:公元\s*)?(\d{3,4})\s*(?:[\/.\-] ?|\u5e74\s*)(\d{1,2})(?:\s*(?:[\/.\-] ?|\u6708\s*))(\d{1,2})\s*日?/);
    if (gregorian) {
        const value = {
            calendar: 'gregorian', era: null,
            year: Number(gregorian[1]), month: Number(gregorian[2]), day: Number(gregorian[3]),
            hour: clock.hour, minute: clock.minute, shichen: clock.shichen ?? null,
        };
        if (!validParts(value)) return null;
        value.precision = precisionFor(value, clock.precision);
        return value;
    }
    const yearMonth = text.match(/(?:公元\s*)?(\d{3,4})\s*年(?:\s*(\d{1,2})\s*月)?/);
    if (yearMonth) {
        const value = {
            calendar: 'gregorian', era: null,
            year: Number(yearMonth[1]), month: yearMonth[2] ? Number(yearMonth[2]) : null, day: null,
            hour: null, minute: null, shichen: null,
        };
        if (!validParts(value)) return null;
        value.precision = precisionFor(value, null);
        return value;
    }
    const numeral = '[\\d零〇元一二两三四五六七八九十]+';
    const traditionalMonth = `(?:闰)?(?:正|冬|腊|${numeral})`;
    const traditionalDay = `(?:初|廿)?${numeral}`;
    const configuredEras = (fictionalCalendar?.eras ?? []).map(item => String(item?.name ?? '').trim()).filter(Boolean);
    const eraNamePattern = configuredEras.length
        ? configuredEras.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
        : '[^\\s，。：:;；数|<>]{1,12}?';
    const eraPattern = new RegExp(`(${eraNamePattern})\\s*(${numeral})\\s*年(?:\\s*(${traditionalMonth})\\s*月)?(?:\\s*(${traditionalDay})\\s*[日号]?)?`);
    const eraMatch = text.match(eraPattern);
    if (eraMatch) {
        const parsedMonth = parseTraditionalMonth(eraMatch[3]);
        const value = {
            calendar: 'era', era: eraMatch[1],
            year: parseNumeral(eraMatch[2]), month: parsedMonth.month,
            day: parseTraditionalDay(eraMatch[4]), isLeapMonth: parsedMonth.isLeapMonth,
            hour: clock.hour, minute: clock.minute, shichen: clock.shichen ?? null,
        };
        if (!validParts(value)) return null;
        value.precision = precisionFor(value, clock.precision);
        return value;
    }
    return null;
}

export function parseStoryTimePoint(raw, options = {}) {
    const text = cleanText(raw);
    const value = parseStoryTimeValue(text, options);
    return {
        raw: text,
        status: value ? 'parsed' : 'pending',
        value,
        sortKey: value ? timeSortKey(value, options.fictionalCalendar) : null,
    };
}

export function compareTimeValues(left, right, fictionalCalendar = {}) {
    if (!left || !right || left.calendar !== right.calendar) return null;
    const leftYear = comparableYear(left, fictionalCalendar);
    const rightYear = comparableYear(right, fictionalCalendar);
    if (leftYear === null || rightYear === null) {
        if (left?.calendar !== right?.calendar || left?.era !== right?.era) return null;
    }
    const leftMonth = left.month === null ? 0 : (left.calendar === 'era' ? (left.month * 2) + (left.isLeapMonth ? 1 : 0) : left.month);
    const rightMonth = right.month === null ? 0 : (right.calendar === 'era' ? (right.month * 2) + (right.isLeapMonth ? 1 : 0) : right.month);
    const partsLeft = [leftYear ?? left.year, leftMonth, left.day ?? 0, left.hour ?? 0, left.minute ?? 0];
    const partsRight = [rightYear ?? right.year, rightMonth, right.day ?? 0, right.hour ?? 0, right.minute ?? 0];
    for (let index = 0; index < partsLeft.length; index += 1) {
        if (partsLeft[index] !== partsRight[index]) return partsLeft[index] - partsRight[index];
    }
    return 0;
}

export function timePrecisionRank(value) {
    return PRECISION_RANK[value?.precision] ?? 0;
}

export function displayStructuredTime(point) {
    if (!point?.value) return '待时间解析';
    const value = point.value;
    const calendar = value.calendar === 'era' ? `${value.era}${value.year}年` : `${value.year}年`;
    const date = `${value.month ? `${value.isLeapMonth ? '闰' : ''}${value.month}月` : ''}${value.day ? `${value.day}日` : ''}`;
    const time = value.shichen ? `${value.shichen}时` : (value.hour !== null ? `${String(value.hour).padStart(2, '0')}:${String(value.minute ?? 0).padStart(2, '0')}` : '');
    return `${calendar}${date}${time ? ` ${time}` : ''}（${value.precision}）`;
}

export function formatStoryTimeValue(value) {
    if (!value) return '';
    const year = value.calendar === 'era' ? `${value.era}${value.year}年` : `${value.year}年`;
    const date = `${value.month !== null ? `${value.isLeapMonth ? '闰' : ''}${value.month}月` : ''}${value.day !== null ? `${value.day}日` : ''}`;
    const time = value.shichen
        ? `${value.shichen}时`
        : (value.hour !== null ? `${String(value.hour).padStart(2, '0')}:${String(value.minute ?? 0).padStart(2, '0')}` : '');
    return `${year}${date}${time ? ` ${time}` : ''}`;
}

const NON_CURRENT_CONTEXT = /(如果|假如|假设|倘若|梦里|梦中|梦见|回忆|回想|想起|记得|曾经|过去|此前|当年|档案|资料|记录显示|计划|打算|准备在|将于|预定|预计)/;
const DURATION_CONTEXT = /(历时|持续|长达|耗时|用了|用时|已经|已有|经历了?|相识了?|交往了?|算计了?|整整|多年|年之久|年来|年间)/;
const STATUS_CONTEXT = /(当前|现在|今日|今天|故事时间|剧情时间|日期|时间[:：]|地点[:：]|天气[:：]|场景[:：]|氛围[:：]|\|{2,}|<\/?(?:title|header|summary)\b)/i;

function safeStoryTimeSegments(text) {
    const prepared = String(text ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|section|header|footer|title|summary|li|h[1-6])\s*>/gi, '\n');
    return prepared
        .split(/\r?\n|(?<=[。！？!?])\s*/)
        .map(raw => ({
            raw: raw.trim(),
            text: raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(),
        }))
        .filter(item => item.text && !NON_CURRENT_CONTEXT.test(item.text));
}

function pointFromValue(value, options) {
    const raw = formatStoryTimeValue(value);
    return { ...parseStoryTimePoint(raw, options), raw };
}

function currentStoryTimeValue(currentStoryTime, options) {
    if (currentStoryTime?.value && validParts(currentStoryTime.value)) return currentStoryTime.value;
    const raw = typeof currentStoryTime === 'string' ? currentStoryTime : currentStoryTime?.raw;
    return raw ? parseStoryTimeValue(raw, options) : null;
}

function findStoryDateRangeSeparator(text) {
    const candidates = [];
    const addMatch = (match, offset = 0, length = match?.[0]?.length, token = match?.[0]) => {
        if (match) candidates.push({ index: match.index + offset, length, token });
    };
    addMatch(/[—–~～]/.exec(text));
    addMatch(/--/.exec(text));
    const datedClockRange = /(?:\d{3,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{3,4}[/.]\d{1,2}[/.]\d{1,2})[^\n]{0,24}?\d{1,2}(?::|：)\d{1,2}\s*(-)\s*(?=(?:\d{3,4}\s*年\s*)?\d{1,2}\s*(?:月|[/.])\s*\d{1,2}\s*[日号]?\s+\d{1,2}(?::|：)\d{1,2})/.exec(text);
    if (datedClockRange) {
        const dashAt = datedClockRange[0].lastIndexOf('-');
        addMatch(datedClockRange, dashAt, 1, '-');
    }
    const clockRange = /\d{1,2}(?::|：)\d{1,2}\s*(-)\s*(?=\d{1,2}(?::|：)\d{1,2})/.exec(text);
    if (clockRange) {
        const dashAt = clockRange[0].lastIndexOf('-');
        addMatch(clockRange, dashAt, 1, '-');
    }
    const chineseRange = /(?:[日号月]|\d{1,2}[/.]\d{1,2}|\d{4}-\d{1,2}-\d{1,2})\s*[至到]\s*(?=(?:\d{3,4}\s*年|\d{1,2}\s*(?:月|[/.]|[日号])|[^\s，。：:;；数|<>]{1,12}\s*[\d零〇元一二两三四五六七八九十]+\s*年|(?:闰)?(?:正|冬|腊|[零〇元一二两三四五六七八九十]+)\s*月|(?:初|廿)?[零〇元一二两三四五六七八九十]+\s*[日号]|待定|未知))/.exec(text)
        ?? /[子丑寅卯辰巳午未申酉戌亥](?:时|初刻|正刻)\s*[至到]\s*(?=[子丑寅卯辰巳午未申酉戌亥](?:时|初刻|正刻))/.exec(text);
    if (chineseRange) {
        const separatorAt = chineseRange[0].search(/[至到]/);
        addMatch(chineseRange, separatorAt, 1, chineseRange[0][separatorAt]);
    }
    const spacedDash = /\s+-\s+/.exec(text);
    if (spacedDash) addMatch(spacedDash, 0, spacedDash[0].length, '-');
    const chinese = /[日号]\s*-\s*(?=(?:\d{3,4}\s*年|\d{1,2}\s*月|\d{1,2}\s*[日号]))/.exec(text);
    if (chinese) {
        const dashAt = chinese[0].indexOf('-');
        addMatch(chinese, dashAt, 1, '-');
    }
    for (const pattern of [
        /\d{1,2}[/.]\d{1,2}\s*-\s*(?=\d{1,2}[/.]\d{1,2}(?![/.]\d))/,
        /\d{4}-\d{1,2}-\d{1,2}\s*-\s*(?=\d{4}-\d{1,2}-\d{1,2})/,
    ]) {
        const match = pattern.exec(text);
        if (!match) continue;
        const dashAt = match[0].lastIndexOf('-');
        addMatch(match, dashAt, 1, '-');
    }
    return candidates.sort((left, right) => left.index - right.index)[0] ?? null;
}

function parseRangeDateFragment(text, context, options) {
    if (!context) return null;
    const fragment = cleanText(text).replace(/^(?:当前)?(?:故事|剧情)?(?:时间|日期)\s*[:：]\s*/, '');
    if (context.calendar === 'gregorian') {
        const clockOnly = fragment.match(/^(\d{1,2})(?::|：)(\d{1,2})(?:\s|$)/);
        if (clockOnly && context.month !== null && context.day !== null) {
            return parseStoryTimeValue(`${context.year}年${context.month}月${context.day}日 ${clockOnly[1]}:${clockOnly[2]}`, options);
        }
        const monthDay = fragment.match(/^(\d{1,2})\s*(?:月|[/.])\s*(\d{1,2})\s*[日号]?/);
        if (monthDay) return parseStoryTimeValue(`${context.year}年${monthDay[1]}月${monthDay[2]}日${fragment.slice(monthDay[0].length)}`, options);
        const month = fragment.match(/^(\d{1,2})\s*月/);
        if (month) return parseStoryTimeValue(`${context.year}年${fragment}`, options);
        const day = fragment.match(/^(\d{1,2})\s*[日号]/);
        if (day && context.month !== null) {
            return parseStoryTimeValue(`${context.year}年${context.month}月${day[1]}日${fragment.slice(day[0].length)}`, options);
        }
        return null;
    }
    if (context.calendar !== 'era') return null;
    const clockOnly = fragment.match(/^(\d{1,2})(?::|：)(\d{1,2})(?:\s|$)/);
    if (clockOnly && context.month !== null && context.day !== null) {
        const month = `${context.isLeapMonth ? '闰' : ''}${context.month}月`;
        return parseStoryTimeValue(`${context.era}${context.year}年${month}${context.day}日 ${clockOnly[1]}:${clockOnly[2]}`, options);
    }
    const numeral = '[\\d零〇元一二两三四五六七八九十]+';
    const monthDay = fragment.match(new RegExp(`^((?:闰)?(?:正|冬|腊|${numeral}))\\s*月\\s*((?:初|廿)?${numeral})\\s*[日号]?`));
    if (monthDay) return parseStoryTimeValue(`${context.era}${context.year}年${fragment}`, options);
    const day = fragment.match(new RegExp(`^((?:初|廿)?${numeral})\\s*[日号]`));
    if (day && context.month !== null) {
        const month = `${context.isLeapMonth ? '闰' : ''}${context.month}月`;
        return parseStoryTimeValue(`${context.era}${context.year}年${month}${fragment}`, options);
    }
    return null;
}

export function pointFromRangeEnd(text, options = {}) {
    const normalized = String(text ?? '').replace(/^\s*(?:\|{2,}|[#>*_`]+)\s*/, '');
    const separator = findStoryDateRangeSeparator(normalized);
    if (!separator) {
        const value = parseStoryTimeValue(normalized, options);
        return value ? pointFromValue(value, options) : null;
    }
    const leftText = normalized.slice(0, separator.index).trim();
    const rightText = normalized.slice(separator.index + separator.length).trim();
    const currentValue = currentStoryTimeValue(options.currentStoryTime, options);
    const rangeStart = parseStoryTimeValue(leftText, options)
        ?? parseRangeDateFragment(leftText, currentValue, options);
    const directEnd = parseStoryTimeValue(rightText, options);
    if (directEnd) {
        if (!rangeStart) return pointFromValue(directEnd, options);
        const order = compareTimeValues(directEnd, rangeStart, options.fictionalCalendar);
        if (order === null) return pointFromValue(directEnd, options);
        return pointFromValue(order >= 0 ? directEnd : rangeStart, options);
    }

    let inheritedEnd = parseRangeDateFragment(rightText, rangeStart, options);
    if (inheritedEnd) {
        if (!rangeStart) return pointFromValue(inheritedEnd, options);
        const endHasExplicitYear = /(?:公元\s*)?\d{3,4}\s*(?:年|[/.\-])/.test(rightText);
        if (!endHasExplicitYear
            && rangeStart.calendar === 'gregorian'
            && inheritedEnd.calendar === 'gregorian'
            && rangeStart.month !== null
            && inheritedEnd.month !== null
            && inheritedEnd.year === rangeStart.year
            && inheritedEnd.month < rangeStart.month) {
            inheritedEnd = shiftStoryYears(inheritedEnd, 1, options.fictionalCalendar) ?? inheritedEnd;
        }
        const order = compareTimeValues(inheritedEnd, rangeStart, options.fictionalCalendar);
        if (order === null) return pointFromValue(inheritedEnd, options);
        return pointFromValue(order >= 0 ? inheritedEnd : rangeStart, options);
    }

    // A time-of-day range can follow one date; it does not replace that date.
    if (rangeStart && /^([子丑寅卯辰巳午未申酉戌亥])(?:时|初刻|正刻)/.test(rightText)) {
        return pointFromValue(rangeStart, options);
    }
    const invalidRangeEnd = /^(?:待定|未知|不详|\d{3,4}\s*年|\d{1,2}\s*(?:月|[/.]|[日号]))/.test(rightText);
    if (rangeStart && /^[—–-]/.test(separator.token) && !invalidRangeEnd) {
        return pointFromValue(rangeStart, options);
    }
    return null;
}

export function extractAbsoluteStoryTime(text, options = {}) {
    const segments = safeStoryTimeSegments(text);
    const candidates = [];
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (DURATION_CONTEXT.test(segment.text)) continue;
        const point = pointFromRangeEnd(segment.text, options);
        if (!point?.value) continue;
        const precision = timePrecisionRank(point.value);
        const statusLike = STATUS_CONTEXT.test(segment.raw);
        let score = precision >= PRECISION_RANK.day ? 70 : (precision === PRECISION_RANK.month ? 30 : 10);
        if (index < 5) score += 35 - (index * 6);
        if (index >= Math.max(0, segments.length - 3)) score += 20;
        if (statusLike) score += 35;
        if (point.value.hour !== null) score += 5;
        candidates.push({ point, score, index });
    }
    const winner = candidates.sort((left, right) => right.score - left.score || left.index - right.index)[0];
    return winner?.score >= 65 ? winner.point : null;
}

export function normalizeStoryTimeExtractionRule(input = {}) {
    const enabled = Boolean(input?.enabled);
    const mode = input?.mode === 'regex' || (!input?.mode && cleanText(input?.pattern)) ? 'regex' : 'markers';
    const markers = (Array.isArray(input?.markers) ? input.markers : [])
        .map(item => {
            const start = cleanText(item?.start);
            let end = cleanText(item?.end);
            if (start && !end) {
                const htmlTag = start.match(/^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>$/);
                end = htmlTag ? `</${htmlTag[1]}>` : start;
            }
            return { name: cleanText(item?.name), start, end };
        })
        .filter(item => item.start || item.end);
    const pattern = cleanText(input?.pattern);
    const flags = cleanText(input?.flags || 'su');
    if (enabled && mode === 'markers' && markers.length === 0) throw new Error('请至少添加一种时间标记。');
    if (markers.some(item => !item.start || !item.end)) throw new Error('时间标记需要同时具备开始标记和结束标记。');
    if (enabled && mode === 'regex' && !pattern) throw new Error('请填写高级时间正则。');
    if (!/^[imsu]*$/.test(flags) || new Set(flags).size !== flags.length) {
        throw new Error('正则标志只支持 i、m、s、u，且不能重复。');
    }
    if (pattern) new RegExp(pattern, flags);
    return { enabled, mode, markers, pattern, flags: flags || 'su' };
}

export function extractStoryTimeByMarkers(text, rule, options = {}) {
    const normalized = normalizeStoryTimeExtractionRule({ ...rule, mode: 'markers' });
    if (!normalized.enabled) return null;
    const source = String(text ?? '');
    for (const marker of normalized.markers) {
        let cursor = 0;
        while (cursor < source.length) {
            const startAt = source.indexOf(marker.start, cursor);
            if (startAt < 0) break;
            const contentAt = startAt + marker.start.length;
            const endAt = source.indexOf(marker.end, contentAt);
            if (endAt < 0) break;
            const point = pointFromRangeEnd(source.slice(contentAt, endAt), options);
            if (point?.value) return point;
            cursor = endAt + marker.end.length;
        }
    }
    return null;
}

export function extractStoryTimeByRule(text, rule, options = {}) {
    const normalized = normalizeStoryTimeExtractionRule(rule);
    if (!normalized.enabled) return null;
    if (normalized.mode === 'markers') return extractStoryTimeByMarkers(text, normalized, options);
    const match = new RegExp(normalized.pattern, normalized.flags).exec(String(text ?? ''));
    if (!match) return null;
    const captured = match.groups?.time || match.slice(1).find(value => typeof value === 'string' && value.trim()) || match[0];
    return pointFromRangeEnd(captured, options);
}

const USER_SET_DATE_PREFIX = /^(?:(?:(?:当前)?(?:时间|剧情|故事)\s*)?(?:来到(?:了)?|到了?|推进到|推进至|进入(?:了)?)\s*|[【\[]?(?:(?:当前)?(?:故事|剧情)?时间|(?:当前)?日期)[】\]]?\s*[:：-]\s*|(?:现在|当前|今日|今天)\s*(?:是|到了?)?\s*)/;

function userAbsoluteTimeIsExplicit(segment) {
    const normalized = cleanText(segment);
    const candidate = normalized.replace(USER_SET_DATE_PREFIX, '');
    if (candidate !== normalized) {
        if (parseStoryTimeValue(candidate)) return true;
        return /^(?:\d{1,2}\s*(?:月|[/.])\s*\d{1,2}\s*[日号]?|\d{1,2}\s*月|\d{1,2}\s*[日号])/.test(candidate);
    }
    if (/^(?:公元\s*)?\d{3,4}\s*(?:年|[/.\-])/.test(normalized)) return true;
    return /^[^\s，。：:;；]{1,12}\s*[零〇元一二两三四五六七八九十]+\s*年/.test(normalized);
}

function userExplicitTimeCandidate(segment) {
    return cleanText(segment).replace(USER_SET_DATE_PREFIX, '');
}

export function extractMessageStoryTime(text, {
    role = 'assistant',
    currentStoryTime = null,
    fictionalCalendar = {},
    extractionRule = null,
} = {}) {
    const options = { fictionalCalendar };
    const currentPoint = currentStoryTime?.value
        ? currentStoryTime
        : (currentStoryTime?.raw ? parseStoryTimePoint(currentStoryTime.raw, options) : null);
    options.currentStoryTime = currentPoint;
    if (role === 'assistant' && extractionRule?.enabled) {
        return extractStoryTimeByRule(text, extractionRule, options);
    }
    if (role === 'assistant') {
        const absolute = extractAbsoluteStoryTime(text, options);
        if (absolute) return absolute;
    }
    const segments = safeStoryTimeSegments(text);
    for (const segment of segments) {
        if (role === 'user' && !userAbsoluteTimeIsExplicit(segment.text)) continue;
        if (role === 'assistant') continue;
        const candidate = userExplicitTimeCandidate(segment.text);
        const point = pointFromRangeEnd(candidate, options);
        if (point) return point;
        const inherited = parseRangeDateFragment(candidate, currentPoint?.value, options);
        if (inherited) return pointFromValue(inherited, options);
    }
    return null;
}
